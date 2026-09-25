/**
 * Request body validation. Every write route parses its body through one of
 * these before touching the database, so a bad request is a 400 with a list of
 * what was wrong, never a half-written case or a SQLite CHECK failure.
 *
 * The enum values come from @ai4rig/shared, the same constants the web app
 * uses, so the two sides cannot drift apart.
 */

import {
  ACCOUNT_TYPES,
  ASSET_CLASSES,
  BUCKETS,
  HEALTH_CONCERNS,
  LIFE_STAGES,
  MONEY_CYCLE_PHASES,
  TAX_BRACKETS,
  TAX_FUNNELS,
} from '@ai4rig/shared';
import type { Response } from 'express';
import { z } from 'zod';

/** Money is a whole number of cents (ADR 0004). z.int() also rejects unsafe integers. */
const cents = z.int();

/** Counts of years or months. Not money, so halves are fine. */
const duration = z.number().finite().min(0);

const bucket = z.enum(BUCKETS);

const person = z.object({
  role: z.enum(['CLIENT', 'SPOUSE']),
  birthYear: z.int().min(1900).max(2100).nullable(),
  healthConcern: z.enum(HEALTH_CONCERNS),
  lifeExpectancyAge: z.int().min(0).max(130).nullable(),
});

const taxFunnel = z.enum(TAX_FUNNELS);

/** Database ids travel as strings of digits. */
const rowId = z.string().regex(/^\d+$/, 'Must be the id of an existing row');

const sleeve = z.object({
  bucket,
  amountCents: cents.min(0, 'A bucket amount cannot be negative'),
  modelId: rowId.nullable(),
});

const account = z.object({
  id: z.string(),
  accountType: z.enum(ACCOUNT_TYPES),
  taxFunnel,
  // Last four only (ADR 0006). Anything longer is a real account number.
  maskedNumber: z.string().trim().max(4, 'Masked number is the last four digits only'),
  balanceCents: cents,
  sleeves: z
    .array(sleeve)
    .length(3)
    .refine(
      (sleeves) => sleeves.map((s) => s.bucket).join() === BUCKETS.join(),
      'Sleeves must be exactly Now, Soon, Later, in that order',
    ),
});

const plannedExpense = z.object({
  id: z.string(),
  label: z.string().max(200),
  costCents: cents,
});

const gapEntry = z.object({
  id: z.string(),
  label: z.string().max(200),
  annualAmountCents: cents,
  years: duration,
  multiplier: z.number().finite().positive(),
});

export const clientCaseSchema = z.object({
  clientNumber: z.string().min(1),
  initials: z.string().trim().max(10),
  planNumber: z.int().min(1),
  people: z
    .array(person)
    .max(2)
    .refine(
      (people) => new Set(people.map((p) => p.role)).size === people.length,
      'At most one CLIENT and one SPOUSE',
    ),
  moneyCyclePhase: z.enum(MONEY_CYCLE_PHASES),
  lifeStage: z.enum(LIFE_STAGES),
  taxBracketPct: z
    .int()
    .refine((pct) => (TAX_BRACKETS as readonly number[]).includes(pct), 'Not a federal tax bracket')
    .nullable(),
  accounts: z.array(account),
  cashOnHandCents: cents,
  spareTireCents: cents,
  nowInputs: z.object({
    monthlyIncomeDrawCents: cents,
    incomeDrawMonths: duration,
    bankReserveCents: cents,
    plannedExpenses: z.array(plannedExpense),
  }),
  soonInputs: z.object({
    annualIncomeGapCents: cents,
    incomeGapYears: duration,
    socialSecurityBridges: z.array(gapEntry),
    healthcareGaps: z.array(gapEntry),
    miscellaneousCosts: z.array(plannedExpense),
    forcedWithdrawals: z.array(gapEntry),
    conservativeReserveCents: cents,
  }),
  // Ignored: the server stamps updatedAt on save. Accepted so the client can
  // send back exactly what it received.
  updatedAt: z.string().optional(),
});

export type ClientCaseInput = z.infer<typeof clientCaseSchema>;

export const tickerSchema = z.object({
  symbol: z
    .string()
    .trim()
    .toUpperCase()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9.-]+$/, 'Letters, digits, dots, and dashes only'),
  assetClass: z.enum(ASSET_CLASSES),
  defaultBucket: bucket,
});

export const modelPortfolioSchema = z.object({
  // Ignored on create; checked against the URL on update.
  id: z.string().optional(),
  name: z.string().trim().min(1, 'A model needs a name').max(80),
  bucket,
  taxFunnel: taxFunnel.nullable(),
  lines: z
    .array(
      z.object({
        tickerSymbol: z.string().trim().toUpperCase().min(1).max(10),
        weightBps: z.int().min(1, 'Each weight must be above 0%').max(10_000),
      }),
    )
    .min(1, 'A model needs at least one ticker')
    .refine(
      (lines) => new Set(lines.map((l) => l.tickerSymbol)).size === lines.length,
      'A ticker can appear in a model only once',
    )
    .refine(
      (lines) => lines.reduce((sum, l) => sum + l.weightBps, 0) === 10_000,
      'Weights must add up to exactly 100%',
    ),
});

export type ModelPortfolioInput = z.infer<typeof modelPortfolioSchema>;

export const bucketDefinitionSchema = z.object({
  bucket,
  label: z.string().trim().min(1).max(40),
  horizonMonths: z.int().min(0).max(1200),
  purposeText: z.string().max(2000),
});

export const bucketParam = bucket;

/**
 * Parse `body` or answer 400 with every problem found. Returns null when it
 * has already responded, so a route reads:
 *
 *   const input = parseOr400(schema, req.body, res);
 *   if (input === null) return;
 */
export function parseOr400<S extends z.ZodType>(
  schema: S,
  body: unknown,
  res: Response,
): z.infer<S> | null {
  const result = schema.safeParse(body);
  if (result.success) return result.data;

  res.status(400).json({
    error: 'Invalid request body',
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
  return null;
}
