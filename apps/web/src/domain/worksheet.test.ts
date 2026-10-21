import { describe, expect, it } from 'vitest';

import { computeLater, computeNow, computeSoon } from './worksheet.js';
import type { GapEntry, NowInputs, SoonInputs } from './types.js';

/**
 * Parity with the sponsor's workbook.
 *
 * Every number below is read off the "Bucket Plan Deliverable" Inputs tab as
 * the sponsor sent it. This is the check that matters: if these totals stop
 * matching, our arithmetic has drifted from theirs, and penny parity with that
 * spreadsheet is how correctness is judged on this project.
 */

function gap(label: string, annualCents: number, years: number, multiplier = 1): GapEntry {
  return { id: label, label, annualAmountCents: annualCents, years, multiplier };
}

const WORKBOOK_NOW: NowInputs = {
  monthlyIncomeDrawCents: 5_000_00, // E4
  incomeDrawMonths: 10, // E5
  bankReserveCents: 100_000_00, // E8
  plannedExpenses: [{ id: 'event-1', label: 'Event 1', costCents: 40_000_00 }], // E12
};

const WORKBOOK_SOON: SoonInputs = {
  annualIncomeGapCents: 60_000_00, // E20
  incomeGapYears: 10, // E23 multiplies by 10
  socialSecurityBridges: [
    gap('Client 1', 3_200_00 * 12, 3), // E31
    gap('Client 2', 1_500_00 * 12, 1.5), // E32
  ],
  healthcareGaps: [],
  miscellaneousCosts: [{ id: 'misc-1', label: 'Boat', costCents: 50_000_00 }], // E40
  forcedWithdrawals: [],
  conservativeReserveCents: 100_000_00, // E50
};

describe('Now bucket', () => {
  it('matches cell E16', () => {
    const now = computeNow(WORKBOOK_NOW);
    expect(now.lines.map((l) => l.amountCents)).toEqual([50_000_00, 100_000_00, 40_000_00]);
    expect(now.totalCents).toBe(190_000_00);
  });

  it('is zero, not NaN, on an empty case', () => {
    const now = computeNow({
      monthlyIncomeDrawCents: 0,
      incomeDrawMonths: 0,
      bankReserveCents: 0,
      plannedExpenses: [],
    });
    expect(now.totalCents).toBe(0);
  });
});

describe('Soon bucket', () => {
  it('matches cell E52', () => {
    const soon = computeSoon(WORKBOOK_SOON);
    expect(soon.lines.map((l) => l.amountCents)).toEqual([
      600_000_00, // E23  income gap x 10
      22_500_00, // E28  inflation hedge
      142_200_00, // E33  SS bridge: 38,400 x 3 + 18,000 x 1.5
      0, // E38  healthcare
      50_000_00, // E43  miscellaneous
      0, // E48  forced withdrawals
      100_000_00, // E51  conservative reserve
    ]);
    expect(soon.totalCents).toBe(914_700_00);
  });

  it('grosses forced withdrawals up by 1.15', () => {
    const soon = computeSoon({
      ...WORKBOOK_SOON,
      forcedWithdrawals: [gap('Client 1', 20_000_00, 10, 1.15)],
    });
    expect(soon.lines[5]?.amountCents).toBe(230_000_00);
  });

  it('flags the two places the workbook contradicts itself', () => {
    const noted = computeSoon(WORKBOOK_SOON).lines.filter((l) => l.note !== undefined);
    expect(noted.map((l) => l.cell)).toEqual(['E23', 'E48']);
  });
});

describe('Later bucket', () => {
  it('matches cell E60', () => {
    // E59 in the workbook is 3,000,000 entered by hand.
    const later = computeLater(3_000_000_00, 190_000_00, 914_700_00);
    expect(later.totalCents).toBe(1_895_300_00);
  });

  it('goes negative when Now and Soon ask for more than the client has', () => {
    const later = computeLater(500_000_00, 190_000_00, 914_700_00);
    expect(later.totalCents).toBe(-604_700_00);
  });
});
