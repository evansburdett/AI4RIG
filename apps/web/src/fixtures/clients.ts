/**
 * Two sample cases so the screens have something to show before the API exists.
 *
 * No PII, and none is possible: the type has no field for a name, an address,
 * or a real account number. Client numbers are made up, initials are made up,
 * and the figures on case 1042 are the ones from the sponsor's own workbook so
 * that what the UI displays can be checked against the spreadsheet directly.
 *
 * See docs/decisions/0006-no-pii-anywhere.md.
 */

import type { ClientCase } from '../domain/types.js';

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
  accounts: [
    {
      id: 'acct-1',
      accountType: 'JOINT',
      maskedNumber: '••••4417',
      holdings: [
        { id: 'h-1', tickerSymbol: 'SGOV', marketValueCents: 190_000_00, assignedBucket: 'NOW' },
        { id: 'h-2', tickerSymbol: 'BND', marketValueCents: 400_000_00, assignedBucket: 'SOON' },
        { id: 'h-3', tickerSymbol: 'VTI', marketValueCents: 610_000_00, assignedBucket: 'LATER' },
      ],
    },
    {
      id: 'acct-2',
      accountType: 'IRA',
      maskedNumber: '••••8830',
      holdings: [
        { id: 'h-4', tickerSymbol: 'SHY', marketValueCents: 314_700_00, assignedBucket: 'SOON' },
        { id: 'h-5', tickerSymbol: 'VOO', marketValueCents: 985_300_00, assignedBucket: 'LATER' },
        // Deliberately parked in Soon against its LATER default, so the
        // override badge and the "unknown symbol" path both have a live case.
        { id: 'h-6', tickerSymbol: 'VXUS', marketValueCents: 200_000_00, assignedBucket: 'SOON' },
      ],
    },
    {
      id: 'acct-3',
      accountType: 'ROTH_IRA',
      maskedNumber: '••••2291',
      holdings: [
        { id: 'h-7', tickerSymbol: 'GLD', marketValueCents: 100_000_00, assignedBucket: 'SOON' },
        { id: 'h-8', tickerSymbol: 'VNQ', marketValueCents: 200_000_00, assignedBucket: 'LATER' },
      ],
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

/** A second case, early in the cycle, so the switcher has somewhere to switch to. */
const ACCUMULATOR_CASE: ClientCase = {
  clientNumber: '2317',
  initials: 'C.D.',
  planNumber: 1,
  people: [
    { role: 'CLIENT', birthYear: 1988, healthConcern: 'NONE', lifeExpectancyAge: 90 },
  ],
  moneyCyclePhase: 'ACCUMULATION',
  lifeStage: 'ACCUMULATION_PEAK_EARNINGS',
  accounts: [
    {
      id: 'acct-4',
      accountType: 'SINGLE',
      maskedNumber: '••••1005',
      holdings: [
        { id: 'h-9', tickerSymbol: 'BIL', marketValueCents: 25_000_00, assignedBucket: 'NOW' },
        { id: 'h-10', tickerSymbol: 'VTI', marketValueCents: 240_000_00, assignedBucket: 'LATER' },
        // Not in the placeholder universe — exercises the unknown-symbol notice.
        { id: 'h-11', tickerSymbol: 'ZZZZ', marketValueCents: 15_000_00, assignedBucket: 'LATER' },
      ],
    },
    {
      id: 'acct-5',
      accountType: 'ROTH_IRA',
      maskedNumber: '••••7742',
      holdings: [
        { id: 'h-12', tickerSymbol: 'TIP', marketValueCents: 60_000_00, assignedBucket: 'SOON' },
        { id: 'h-13', tickerSymbol: 'VOO', marketValueCents: 180_000_00, assignedBucket: 'LATER' },
      ],
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
