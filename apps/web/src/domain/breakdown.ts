/**
 * US-11 — asset class distribution, overall and per bucket.
 *
 * Derived on every render, never stored (decision D2). Provisional home; this
 * belongs in packages/engine alongside the rest of the BucketPlan.
 */

import { addCents, type Cents } from '@ai4rig/engine';

import { percentOf } from './money.js';
import { ASSET_CLASSES, BUCKETS } from './types.js';
import type {
  AccountType,
  AllocationTarget,
  AssetClass,
  BucketType,
  ClientCase,
  Holding,
  Ticker,
} from './types.js';

export interface Slice {
  readonly assetClass: AssetClass;
  readonly valueCents: Cents;
  readonly pct: number;
}

export interface BucketComposition {
  readonly bucket: BucketType;
  readonly valueCents: Cents;
  readonly pctOfPortfolio: number;
  readonly slices: readonly Slice[];
}

export interface Breakdown {
  readonly totalCents: Cents;
  readonly byAssetClass: readonly Slice[];
  readonly byBucket: readonly BucketComposition[];
  /** Held but not in the ticker list. Counted in totals, but unclassifiable. */
  readonly unknownSymbols: readonly string[];
}

function slice(
  holdings: readonly Holding[],
  tickers: ReadonlyMap<string, Ticker>,
  totalCents: Cents,
): readonly Slice[] {
  const totals = new Map<AssetClass, Cents>();

  for (const holding of holdings) {
    const assetClass = tickers.get(holding.tickerSymbol)?.assetClass;
    if (assetClass === undefined) continue;
    totals.set(assetClass, addCents(totals.get(assetClass) ?? 0, holding.marketValueCents));
  }

  return ASSET_CLASSES.map((assetClass) => {
    const valueCents = totals.get(assetClass) ?? 0;
    return { assetClass, valueCents, pct: percentOf(valueCents, totalCents) };
  }).filter((s) => s.valueCents !== 0);
}

export function computeBreakdown(clientCase: ClientCase, tickerList: readonly Ticker[]): Breakdown {
  const tickers = new Map(tickerList.map((t) => [t.symbol, t]));
  const holdings = clientCase.accounts.flatMap((account) => account.holdings);
  const totalCents = addCents(...holdings.map((h) => h.marketValueCents));

  const unknownSymbols = [
    ...new Set(
      holdings
        .map((h) => h.tickerSymbol)
        .filter((symbol) => symbol !== '' && !tickers.has(symbol)),
    ),
  ].sort();

  const byBucket = BUCKETS.map((bucket) => {
    const inBucket = holdings.filter((h) => h.assignedBucket === bucket);
    const valueCents = addCents(...inBucket.map((h) => h.marketValueCents));
    return {
      bucket,
      valueCents,
      pctOfPortfolio: percentOf(valueCents, totalCents),
      slices: slice(inBucket, tickers, valueCents),
    };
  });

  return { totalCents, byAssetClass: slice(holdings, tickers, totalCents), byBucket, unknownSymbols };
}

export interface BucketDrift {
  readonly bucket: BucketType;
  readonly targetCents: Cents;
  readonly actualCents: Cents;
  /** Actual minus target. Positive means over-funded against the plan. */
  readonly deltaCents: Cents;
  readonly targetPct: number;
  readonly actualPct: number;
}

/**
 * Where the holdings sit against where the worksheet says they should sit.
 *
 * Target comes from the client's Now / Soon / Later inputs; actual comes from
 * the bucket each holding is assigned to. The gap between them is the thing the
 * advisor acts on.
 */
export function computeDrift(target: AllocationTarget, breakdown: Breakdown): BucketDrift[] {
  const targetByBucket: Record<BucketType, Cents> = {
    NOW: target.nowCents,
    SOON: target.soonCents,
    LATER: target.laterCents,
  };

  return breakdown.byBucket.map((composition) => {
    const targetCents = targetByBucket[composition.bucket];
    return {
      bucket: composition.bucket,
      targetCents,
      actualCents: composition.valueCents,
      deltaCents: composition.valueCents - targetCents,
      targetPct: percentOf(targetCents, breakdown.totalCents),
      actualPct: composition.pctOfPortfolio,
    };
  });
}

export interface AccountBuckets {
  readonly accountId: string;
  readonly accountType: AccountType;
  readonly maskedNumber: string;
  readonly nowCents: Cents;
  readonly soonCents: Cents;
  readonly laterCents: Cents;
  readonly totalCents: Cents;
}

/**
 * Now / Soon / Later per account, which RIG asked for directly: "Each account
 * type would have now, soon and later buckets. The tool would be able to show
 * the detail per account, then nice clean summary that is the total of all the
 * accounts."
 */
export function bucketsByAccount(clientCase: ClientCase): AccountBuckets[] {
  return clientCase.accounts.map((account) => {
    const sum = (bucket: BucketType) =>
      addCents(
        ...account.holdings
          .filter((h) => h.assignedBucket === bucket)
          .map((h) => h.marketValueCents),
      );

    const nowCents = sum('NOW');
    const soonCents = sum('SOON');
    const laterCents = sum('LATER');

    return {
      accountId: account.id,
      accountType: account.accountType,
      maskedNumber: account.maskedNumber,
      nowCents,
      soonCents,
      laterCents,
      totalCents: addCents(nowCents, soonCents, laterCents),
    };
  });
}
