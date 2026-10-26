import { describe, expect, it } from 'vitest';

import {
  accountHoldings,
  bucketsByAccount,
  computeBreakdown,
  computeDrift,
  fillFromPlan,
  holdingsInBucket,
  modelChoices,
  modelsById,
  unallocatedCents,
} from './breakdown.js';
import { SAMPLE_CASES } from '../fixtures/clients.js';
import { PLACEHOLDER_MODELS, PLACEHOLDER_TICKERS, RIG_FEE_TIERS } from '../fixtures/tickers.js';
import { computePlanTotals, targetAllocation } from './worksheet.js';

const WORKBOOK_CASE = SAMPLE_CASES[0]!;
const ACCUMULATOR_CASE = SAMPLE_CASES[1]!;
const MODELS = modelsById(PLACEHOLDER_MODELS);

const breakdownOf = (c = WORKBOOK_CASE) => computeBreakdown(c, PLACEHOLDER_TICKERS, PLACEHOLDER_MODELS);

describe('targetAllocation', () => {
  it('derives the split from the client inputs, not from a table', () => {
    const totals = computePlanTotals(WORKBOOK_CASE, RIG_FEE_TIERS);
    const target = targetAllocation(WORKBOOK_CASE, totals);

    // The workbook's $190,000 Now plus $30,000 of fee cash ($3,000,000 is the
    // 1.00% household tier), $914,700 Soon, and the rest in Later.
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

    const target = targetAllocation(accumulator, computePlanTotals(accumulator, RIG_FEE_TIERS));

    expect(target.soonCents).toBe(100_000_00); // only the conservative reserve
    expect(target.soonPct).toBeLessThan(4);
    expect(target.laterPct).toBeGreaterThan(90);
  });

  it('reports zero rather than NaN when there are no assets', () => {
    const empty = { ...WORKBOOK_CASE, accounts: [] };
    const target = targetAllocation(empty, computePlanTotals(empty, RIG_FEE_TIERS));
    expect(target.nowPct).toBe(0);
    expect(target.soonPct).toBe(0);
  });
});

