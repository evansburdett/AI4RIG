/**
 * Two sample cases for the front-end unit tests. Client numbers and initials
 * are invented; the figures on case 1042 come from RIG's workbook.
 *
 * The running app does not use these; it reads the same two cases from the
 * database, loaded by packages/db/seed/0002_sample_cases.sql. Keep the two in
 * step if you change either.
 */

import type { Account, ClientCase } from '../domain/types.js';

/** Three sleeves in bucket order. `[amountDollars, modelId]` for Now, Soon, Later. */
function sleeves(
  now: [number, string | null],
  soon: [number, string | null],
  later: [number, string | null],
): Account['sleeves'] {
  return [
    { bucket: 'NOW', amountCents: now[0] * 100, modelId: now[1] },
    { bucket: 'SOON', amountCents: soon[0] * 100, modelId: soon[1] },
    { bucket: 'LATER', amountCents: later[0] * 100, modelId: later[1] },
  ];
}

/** Buckets land exactly on the workbook's $190,000 / $914,700 / $1,895,300. */
const WORKBOOK_CASE: ClientCase = {
  clientNumber: '1042',
  initials: 'A.B.',
  planNumber: 1,
  people: [
    { role: 'CLIENT', birthYear: 1960, healthConcern: 'NONE', lifeExpectancyAge: 88 },
    { role: 'SPOUSE', birthYear: 1963, healthConcern: 'HEART', lifeExpectancyAge: 85 },
  ],
  moneyCyclePhase: 'DISTRIBUTION',
  lifeStage: 'DISTRIBUTION_GO_GO',
  taxBracketPct: 22,
  accounts: [
    {
      id: '9001',
      accountType: 'JOINT',
      taxFunnel: 'TAXABLE',
      maskedNumber: '4417',
      balanceCents: 1_200_000_00,
      sleeves: sleeves([190_000, '9001'], [400_000, '9002'], [610_000, '9003']),
    },
    {
      id: '9002',
      accountType: 'IRA',
      taxFunnel: 'PRE_TAX',
      maskedNumber: '8830',
      balanceCents: 1_500_000_00,
      sleeves: sleeves([0, null], [514_700, '9002'], [985_300, '9003']),
    },
    {
      id: '9003',
      accountType: 'ROTH_IRA',
      taxFunnel: 'TAX_FREE',
      maskedNumber: '2291',
      balanceCents: 300_000_00,
      sleeves: sleeves([0, null], [0, null], [300_000, '9004']),
    },
  ],
  cashOnHandCents: 85_000_00,
  spareTireCents: 25_000_00,
  nowInputs: {
    monthlyIncomeDrawCents: 5_000_00,
    incomeDrawMonths: 10,
    bankReserveCents: 100_000_00,
    plannedExpenses: [{ id: 'exp-1', label: 'Roof replacement', costCents: 40_000_00 }],
  },
  soonInputs: {
    annualIncomeGapCents: 60_000_00,
    incomeGapYears: 10,
    socialSecurityBridges: [
      { id: 'ss-1', label: 'Client', annualAmountCents: 38_400_00, years: 3, multiplier: 1 },
      { id: 'ss-2', label: 'Spouse', annualAmountCents: 18_000_00, years: 1.5, multiplier: 1 },
    ],
    healthcareGaps: [],
    miscellaneousCosts: [{ id: 'misc-1', label: 'Boat', costCents: 50_000_00 }],
    forcedWithdrawals: [],
    conservativeReserveCents: 100_000_00,
  },
  updatedAt: '2026-09-15T14:02:00.000Z',
};

/**
 * An early accumulator, deliberately off target: $15,000 of the Single
 * account is in no bucket, and the Roth's Soon money has no model.
 */
const ACCUMULATOR_CASE: ClientCase = {
  clientNumber: '2317',
  initials: 'C.D.',
  planNumber: 1,
  people: [{ role: 'CLIENT', birthYear: 1988, healthConcern: 'NONE', lifeExpectancyAge: 90 }],
  moneyCyclePhase: 'ACCUMULATION',
  lifeStage: 'ACCUMULATION_PEAK_EARNINGS',
  taxBracketPct: 32,
  accounts: [
    {
      id: '9004',
      accountType: 'SINGLE',
      taxFunnel: 'TAXABLE',
      maskedNumber: '1005',
      balanceCents: 280_000_00,
      sleeves: sleeves([25_000, '9001'], [0, null], [240_000, '9003']),
    },
    {
      id: '9005',
      accountType: 'ROTH_IRA',
      taxFunnel: 'TAX_FREE',
      maskedNumber: '7742',
      balanceCents: 240_000_00,
      sleeves: sleeves([0, null], [60_000, null], [180_000, '9004']),
    },
  ],
  cashOnHandCents: 40_000_00,
  spareTireCents: 10_000_00,
  nowInputs: {
    monthlyIncomeDrawCents: 0,
    incomeDrawMonths: 12,
    bankReserveCents: 30_000_00,
    plannedExpenses: [],
  },
  soonInputs: {
    annualIncomeGapCents: 0,
    incomeGapYears: 10,
    socialSecurityBridges: [],
    healthcareGaps: [],
    miscellaneousCosts: [],
    forcedWithdrawals: [],
    conservativeReserveCents: 75_000_00,
  },
  updatedAt: '2026-09-11T09:20:00.000Z',
};

export const SAMPLE_CASES: readonly ClientCase[] = [WORKBOOK_CASE, ACCUMULATOR_CASE];
