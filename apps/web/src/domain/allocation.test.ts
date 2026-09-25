import { describe, expect, it } from 'vitest';

import {
  accountHoldings,
  bucketsByAccount,
  computeBreakdown,
  computeDrift,
  holdingsInBucket,
  modelChoices,
  modelsById,
  unallocatedCents,
} from './breakdown.js';
import { SAMPLE_CASES } from '../fixtures/clients.js';
import { PLACEHOLDER_MODELS, PLACEHOLDER_TICKERS } from '../fixtures/tickers.js';
import { computePlanTotals, targetAllocation } from './worksheet.js';

const WORKBOOK_CASE = SAMPLE_CASES[0]!;
const ACCUMULATOR_CASE = SAMPLE_CASES[1]!;
const MODELS = modelsById(PLACEHOLDER_MODELS);

const breakdownOf = (c = WORKBOOK_CASE) => computeBreakdown(c, PLACEHOLDER_TICKERS, PLACEHOLDER_MODELS);

describe('targetAllocation', () => {
  it('derives the split from the client inputs, not from a table', () => {
    const totals = computePlanTotals(WORKBOOK_CASE);
    const target = targetAllocation(WORKBOOK_CASE, totals);

    // $190,000 / $914,700 / $1,895,300 of $3,000,000 in typed account balances.
    expect(totals.investableAssetsCents).toBe(3_000_000_00);
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
        if (sleeve.modelId === null) continue;
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
  it('puts the workbook case exactly on target with nothing unallocated', () => {
    const breakdown = breakdownOf();
    expect(breakdown.totalCents).toBe(3_000_000_00);
    expect(breakdown.unallocatedCents).toBe(0);
    expect(breakdown.unmodeledCents).toBe(0);

    const drift = computeDrift(targetAllocation(WORKBOOK_CASE, computePlanTotals(WORKBOOK_CASE)), breakdown);
    expect(drift.map((d) => d.deltaCents)).toEqual([0, 0, 0]);
  });

  it('reports unallocated and unmodeled money separately', () => {
    const breakdown = breakdownOf(ACCUMULATOR_CASE);
    expect(breakdown.unallocatedCents).toBe(15_000_00);
    expect(breakdown.unmodeledCents).toBe(60_000_00);
    expect(breakdown.byBucket.find((b) => b.bucket === 'SOON')?.unmodeledCents).toBe(60_000_00);
  });

  it('shows drift against the worksheet for an off-target case', () => {
    const target = targetAllocation(ACCUMULATOR_CASE, computePlanTotals(ACCUMULATOR_CASE));
    const drift = Object.fromEntries(computeDrift(target, breakdownOf(ACCUMULATOR_CASE)).map((d) => [d.bucket, d]));

    // Worksheet: Now $30,000 (bank reserve), Soon $75,000 (conservative reserve).
    expect(drift.NOW?.deltaCents).toBe(-5_000_00);
    expect(drift.SOON?.deltaCents).toBe(-15_000_00);
  });

  it('classifies modeled money by asset class', () => {
    const now = breakdownOf().byBucket.find((b) => b.bucket === 'NOW');
    expect(now?.slices).toEqual([{ assetClass: 'CASH', valueCents: 190_000_00, pct: 100 }]);
  });
});

describe('bucketsByAccount', () => {
  it('splits each account into Now, Soon, and Later', () => {
    const joint = bucketsByAccount(WORKBOOK_CASE)[0]!;
    expect(joint).toMatchObject({
      nowCents: 190_000_00,
      soonCents: 400_000_00,
      laterCents: 610_000_00,
      unallocatedCents: 0,
      balanceCents: 1_200_000_00,
    });
  });

  it('shows what is left over in an account', () => {
    expect(unallocatedCents(ACCUMULATOR_CASE.accounts[0]!)).toBe(15_000_00);
  });
});

describe('holdingsInBucket', () => {
  it('lists the largest position first, across accounts', () => {
    const values = holdingsInBucket(WORKBOOK_CASE, PLACEHOLDER_TICKERS, PLACEHOLDER_MODELS, 'LATER').map(
      (h) => h.marketValueCents,
    );
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it('flags a ticker the model puts outside the bucket RIG maps it to', () => {
    const customised = [
      ...PLACEHOLDER_MODELS.filter((m) => m.id !== '9002'),
      { ...PLACEHOLDER_MODELS[1]!, lines: [{ tickerSymbol: 'VTI', weightBps: 10_000 }] },
    ];
    const soon = holdingsInBucket(WORKBOOK_CASE, PLACEHOLDER_TICKERS, customised, 'SOON');
    expect(soon.every((h) => h.outsideDefaultBucket)).toBe(true);
  });
});

describe('modelChoices', () => {
  it('offers only that bucket, with models for the account funnel first', () => {
    const later = modelChoices(PLACEHOLDER_MODELS, 'LATER', 'TAX_FREE').map((m) => m.id);
    expect(later).toEqual(['9004', '9003']);
    expect(modelChoices(PLACEHOLDER_MODELS, 'NOW', 'TAX_FREE').map((m) => m.id)).toEqual(['9001']);
  });
});
