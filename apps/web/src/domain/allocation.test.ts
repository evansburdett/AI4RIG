import { describe, expect, it } from 'vitest';

import {
  accountHoldings,
  amountForWeight,
  applyModel,
  bucketsByAccount,
  computeBreakdown,
  computeDrift,
  feesByAccount,
  followModels,
  holdingsInBucket,
  leftToAllocateCents,
  linesAsWeights,
  matchesModel,
  modelBucketMix,
  modelChoices,
  modelsById,
  tickersBySymbol,
  weightBpsOf,
} from './breakdown.js';
import { SAMPLE_CASES } from '../fixtures/clients.js';
import { PLACEHOLDER_MODELS, PLACEHOLDER_TICKERS, RIG_FEE_TIERS } from '../fixtures/tickers.js';
import { accountAdvisoryFees, computePlanTotals, targetAllocation } from './worksheet.js';
import type { ClientCase } from './types.js';

const WORKBOOK_CASE = SAMPLE_CASES[0]!;
const ACCUMULATOR_CASE = SAMPLE_CASES[1]!;
const MODELS = modelsById(PLACEHOLDER_MODELS);
const TICKERS = tickersBySymbol(PLACEHOLDER_TICKERS);
const ROTH_GROWTH = MODELS.get('9004')!;
const BALANCED = MODELS.get('9003')!;

const feesOf = (c: ClientCase) => feesByAccount(accountAdvisoryFees(c, RIG_FEE_TIERS));
const breakdownOf = (c = WORKBOOK_CASE) => computeBreakdown(c, PLACEHOLDER_TICKERS, feesOf(c));

