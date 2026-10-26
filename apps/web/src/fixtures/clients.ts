/**
 * Two sample cases for the front-end unit tests. Client numbers and initials
 * are invented; the figures on case 1042 come from RIG's workbook.
 *
 * The running app does not use these; it reads the same two cases from the
 * database, loaded by packages/db/seed/0003_sample_cases.sql. Keep the two in
 * step if you change either.
 */

import type { AccountLine, ClientCase } from '../domain/types.js';

/** Funds as `[symbol, dollars]`, in display order. */
function funds(...entries: [string, number][]): AccountLine[] {
  return entries.map(([tickerSymbol, dollars]) => ({ tickerSymbol, amountCents: dollars * 100, heldSharesMicros: null }));
}

/**
 * Buckets land exactly on the plan: the workbook's $190,000 Now plus $30,000 of
 * advisory fee cash (US-19: $3,000,000 in all is the 1.00% tier, so $12,000 +
 * $15,000 + $3,000, each held in its own account's Now), $910,200 Soon (the
 * workbook's inputs with RIG's 3% inflation hedge), and $1,869,800 Later.
 */
const WORKBOOK_CASE: ClientCase = {
  clientNumber: '1042',
  initials: 'A.B.',
  planNumber: 1,
  people: [
    {
      role: 'CLIENT',
      birthYear: 1960,
      gender: 'MALE',
      healthConcerns: [],
      healthConcernOther: '',
      lifeExpectancyAge: 88,
      lifeExpectancySource: 'ADVISOR',
    },
    {
      role: 'SPOUSE',
      birthYear: 1963,
      gender: 'FEMALE',
      // Two concerns plus a description, to exercise US-27 on the profile screen.
      healthConcerns: ['HEART', 'OTHER'],
      healthConcernOther: 'Managed hypertension',
      lifeExpectancyAge: 85,
      lifeExpectancySource: 'AI',
    },
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
      proposalShares: [],
      // 1,200,000 less 12,000 fee: picked fund by fund.
      modelId: null,
      lines: funds(
        ['SGOV', 114_000],
        ['BIL', 76_000],
        ['BND', 200_000],
        ['SHY', 120_000],
        ['TIP', 80_000],
        ['VTI', 299_000],
        ['VOO', 119_600],
        ['VXUS', 119_600],
        ['VNQ', 59_800],
      ),
    },
    {
      id: '9002',
      accountType: 'IRA',
      taxFunnel: 'PRE_TAX',
      maskedNumber: '8830',
      balanceCents: 1_500_000_00,
      proposalShares: [],
      // 1,500,000 less 15,000 fee.
      modelId: null,
      lines: funds(
        ['BND', 255_100],
        ['SHY', 153_060],
        ['TIP', 102_040],
        ['VTI', 487_400],
        ['VOO', 194_960],
        ['VXUS', 194_960],
        ['VNQ', 97_480],
      ),
    },
    {
      id: '9003',
      accountType: 'ROTH_IRA',
      taxFunnel: 'TAX_FREE',
      maskedNumber: '2291',
      balanceCents: 300_000_00,
      proposalShares: [],
      // 300,000 less 3,000 fee, exactly the Roth growth model.
      modelId: '9004',
      lines: funds(['VTI', 178_200], ['VXUS', 118_800]),
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
  proposalLockedAt: null,
  updatedAt: '2026-09-15T14:02:00.000Z',
};

/**
 * An early accumulator, deliberately off target: $15,000 of the Single
 * account is still to allocate.
 */
const ACCUMULATOR_CASE: ClientCase = {
  clientNumber: '2317',
  initials: 'C.D.',
  planNumber: 1,
  people: [
    {
      role: 'CLIENT',
      birthYear: 1988,
      gender: 'FEMALE',
      healthConcerns: [],
      healthConcernOther: '',
      lifeExpectancyAge: 90,
      lifeExpectancySource: 'ADVISOR',
    },
  ],
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
      proposalShares: [],
      // 280,000 less 4,200 fee = 275,800; Balanced 60/40 on 260,800, so
      // 15,000 is still to allocate.
      modelId: '9003',
      lines: funds(
        ['VTI', 91_280],
        ['VOO', 26_080],
        ['VXUS', 39_120],
        ['BND', 65_200],
        ['SHY', 26_080],
        ['TIP', 13_040],
      ),
    },
    {
      id: '9005',
      accountType: 'ROTH_IRA',
      taxFunnel: 'TAX_FREE',
      maskedNumber: '7742',
      balanceCents: 240_000_00,
      proposalShares: [],
      // 240,000 less 3,600 fee, Roth growth.
      modelId: '9004',
      lines: funds(['VTI', 141_840], ['VXUS', 94_560]),
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
  proposalLockedAt: null,
  updatedAt: '2026-09-11T09:20:00.000Z',
};

export const SAMPLE_CASES: readonly ClientCase[] = [WORKBOOK_CASE, ACCUMULATOR_CASE];
