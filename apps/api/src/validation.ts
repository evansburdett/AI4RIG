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

const holding = z.object({
  id: z.string(),
  tickerSymbol: z.string().trim().toUpperCase().max(10),
  marketValueCents: cents,
  assignedBucket: bucket,
});

const account = z.object({
  id: z.string(),
  accountType: z.enum(ACCOUNT_TYPES),
  // Last four only (ADR 0006). Anything longer is a real account number.
  maskedNumber: z.string().trim().max(4, 'Masked number is the last four digits only'),
  holdings: z.array(holding),
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
