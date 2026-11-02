import { describe, expect, it } from 'vitest';

import {
  accountCash,
  accountHoldings,
  amountForWeight,
  applyModel,
  atCurrentPrices,
  bucketsByAccount,
  caseAtCurrentPrices,
  caseWithSharesPinned,
  cashForFeeCents,
  computeBreakdown,
  computeDrift,
  feesByAccount,
  followModels,
  holdingsInBucket,
  investableCents,
  leftToAllocateCents,
  linesAsWeights,
  matchesModel,
  modelBucketMix,
  modelChoices,
  modelsById,
  sharesForDollars,
  tickersBySymbol,
  valueOfSharesCents,
  varianceAdvice,
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
    expect(leftToAllocateCents(joint, TICKERS, 12_000_00)).toBe(0);
    expect(leftToAllocateCents(ACCUMULATOR_CASE.accounts[0]!, TICKERS, 4_200_00)).toBe(15_000_00);
    // More in funds than the balance comes back negative.
    expect(leftToAllocateCents({ ...joint, balanceCents: 1_000_000_00 }, TICKERS, 12_000_00)).toBe(-188_000_00);
  });

  it('fills from a model to the exact cent of the amount to invest', () => {
    const filled = applyModel({ ...joint, lines: [] }, BALANCED, 12_000_00);
    expect(filled.modelId).toBe('9003');
    expect(filled.lines.reduce((t, l) => t + l.amountCents, 0)).toBe(1_188_000_00);
    expect(filled.lines.find((l) => l.tickerSymbol === 'VTI')?.amountCents).toBe(415_800_00);
    expect(matchesModel(filled, BALANCED, 12_000_00, TICKERS)).toBe(true);
  });

  it('notices when a fund has been adjusted away from the model', () => {
    const roth = WORKBOOK_CASE.accounts[2]!;
    expect(matchesModel(roth, ROTH_GROWTH, 3_000_00, TICKERS)).toBe(true);
    const adjusted = { ...roth, lines: roth.lines.map((l) => (l.tickerSymbol === 'VTI' ? { ...l, amountCents: 1 } : l)) };
    expect(matchesModel(adjusted, ROTH_GROWTH, 3_000_00, TICKERS)).toBe(false);
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
    expect(linesAsWeights([{ tickerSymbol: 'VTI', amountCents: 0, sharesMicros: null }])).toEqual([]);
  });
});