describe('holdings from models', () => {
  it('turns a bucket amount and a model into positions', () => {
    const joint = WORKBOOK_CASE.accounts[0]!;
    const now = accountHoldings(joint, MODELS).filter((h) => h.bucket === 'NOW');
    expect(now.map((h) => [h.tickerSymbol, h.marketValueCents])).toEqual([
      ['SGOV', 121_200_00],
      ['BIL', 80_800_00],
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
  it('puts the workbook case exactly on target with nothing unallocated', () => {
    const breakdown = breakdownOf();
    expect(breakdown.totalCents).toBe(3_000_000_00);
    expect(breakdown.unallocatedCents).toBe(0);
    expect(breakdown.unmodeledCents).toBe(0);

    const drift = computeDrift(targetAllocation(WORKBOOK_CASE, computePlanTotals(WORKBOOK_CASE, RIG_FEE_TIERS)), breakdown);
    expect(drift.map((d) => d.deltaCents)).toEqual([0, 0, 0]);
  });

  it('reports unallocated and unmodeled money separately', () => {
    const breakdown = breakdownOf(ACCUMULATOR_CASE);
    expect(breakdown.unallocatedCents).toBe(15_000_00);
    expect(breakdown.unmodeledCents).toBe(60_000_00);
    expect(breakdown.byBucket.find((b) => b.bucket === 'SOON')?.unmodeledCents).toBe(60_000_00);
  });

  it('shows drift against the worksheet for an off-target case', () => {
    const target = targetAllocation(ACCUMULATOR_CASE, computePlanTotals(ACCUMULATOR_CASE, RIG_FEE_TIERS));
    const drift = Object.fromEntries(computeDrift(target, breakdownOf(ACCUMULATOR_CASE)).map((d) => [d.bucket, d]));

    // Worksheet: Now $30,000 (bank reserve) plus $7,800 of fee cash ($520,000
    // in all is the 1.50% tier: $4,200 + $3,600); Soon $75,000 (conservative
    // reserve).
    expect(drift.NOW?.deltaCents).toBe(-12_800_00);
    expect(drift.SOON?.deltaCents).toBe(-15_000_00);
  });

  it('classifies modeled money by asset class', () => {
    const now = breakdownOf().byBucket.find((b) => b.bucket === 'NOW');
    expect(now?.slices).toEqual([{ assetClass: 'CASH', valueCents: 220_000_00, pct: 100 }]);
  });
});

describe('bucketsByAccount', () => {
  it('splits each account into Now, Soon, and Later', () => {
    const joint = bucketsByAccount(WORKBOOK_CASE)[0]!;
    expect(joint).toMatchObject({
      nowCents: 202_000_00,
      soonCents: 400_000_00,
      laterCents: 598_000_00,
      unallocatedCents: 0,
      balanceCents: 1_200_000_00,
    });
  });

  it('shows what is left over in an account', () => {
    expect(unallocatedCents(ACCUMULATOR_CASE.accounts[0]!)).toBe(15_000_00);
  });
});

describe('fillFromPlan (US-22)', () => {
  const empty = {
    ...WORKBOOK_CASE.accounts[0]!,
    balanceCents: 500_000_00,
    sleeves: WORKBOOK_CASE.accounts[0]!.sleeves.map((s) => ({ ...s, amountCents: 0 })),
  };

  it('places Now, then Soon, then Later, up to the balance', () => {
    const filled = fillFromPlan(empty, { NOW: 100_000_00, SOON: 300_000_00, LATER: 400_000_00 });
    expect(filled.sleeves.map((s) => s.amountCents)).toEqual([100_000_00, 300_000_00, 100_000_00]);
  });

  it('adds to what is already placed and never goes past the balance', () => {
    const half = { ...empty, sleeves: empty.sleeves.map((s) => (s.bucket === 'SOON' ? { ...s, amountCents: 50_000_00 } : s)) };
    const filled = fillFromPlan(half, { NOW: 20_000_00, SOON: 1_000_000_00, LATER: 0 });
    expect(filled.sleeves.map((s) => s.amountCents)).toEqual([20_000_00, 480_000_00, 0]);
  });

  it('ignores a bucket that is already over-placed', () => {
    const filled = fillFromPlan(empty, { NOW: -5_000_00, SOON: 0, LATER: 10_000_00 });
    expect(filled.sleeves.map((s) => s.amountCents)).toEqual([0, 0, 10_000_00]);
  });
});

describe('holdingsInBucket', () => {
  it('says how many whole shares each position is at the ticker price (US-21)', () => {
    const now = holdingsInBucket(WORKBOOK_CASE, PLACEHOLDER_TICKERS, PLACEHOLDER_MODELS, 'NOW');
    // Joint: $121,200 of SGOV at $100.00, $80,800 of BIL at $91.50.
    expect(now.find((h) => h.key === '9001:NOW:SGOV')?.shares).toBe(1212);
    expect(now.find((h) => h.key === '9001:NOW:BIL')?.shares).toBe(883);

    const unpriced = PLACEHOLDER_TICKERS.map((t) => (t.symbol === 'BIL' ? { ...t, priceCents: null } : t));
    expect(
      holdingsInBucket(WORKBOOK_CASE, unpriced, PLACEHOLDER_MODELS, 'NOW').find((h) => h.symbol === 'BIL')?.shares,
    ).toBeNull();
  });

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
      PLACEHOLDER_MODELS,
    );
    expect(breakdown.byBucket.find((b) => b.bucket === 'LATER')?.unmodeledCents).toBe(240_000_00);
  });

  it('places nothing when no symbols have been chosen at all', () => {
    expect(accountHoldings(manualLater([]), MODELS).filter((h) => h.bucket === 'LATER')).toEqual([]);
  });
});