describe('targetAllocation', () => {
  it('derives the split from the client inputs, not from a table', () => {
    const totals = computePlanTotals(WORKBOOK_CASE, RIG_FEE_TIERS);
    const target = targetAllocation(WORKBOOK_CASE, totals);

    // The workbook's $190,000 Now plus $30,000 of fee cash ($3,000,000 is the
    // 1.00% household tier), $910,200 Soon, and the rest in Later.
    expect(totals.investableAssetsCents).toBe(3_000_000_00);
    expect(totals.advisoryFeeCents).toBe(30_000_00);
    expect(target.nowCents).toBe(220_000_00);
    expect(target.soonCents).toBe(910_200_00);
    expect(target.laterCents).toBe(1_869_800_00);

    expect(target.nowPct).toBe(7.3);
    expect(target.soonPct).toBe(30.3);
    expect(target.laterPct).toBe(62.3);
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

describe('an account allocated by fund (10/26)', () => {
  const joint = WORKBOOK_CASE.accounts[0]!;

  it('holds the advisory fee as cash in Now and each fund in its ticker\'s bucket', () => {
    const holdings = accountHoldings(joint, TICKERS, 12_000_00);
    expect(holdings[0]).toEqual({ accountId: '9001', bucket: 'NOW', tickerSymbol: null, marketValueCents: 12_000_00 });
    expect(holdings.filter((h) => h.bucket === 'NOW').map((h) => [h.tickerSymbol, h.marketValueCents])).toEqual([
      [null, 12_000_00],
      ['SGOV', 114_000_00],
      ['BIL', 76_000_00],
    ]);
  });

  it('invests the balance less the fee, and says what is left', () => {
    expect(leftToAllocateCents(joint, 12_000_00)).toBe(0);
    expect(leftToAllocateCents(ACCUMULATOR_CASE.accounts[0]!, 4_200_00)).toBe(15_000_00);
    // More in funds than there is to invest comes back negative.
    expect(leftToAllocateCents(joint, 20_000_00)).toBe(-8_000_00);
  });

  it('fills from a model to the exact cent of the amount to invest', () => {
    const filled = applyModel({ ...joint, lines: [] }, BALANCED, 12_000_00);
    expect(filled.modelId).toBe('9003');
    expect(filled.lines.reduce((t, l) => t + l.amountCents, 0)).toBe(1_188_000_00);
    expect(filled.lines.find((l) => l.tickerSymbol === 'VTI')?.amountCents).toBe(415_800_00);
    expect(matchesModel(filled, BALANCED, 12_000_00)).toBe(true);
  });

  it('notices when a fund has been adjusted away from the model', () => {
    const roth = WORKBOOK_CASE.accounts[2]!;
    expect(matchesModel(roth, ROTH_GROWTH, 3_000_00)).toBe(true);
    const adjusted = { ...roth, lines: roth.lines.map((l) => (l.tickerSymbol === 'VTI' ? { ...l, amountCents: 1 } : l)) };
    expect(matchesModel(adjusted, ROTH_GROWTH, 3_000_00)).toBe(false);
  });

  it('turns a typed weight into dollars of the amount to invest, and back', () => {
    expect(amountForWeight(6000, 297_000_00)).toBe(178_200_00);
    expect(weightBpsOf(178_200_00, 297_000_00)).toBe(6000);
    expect(weightBpsOf(5_000_00, 0)).toBe(0);
  });

  it('turns funds into model weights that add up to exactly 100%', () => {
    const weights = linesAsWeights(joint.lines);
    expect(weights.reduce((t, l) => t + l.weightBps, 0)).toBe(10_000);
    expect(weights.find((l) => l.tickerSymbol === 'BND')?.weightBps).toBe(1683);
    expect(linesAsWeights([{ tickerSymbol: 'VTI', amountCents: 0, heldSharesMicros: null }])).toEqual([]);
  });
});

describe('followModels', () => {
  const roth = WORKBOOK_CASE.accounts[2]!;
  const before = { ...WORKBOOK_CASE, accounts: [roth] };
  const fees = (feeCents: number) => new Map([[roth.id, feeCents]]);

  it('refills an account still on its model when the balance changes', () => {
    const [next] = followModels(before, [{ ...roth, balanceCents: 400_000_00 }], MODELS, fees(3_000_00), fees(4_000_00));
    expect(next!.lines).toEqual([
      { tickerSymbol: 'VTI', amountCents: 237_600_00, heldSharesMicros: null },
      { tickerSymbol: 'VXUS', amountCents: 158_400_00, heldSharesMicros: null },
    ]);
  });

  it('refills when only the fee moves, as when another balance changes the tier', () => {
    const [next] = followModels(before, [roth], MODELS, fees(3_000_00), fees(4_500_00));
    expect(next!.lines.reduce((t, l) => t + l.amountCents, 0)).toBe(295_500_00);
  });

  it('leaves an adjusted account alone', () => {
    const adjusted = { ...roth, lines: [{ tickerSymbol: 'VTI', amountCents: 297_000_00, heldSharesMicros: null }] };
    const [next] = followModels(
      { ...WORKBOOK_CASE, accounts: [adjusted] },
      [{ ...adjusted, balanceCents: 400_000_00 }],
      MODELS,
      fees(3_000_00),
      fees(4_000_00),
    );
    expect(next!.lines).toEqual(adjusted.lines);
  });

  it('keeps the edit itself when the funds are what changed', () => {
    const edited = { ...roth, lines: [{ tickerSymbol: 'VTI', amountCents: 1_00, heldSharesMicros: null }] };
    expect(followModels(before, [edited], MODELS, fees(3_000_00), fees(3_000_00))[0]).toBe(edited);
  });
});

describe('computeBreakdown', () => {
  it('puts the workbook case exactly on target with nothing unallocated', () => {
    const breakdown = breakdownOf();
    expect(breakdown.totalCents).toBe(3_000_000_00);
    expect(breakdown.unallocatedCents).toBe(0);

    const drift = computeDrift(targetAllocation(WORKBOOK_CASE, computePlanTotals(WORKBOOK_CASE, RIG_FEE_TIERS)), breakdown);
    expect(drift.map((d) => d.deltaCents)).toEqual([0, 0, 0]);
  });

  it('reports money not yet in a fund', () => {
    expect(breakdownOf(ACCUMULATOR_CASE).unallocatedCents).toBe(15_000_00);
  });

  it('shows drift against the worksheet for an off-target case', () => {
    const target = targetAllocation(ACCUMULATOR_CASE, computePlanTotals(ACCUMULATOR_CASE, RIG_FEE_TIERS));
    const drift = Object.fromEntries(computeDrift(target, breakdownOf(ACCUMULATOR_CASE)).map((d) => [d.bucket, d]));

    // Worksheet: Now $30,000 (bank reserve) plus $7,800 of fee cash ($520,000
    // in all is the 1.50% tier: $4,200 + $3,600); the accounts hold only the
    // fee cash there. Soon $75,000 (conservative reserve) against the
    // Balanced model's bond funds in the Single account.
    expect(drift.NOW?.deltaCents).toBe(-30_000_00);
    expect(drift.SOON?.deltaCents).toBe(29_320_00);
  });

  it('counts the fee cash as cash', () => {
    const now = breakdownOf().byBucket.find((b) => b.bucket === 'NOW');
    expect(now?.slices).toEqual([{ assetClass: 'CASH', valueCents: 220_000_00, pct: 100 }]);
  });
});

describe('bucketsByAccount', () => {
  it('splits each account into Now, Soon, and Later from its funds', () => {
    const joint = bucketsByAccount(WORKBOOK_CASE, PLACEHOLDER_TICKERS, feesOf(WORKBOOK_CASE))[0]!;
    expect(joint).toMatchObject({
      nowCents: 202_000_00,
      soonCents: 400_000_00,
      laterCents: 598_000_00,
      unallocatedCents: 0,
      balanceCents: 1_200_000_00,
    });
  });

  it('shows what is left over in an account', () => {
    const single = bucketsByAccount(ACCUMULATOR_CASE, PLACEHOLDER_TICKERS, feesOf(ACCUMULATOR_CASE))[0]!;
    expect(single.unallocatedCents).toBe(15_000_00);
  });
});

describe('holdingsInBucket', () => {
  const fees = feesOf(WORKBOOK_CASE);

  it('says how many whole shares each position is at the ticker price (US-21)', () => {
    const now = holdingsInBucket(WORKBOOK_CASE, PLACEHOLDER_TICKERS, fees, 'NOW');
    // Joint: $114,000 of SGOV at $100.00, $76,000 of BIL at $91.50.
    expect(now.find((h) => h.key === '9001:SGOV')?.shares).toBe(1140);
    expect(now.find((h) => h.key === '9001:BIL')?.shares).toBe(830);

    const unpriced = PLACEHOLDER_TICKERS.map((t) => (t.symbol === 'BIL' ? { ...t, priceCents: null } : t));
    expect(holdingsInBucket(WORKBOOK_CASE, unpriced, fees, 'NOW').find((h) => h.symbol === 'BIL')?.shares).toBeNull();
  });

  it('lists the fee cash as cash, with no shares', () => {
    const cash = holdingsInBucket(WORKBOOK_CASE, PLACEHOLDER_TICKERS, fees, 'NOW').find((h) => h.key === '9001:fee-cash');
    expect(cash).toMatchObject({ symbol: null, marketValueCents: 12_000_00, shares: null, assetClass: 'CASH' });
  });

  it('lists the largest position first, across accounts', () => {
    const values = holdingsInBucket(WORKBOOK_CASE, PLACEHOLDER_TICKERS, fees, 'LATER').map((h) => h.marketValueCents);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });
});

describe('models', () => {
  it('offers models for the account funnel first, then the rest by name', () => {
    expect(modelChoices(PLACEHOLDER_MODELS, 'TAX_FREE').map((m) => m.id)).toEqual(['9004', '9003', '9001', '9002']);
  });

  it('shows how a model splits across the buckets', () => {
    expect(modelBucketMix(BALANCED, TICKERS)).toEqual({ NOW: 0, SOON: 4000, LATER: 6000 });
  });
});