describe('followModels', () => {
  const roth = WORKBOOK_CASE.accounts[2]!;
  const before = { ...WORKBOOK_CASE, accounts: [roth] };
  const fees = (feeCents: number) => new Map([[roth.id, feeCents]]);

  it('refills an account still on its model when the balance changes', () => {
    const [next] = followModels(before, [{ ...roth, balanceCents: 400_000_00 }], MODELS, fees(3_000_00), fees(4_000_00), TICKERS);
    expect(next!.lines).toEqual([
      { tickerSymbol: 'VTI', amountCents: 237_600_00, sharesMicros: null },
      { tickerSymbol: 'VXUS', amountCents: 158_400_00, sharesMicros: null },
    ]);
  });

  it('refills when only the fee moves, as when another balance changes the tier', () => {
    const [next] = followModels(before, [roth], MODELS, fees(3_000_00), fees(4_500_00), TICKERS);
    expect(next!.lines.reduce((t, l) => t + l.amountCents, 0)).toBe(295_500_00);
  });

  it('leaves an adjusted account alone', () => {
    const adjusted = { ...roth, lines: [{ tickerSymbol: 'VTI', amountCents: 297_000_00, sharesMicros: null }] };
    const [next] = followModels(
      { ...WORKBOOK_CASE, accounts: [adjusted] },
      [{ ...adjusted, balanceCents: 400_000_00 }],
      MODELS,
      fees(3_000_00),
      fees(4_000_00),
      TICKERS,
    );
    expect(next!.lines).toEqual(adjusted.lines);
  });

  it('keeps the edit itself when the funds are what changed', () => {
    const edited = { ...roth, lines: [{ tickerSymbol: 'VTI', amountCents: 1_00, sharesMicros: null }] };
    expect(followModels(before, [edited], MODELS, fees(3_000_00), fees(3_000_00), TICKERS)[0]).toBe(edited);
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

describe('one kind of fund, however it got into the account', () => {
  const MUTUAL_FUND = { symbol: 'ABCDX', name: null, assetClass: 'EQUITY', defaultBucket: 'LATER', priceCents: 263_50, priceMicros: 263_500_000, priceAsOf: '2026-10-30' } as const;
  const tickers = tickersBySymbol([...PLACEHOLDER_TICKERS, MUTUAL_FUND]);
  const repriced = (symbol: string, cents: number) =>
    tickersBySymbol([...PLACEHOLDER_TICKERS, MUTUAL_FUND].map((t) => (t.symbol === symbol ? { ...t, priceCents: cents, priceMicros: cents * 10_000 } : t)));

  const blank = { ...ACCUMULATOR_CASE.accounts[0]!, modelId: null, balanceCents: 100_000_00, lines: [] };
  const withDollars = (tickerSymbol: string, amountCents: number) => ({ tickerSymbol, amountCents, sharesMicros: null });
  /** The way an imported statement looks: the balance is the funds, nothing else. */
  const statement = {
    ...blank,
    balanceCents: 59_000_00,
    lines: [
      { tickerSymbol: 'SGOV', amountCents: 9_000_00, sharesMicros: 90_000_000 },
      { tickerSymbol: 'VTI', amountCents: 50_000_00, sharesMicros: 166_666_667 },
    ],
  };

  it('turns dollars into whole shares of an ETF, and the rest stays in the balance as cash', () => {
    // 166 × $300 = $49,800 of the $50,000 typed.
    const placed = atCurrentPrices({ ...blank, lines: [withDollars('VTI', 50_000_00)] }, tickers);
    expect(placed.lines[0]).toEqual({ tickerSymbol: 'VTI', amountCents: 49_800_00, sharesMicros: 166_000_000 });
    expect(placed.balanceCents).toBe(100_000_00);
  });

  it('turns dollars into a fraction of a mutual fund or cash fund, landing on the same cent', () => {
    const placed = atCurrentPrices({ ...blank, lines: [withDollars('ABCDX', 50_000_00), withDollars('SGOV', 1_234_56)] }, tickers);
    expect(placed.lines.map((l) => l.amountCents)).toEqual([50_000_00, 1_234_56]);
    expect(placed.lines[0]?.sharesMicros).toBe(189_753_321);
    expect(placed.balanceCents).toBe(100_000_00);
  });

  it('does not lose a share to rounding when dollars came from a share count', () => {
    const exact = { symbol: 'SPYI', name: null, assetClass: 'EQUITY', defaultBucket: 'LATER', priceCents: 53_01, priceMicros: 53_009_200, priceAsOf: null } as const;
    expect(sharesForDollars(109_198_95, exact, 53_009_200)).toBe(2_060_000_000);
  });

  it('lets typed shares move the balance, since that is what the client owns', () => {
    const sold = { ...statement, lines: statement.lines.map((l) => (l.tickerSymbol === 'VTI' ? { ...l, sharesMicros: 100_000_000 } : l)) };
    const valued = atCurrentPrices(sold, tickers);
    expect(valued.lines[1]?.amountCents).toBe(30_000_00);
    expect(valued.balanceCents).toBe(39_000_00);
  });

  it('builds a balance from shares typed on an empty account', () => {
    const typed = { ...blank, balanceCents: 0, lines: [{ tickerSymbol: 'VTI', amountCents: 0, sharesMicros: 10_000_000 }] };
    expect(atCurrentPrices(typed, tickers).balanceCents).toBe(3_000_00);
  });

  it('keeps dollars typed into an imported account inside the balance', () => {
    // The old behavior raised the balance by $50,000.
    const account = atCurrentPrices(statement, tickers);
    const typed = atCurrentPrices({ ...account, lines: [...account.lines, withDollars('BND', 50_000_00)] }, tickers);
    expect(typed.balanceCents).toBe(account.balanceCents);
    expect(leftToAllocateCents(typed, tickers, 0)).toBeLessThan(-49_000_00);
  });

  it('moves dollars and the balance when a price moves, on every account, and leaves cash alone', () => {
    const placed = atCurrentPrices({ ...blank, lines: [withDollars('VTI', 50_000_00)] }, tickers);
    const later = atCurrentPrices(placed, repriced('VTI', 320_00));
    expect(later.lines[0]).toEqual({ tickerSymbol: 'VTI', amountCents: 53_120_00, sharesMicros: 166_000_000 });
    // $50,200 of cash from before, plus the same 166 shares at the new price.
    expect(later.balanceCents).toBe(50_200_00 + 53_120_00);
  });

  it('holds dollars until there is a price, then makes them shares without touching the balance', () => {
    const noPrice = tickersBySymbol(PLACEHOLDER_TICKERS.map((t) => (t.symbol === 'VTI' ? { ...t, priceCents: null, priceMicros: null } : t)));
    const waiting = atCurrentPrices({ ...blank, lines: [withDollars('VTI', 50_000_00)] }, noPrice);
    expect(waiting.lines[0]).toEqual(withDollars('VTI', 50_000_00));
    const priced = atCurrentPrices(waiting, tickers);
    expect(priced.lines[0]?.sharesMicros).toBe(166_000_000);
    expect(priced.balanceCents).toBe(100_000_00);
  });

  it('values shares at the exact price, so they match the statement', () => {
    // 2,060 × $53.0092 = $109,198.952: the statement's $109,198.95, where the
    // cent-rounded $53.01 would give $109,200.60.
    expect(valueOfSharesCents(2_060_000_000, 53_009_200)).toBe(109_198_95);
    // Large enough that a double would lose it: 93,572.35 shares at $1.
    expect(valueOfSharesCents(93_572_350_000, 1_000_000)).toBe(93_572_35);
  });

  it('moves the balance on a later price once dollars are pinned to shares', () => {
    const filled = { ...WORKBOOK_CASE, accounts: [{ ...blank, lines: [withDollars('VTI', 50_000_00)] }] };
    const pinned = caseWithSharesPinned(filled, PLACEHOLDER_TICKERS);
    expect(pinned.accounts[0]?.lines[0]?.sharesMicros).toBe(166_000_000);
    expect(pinned.accounts[0]?.balanceCents).toBe(100_000_00);

    const up = PLACEHOLDER_TICKERS.map((t) => (t.symbol === 'VTI' ? { ...t, priceCents: 320_00, priceMicros: 320_000_000 } : t));
    const shown = caseAtCurrentPrices(pinned, up).accounts[0]!;
    expect(shown.lines[0]?.sharesMicros).toBe(166_000_000);
    expect(shown.balanceCents).toBe(100_000_00 + 166 * 20_00);

    // Left in dollars, the same new price just buys fewer shares: the bug this prevents.
    expect(caseAtCurrentPrices(filled, up).accounts[0]?.balanceCents).toBe(100_000_00);
  });

  it('pins only what is still in dollars, without revaluing anything else', () => {
    const settled = { ...WORKBOOK_CASE, accounts: [statement] };
    expect(caseWithSharesPinned(settled, PLACEHOLDER_TICKERS)).toBe(settled);
    const noPrice = PLACEHOLDER_TICKERS.map((t) => (t.symbol === 'VTI' ? { ...t, priceCents: null, priceMicros: null } : t));
    const waiting = { ...WORKBOOK_CASE, accounts: [{ ...blank, lines: [withDollars('VTI', 50_000_00)] }] };
    expect(caseWithSharesPinned(waiting, noPrice)).toBe(waiting);
  });

  it('comes back as the same object when nothing moved', () => {
    const settled = atCurrentPrices(statement, tickers);
    expect(atCurrentPrices(settled, tickers)).toBe(settled);
    const settledCase = caseAtCurrentPrices(WORKBOOK_CASE, PLACEHOLDER_TICKERS);
    expect(caseAtCurrentPrices(settledCase, PLACEHOLDER_TICKERS)).toBe(settledCase);
  });

  it('pays the fee from cash funds when an imported account has no other cash', () => {
    const valued = atCurrentPrices(statement, tickers);
    expect(investableCents(valued, 900_00)).toBe(valued.balanceCents);
    expect(leftToAllocateCents(valued, tickers, 900_00)).toBe(0);
    expect(cashForFeeCents(valued, tickers)).toBe(9_000_00);
    // No separate fee cash: SGOV already is the cash.
    expect(accountHoldings(valued, tickers, 900_00).map((h) => h.tickerSymbol)).toEqual(['SGOV', 'VTI']);
  });

  it('holds the fee back from the same kind of account when it has the money', () => {
    const open = atCurrentPrices({ ...statement, balanceCents: statement.balanceCents + 5_000_00 }, tickers);
    const cash = accountCash(open, tickers, 900_00);
    expect(cash.feeCashCents).toBe(900_00);
    expect(investableCents(open, 900_00)).toBe(open.balanceCents - 900_00);
    expect(accountHoldings(open, tickers, 900_00)[0]?.tickerSymbol).toBeNull();
  });

  it('counts what whole shares leave behind as cash, not as work left to do', () => {
    const model = { id: 'm', name: 'All VTI', taxFunnel: null, lines: [{ tickerSymbol: 'VTI', weightBps: 10_000 }] };
    const filled = atCurrentPrices(applyModel({ ...blank, balanceCents: 100_000_00 }, model, 1_000_00), tickers);
    // $99,000 at $300 is exactly 330 shares; a nudge in the balance leaves change.
    const change = { ...filled, balanceCents: 100_000_00 + 250_00 };
    expect(accountCash(change, tickers, 1_000_00)).toEqual({
      uninvestedCents: 1_250_00,
      feeCashCents: 1_000_00,
      roundingCents: 250_00,
      leftCents: 0,
    });
    expect(accountHoldings(change, tickers, 1_000_00)[0]?.marketValueCents).toBe(1_250_00);
    // More than a share's price is money still to place.
    const more = { ...filled, balanceCents: 100_000_00 + 400_00 };
    expect(accountCash(more, tickers, 1_000_00)).toMatchObject({ roundingCents: 0, leftCents: 400_00 });
  });

  it('still matches its model right after a fill, and not once prices have moved it', () => {
    const model = { id: 'm', name: 'Split', taxFunnel: null, lines: [{ tickerSymbol: 'VTI', weightBps: 5_000 }, { tickerSymbol: 'ABCDX', weightBps: 5_000 }] };
    const filled = atCurrentPrices(applyModel(blank, model, 1_000_00), tickers);
    expect(matchesModel(filled, model, 1_000_00, tickers)).toBe(true);

    const moved = repriced('VTI', 400_00);
    const later = atCurrentPrices(filled, moved);
    expect(matchesModel(later, model, 1_000_00, moved)).toBe(false);

    // Typing a new balance then changes the cash, not the shares.
    const models = new Map([['m', model]]);
    const fee = new Map([[blank.id, 1_000_00]]);
    const asTyped = { ...later, modelId: 'm', balanceCents: later.balanceCents + 10_000_00 };
    const [next] = followModels({ ...WORKBOOK_CASE, accounts: [{ ...later, modelId: 'm' }] }, [asTyped], models, fee, fee, moved);
    expect(next).toBe(asTyped);
  });

  it('does not refill a model account when neither its balance nor its fee changed', () => {
    const model = { id: 'm', name: 'All VTI', taxFunnel: null, lines: [{ tickerSymbol: 'VTI', weightBps: 10_000 }] };
    const filled = atCurrentPrices(applyModel(blank, model, 1_000_00), tickers);
    const fee = new Map([[blank.id, 1_000_00]]);
    const [next] = followModels({ ...WORKBOOK_CASE, accounts: [filled] }, [filled], new Map([['m', model]]), fee, fee, tickers);
    expect(next).toBe(filled);
  });

  it('shows the shares a fund holds in the bucket list', () => {
    const clientCase = { ...WORKBOOK_CASE, accounts: [atCurrentPrices(statement, tickers)] };
    const later = holdingsInBucket(clientCase, [...PLACEHOLDER_TICKERS, MUTUAL_FUND], new Map(), 'LATER');
    expect(later.find((h) => h.symbol === 'VTI')?.shares).toBeCloseTo(166.666667, 6);
  });
});

describe('varianceAdvice', () => {
  it('says money in Now or Soon beyond the need could be in Later, never that Later is short', () => {
    expect(varianceAdvice(137_602_00, 177_300_00)).toEqual([
      'Now and Soon hold $314,902 more than the plan needs. That money could be in Later funds, for growth.',
    ]);
  });

  it('says when Now or Soon is short of the need', () => {
    expect(varianceAdvice(-5_000_00, 2_000_00)).toEqual([
      'Soon holds $2,000 more than the plan needs. That money could be in Later funds, for growth.',
      "Now is $5,000 short of the next year's needs. Put more in cash funds.",
    ]);
    expect(varianceAdvice(-5_000_00, 0, 5_000_00)[0]).toBe('$5,000 is not in a fund yet. Pick a model or add funds to the accounts.');
    expect(varianceAdvice(0, 0)).toEqual([]);
  });
});
