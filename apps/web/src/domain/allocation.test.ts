import { describe, expect, it } from 'vitest';

import {
  bucketsByAccount,
  computeBreakdown,
  computeDrift,
  holdingsInBucket,
} from './breakdown.js';
import { SAMPLE_CASES } from '../fixtures/clients.js';
import { PLACEHOLDER_TICKERS } from '../fixtures/tickers.js';
import { computePlanTotals, targetAllocation } from './worksheet.js';

const WORKBOOK_CASE = SAMPLE_CASES[0]!;

describe('targetAllocation', () => {
  it('derives the split from the client inputs, not from a table', () => {
    const totals = computePlanTotals(WORKBOOK_CASE);
    const target = targetAllocation(WORKBOOK_CASE, totals);

    // $190,000 / $914,700 / $1,895,300 of $3,000,000.
    expect(target.nowCents).toBe(190_000_00);
    expect(target.soonCents).toBe(914_700_00);
    expect(target.laterCents).toBe(1_895_300_00);

    expect(target.nowPct).toBe(6.3);
    expect(target.soonPct).toBe(30.5);
    expect(target.laterPct).toBe(63.2);
  });

  it('gives an accumulator a small Soon bucket without weighting anything', () => {
    // Life stage does not scale the result; it shows up as inputs that are zero.
    const accumulator = {
      ...WORKBOOK_CASE,
      lifeStage: 'ACCUMULATION_PEAK_EARNINGS' as const,
      nowInputs: { ...WORKBOOK_CASE.nowInputs, monthlyIncomeDrawCents: 0, plannedExpenses: [] },
      soonInputs: {
        ...WORKBOOK_CASE.soonInputs,
        annualIncomeGapCents: 0,
        socialSecurityBridges: [],
        miscellaneousCosts: [],
      },
    };

    const target = targetAllocation(accumulator, computePlanTotals(accumulator));

    expect(target.soonCents).toBe(100_000_00); // only the conservative reserve
    expect(target.soonPct).toBeLessThan(4);
    expect(target.laterPct).toBeGreaterThan(90);
  });

  it('reports zero rather than NaN when there are no assets', () => {
    const empty = { ...WORKBOOK_CASE, accounts: [] };
    const target = targetAllocation(empty, computePlanTotals(empty));
    expect(target.nowPct).toBe(0);
    expect(target.soonPct).toBe(0);
  });
});

describe('computeDrift', () => {
  it('reports where the holdings sit against where the worksheet says they should', () => {
    const totals = computePlanTotals(WORKBOOK_CASE);
    const target = targetAllocation(WORKBOOK_CASE, totals);
    const drift = computeDrift(target, computeBreakdown(WORKBOOK_CASE, PLACEHOLDER_TICKERS));

    const byBucket = Object.fromEntries(drift.map((d) => [d.bucket, d]));

    // Now is funded exactly; Soon holds $100,000 more than the plan calls for,
    // which is the same $100,000 missing from Later.
    expect(byBucket.NOW?.deltaCents).toBe(0);
    expect(byBucket.SOON?.deltaCents).toBe(100_000_00);
    expect(byBucket.LATER?.deltaCents).toBe(-100_000_00);
  });

  it('nets to zero across the three buckets', () => {
    const totals = computePlanTotals(WORKBOOK_CASE);
    const drift = computeDrift(
      targetAllocation(WORKBOOK_CASE, totals),
      computeBreakdown(WORKBOOK_CASE, PLACEHOLDER_TICKERS),
    );
    expect(drift.reduce((sum, d) => sum + d.deltaCents, 0)).toBe(0);
  });
});

describe('bucketsByAccount', () => {
  it('splits each account into Now, Soon, and Later', () => {
    const rows = bucketsByAccount(WORKBOOK_CASE);
    expect(rows).toHaveLength(3);

    const joint = rows[0]!;
    expect(joint.nowCents).toBe(190_000_00);
    expect(joint.soonCents).toBe(400_000_00);
    expect(joint.laterCents).toBe(610_000_00);
    expect(joint.totalCents).toBe(1_200_000_00);
  });

  it('rolls up to the portfolio total', () => {
    const rows = bucketsByAccount(WORKBOOK_CASE);
    expect(rows.reduce((sum, r) => sum + r.totalCents, 0)).toBe(3_000_000_00);
  });
});

describe('holdingsInBucket', () => {
  it('lists the largest position first', () => {
    const holdings = holdingsInBucket(WORKBOOK_CASE, PLACEHOLDER_TICKERS, 'SOON');
    const values = holdings.map((h) => h.marketValueCents);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it('sums to the bucket total, so the list cannot disagree with the drift', () => {
    for (const bucket of ['NOW', 'SOON', 'LATER'] as const) {
      const listed = holdingsInBucket(WORKBOOK_CASE, PLACEHOLDER_TICKERS, bucket).reduce(
        (sum, h) => sum + h.marketValueCents,
        0,
      );
      const composition = computeBreakdown(WORKBOOK_CASE, PLACEHOLDER_TICKERS).byBucket.find(
        (b) => b.bucket === bucket,
      );
      expect(listed).toBe(composition?.valueCents);
    }
  });

  it('flags a holding the advisor moved off the ticker default', () => {
    // VXUS defaults to LATER but is parked in SOON on the sample case.
    const overrides = holdingsInBucket(WORKBOOK_CASE, PLACEHOLDER_TICKERS, 'SOON').filter(
      (h) => h.isOverride,
    );
    expect(overrides.map((h) => h.symbol)).toEqual(['VXUS']);
  });

  it('keeps an unclassifiable symbol in the list with a null asset class', () => {
    const accumulator = SAMPLE_CASES[1]!;
    const later = holdingsInBucket(accumulator, PLACEHOLDER_TICKERS, 'LATER');
    const unknown = later.find((h) => h.symbol === 'ZZZZ');
    expect(unknown?.assetClass).toBeNull();
    expect(unknown?.isOverride).toBe(false);
  });
});
