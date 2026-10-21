import { describe, expect, it } from 'vitest';

import {
  accountValueCents,
  accountHoldings,
  bucketsByAccount,
  computeBreakdown,
  computeDrift,
  holdingsInBucket,
  modelChoices,
  modelsById,
} from './breakdown.js';
import { SAMPLE_CASES } from '../fixtures/clients.js';
import { PLACEHOLDER_MODELS, PLACEHOLDER_TICKERS } from '../fixtures/tickers.js';
import { computePlanTotals, targetAllocation } from './worksheet.js';

const WORKBOOK_CASE = SAMPLE_CASES[0]!;
const ACCUMULATOR_CASE = SAMPLE_CASES[1]!;
const MODELS = modelsById(PLACEHOLDER_MODELS);

const breakdownOf = (c = WORKBOOK_CASE) => computeBreakdown(c, PLACEHOLDER_TICKERS);

describe('targetAllocation', () => {
  it('derives the split from the client inputs, not from a table', () => {
    const totals = computePlanTotals(WORKBOOK_CASE);
    const target = targetAllocation(WORKBOOK_CASE, totals);

    // $220,000 / $914,700 / $1,865,300 of $3,000,000 in typed account balances.
    expect(totals.investableAssetsCents).toBe(3_000_000_00);
    expect(totals.advisoryFeeCents).toBe(30_000_00);
    expect(target.nowCents).toBe(220_000_00);
    expect(target.soonCents).toBe(914_700_00);
    expect(target.laterCents).toBe(1_865_300_00);

    expect(target.nowPct).toBe(7.3);
    expect(target.soonPct).toBe(30.5);
    expect(target.laterPct).toBe(62.2);
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

describe('holdings from models', () => {
  it('turns a bucket amount and a model into positions', () => {
    const joint = WORKBOOK_CASE.accounts[0]!;
    const now = accountHoldings(joint, MODELS).filter((h) => h.bucket === 'NOW');
    expect(now.map((h) => [h.tickerSymbol, h.marketValueCents])).toEqual([
      ['SGOV', 114_000_00],
      ['BIL', 76_000_00],
    ]);
  });

  it('adds back up to every bucket amount exactly', () => {
    for (const account of WORKBOOK_CASE.accounts) {
      const holdings = accountHoldings(account, MODELS);
      for (const sleeve of account.sleeves) {
        if (sleeve.mode === 'MODEL' && sleeve.modelId === null) continue;
        const total = holdings.filter((h) => h.bucket === sleeve.bucket).reduce((t, h) => t + h.marketValueCents, 0);
        expect(total).toBe(sleeve.amountCents);
      }
    }
  });

  it('has no positions for a bucket with no model', () => {
    const roth = ACCUMULATOR_CASE.accounts[1]!;
    expect(accountHoldings(roth, MODELS).filter((h) => h.bucket === 'SOON')).toEqual([]);
  });
});

describe('computeBreakdown', () => {
  it('includes the advisory fee in the target and reports the resulting drift', () => {
    const breakdown = breakdownOf();
    expect(breakdown.totalCents).toBe(3_000_000_00);
    expect(breakdown.unpricedPositionCount).toBe(0);

    const drift = computeDrift(targetAllocation(WORKBOOK_CASE, computePlanTotals(WORKBOOK_CASE)), breakdown);
    expect(drift.map((d) => d.deltaCents)).toEqual([-30_000_00, 0, 30_000_00]);
  });

  it('values actual holdings even when their target sleeves are unallocated or unmodeled', () => {
    const breakdown = breakdownOf(ACCUMULATOR_CASE);
    expect(breakdown.totalCents).toBe(520_000_00);
    expect(breakdown.byBucket.map(({ bucket, valueCents }) => [bucket, valueCents])).toEqual([
      ['NOW', 25_000_00],
      ['SOON', 60_000_00],
      ['LATER', 435_000_00],
    ]);
  });

  it('shows drift against the worksheet for an off-target case', () => {
    const target = targetAllocation(ACCUMULATOR_CASE, computePlanTotals(ACCUMULATOR_CASE));
    const drift = Object.fromEntries(computeDrift(target, breakdownOf(ACCUMULATOR_CASE)).map((d) => [d.bucket, d]));

    // Worksheet: Now $35,200 (bank reserve plus fee), Soon $75,000.
    expect(drift.NOW?.deltaCents).toBe(-10_200_00);
    expect(drift.SOON?.deltaCents).toBe(-15_000_00);
  });

  it('classifies actual holdings by asset class', () => {
    const now = breakdownOf().byBucket.find((b) => b.bucket === 'NOW');
    expect(now?.slices).toEqual([{ assetClass: 'CASH', valueCents: 190_000_00, pct: 100 }]);
  });

  it('excludes unpriced positions from totals but counts them for the warning', () => {
    const withoutVtiPrice = PLACEHOLDER_TICKERS.map((ticker) =>
      ticker.symbol === 'VTI' ? { ...ticker, priceCents: null } : ticker,
    );
    const breakdown = computeBreakdown(WORKBOOK_CASE, withoutVtiPrice);
    expect(breakdown.totalCents).toBe(1_104_700_00);
    expect(breakdown.unpricedPositionCount).toBe(3);
  });
});

describe('bucketsByAccount', () => {
  it('splits each account into Now, Soon, and Later', () => {
    const joint = bucketsByAccount(WORKBOOK_CASE, PLACEHOLDER_TICKERS)[0]!;
    expect(joint).toMatchObject({
      nowCents: 190_000_00,
      soonCents: 400_000_00,
      laterCents: 610_000_00,
      unpricedPositionCount: 0,
      balanceCents: 1_200_000_00,
    });
  });

  it('derives account balances from the priced positions', () => {
    const account = {
      ...WORKBOOK_CASE.accounts[0]!,
      balanceCents: 999_999_00,
    };
    expect(accountValueCents(account, PLACEHOLDER_TICKERS)).toBe(1_200_000_00);
  });
});

describe('holdingsInBucket', () => {
  it('lists the largest position first, across accounts', () => {
    const values = holdingsInBucket(WORKBOOK_CASE, PLACEHOLDER_TICKERS, 'LATER').map(
      (h) => h.marketValueCents ?? 0,
    );
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });
});

describe('modelChoices', () => {
  it('offers only that bucket, with models for the account funnel first', () => {
    const later = modelChoices(PLACEHOLDER_MODELS, 'LATER', 'TAX_FREE').map((m) => m.id);
    expect(later).toEqual(['9004', '9003']);
    expect(modelChoices(PLACEHOLDER_MODELS, 'NOW', 'TAX_FREE').map((m) => m.id)).toEqual(['9001']);
  });
});

describe('a bucket picked by hand (US-23)', () => {
  /** The Single account on case 2317: $240,000 of Later, VTI 70% and VNQ 30%. */
  const single = ACCUMULATOR_CASE.accounts[0]!;

  const manualLater = (lines: { tickerSymbol: string; weightBps: number }[]) => ({
    ...single,
    sleeves: single.sleeves.map((s) => (s.bucket === 'LATER' ? { ...s, lines } : s)),
  });

  it('works out positions from the advisor’s own weights', () => {
    const holdings = accountHoldings(single, MODELS).filter((h) => h.bucket === 'LATER');

    expect(holdings.map((h) => [h.tickerSymbol, h.marketValueCents])).toEqual([
      ['VTI', 168_000_00],
      ['VNQ', 72_000_00],
    ]);
    // They came from no model, which is what tells the breakdown to say so.
    expect(holdings.every((h) => h.modelId === null)).toBe(true);
  });

  it('adds up to the bucket exactly, the same as a model does', () => {
    const holdings = accountHoldings(single, MODELS).filter((h) => h.bucket === 'LATER');
    const total = holdings.reduce((sum, h) => sum + h.marketValueCents, 0);
    expect(total).toBe(240_000_00);
  });

  it('places nothing while the weights are short of 100%', () => {
    const half = manualLater([{ tickerSymbol: 'VTI', weightBps: 4000 }]);
    expect(accountHoldings(half, MODELS).filter((h) => h.bucket === 'LATER')).toEqual([]);

    // The money is not lost, it is reported as not yet following anything.
    const breakdown = computeBreakdown(
      { ...ACCUMULATOR_CASE, accounts: [half, ACCUMULATOR_CASE.accounts[1]!] },
      PLACEHOLDER_TICKERS,
    );
    expect(breakdown.byBucket.find((b) => b.bucket === 'LATER')?.valueCents).toBe(435_000_00);
  });

  it('places nothing when no symbols have been chosen at all', () => {
    expect(accountHoldings(manualLater([]), MODELS).filter((h) => h.bucket === 'LATER')).toEqual([]);
  });
});
