/**
 * US-11 — what percentage of the portfolio sits in each asset class once the
 * buckets are built, and how each bucket is composed.
 *
 * Derived, never stored (decision D2). Every number here is a function of
 * holdings we already have, so persisting it would give us two sources of truth
 * that drift apart. Recomputing is cheap; reconciling two answers is not.
 *
 * Like `worksheet.ts`, this is a provisional home. The real breakdown comes
 * back from `POST /clients/{id}/plan` alongside the rest of the BucketPlan.
 */

import { addCents, type Cents } from '@ai4rig/engine';

import { percentOf } from './money.js';
import { ASSET_CLASSES, BUCKETS } from './types.js';
import type { AssetClass, BucketType, ClientCase, Holding, Ticker } from './types.js';

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
  /** Across the whole portfolio, regardless of bucket. */
  readonly byAssetClass: readonly Slice[];
  readonly byBucket: readonly BucketComposition[];
  /**
   * Holdings whose symbol is not in the approved universe. They still count
   * toward the totals — the money is real — but the advisor is told, because a
   * symbol we cannot classify is usually a typo or a gap in the master list.
   */
  readonly unknownSymbols: readonly string[];
}

function holdingsOf(clientCase: ClientCase): readonly Holding[] {
  return clientCase.accounts.flatMap((account) => account.holdings);
}

function slice(
  holdings: readonly Holding[],
  tickers: ReadonlyMap<string, Ticker>,
  totalCents: Cents,
): readonly Slice[] {
  const totals = new Map<AssetClass, Cents>();

  for (const holding of holdings) {
    const assetClass = tickers.get(holding.tickerSymbol)?.assetClass;
    // An unrecognized symbol is reported separately rather than dropped. Losing
    // it here would make the breakdown quietly disagree with the account total.
    if (assetClass === undefined) continue;
    totals.set(assetClass, addCents(totals.get(assetClass) ?? 0, holding.marketValueCents));
  }

  return ASSET_CLASSES.map((assetClass) => {
    const valueCents = totals.get(assetClass) ?? 0;
    return { assetClass, valueCents, pct: percentOf(valueCents, totalCents) };
  }).filter((s) => s.valueCents !== 0);
}

export function computeBreakdown(
  clientCase: ClientCase,
  tickerList: readonly Ticker[],
): Breakdown {
  const tickers = new Map(tickerList.map((t) => [t.symbol, t]));
  const holdings = holdingsOf(clientCase);
  const totalCents = addCents(...holdings.map((h) => h.marketValueCents));

  const unknownSymbols = [
    ...new Set(holdings.map((h) => h.tickerSymbol).filter((symbol) => !tickers.has(symbol))),
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

  return {
    totalCents,
    byAssetClass: slice(holdings, tickers, totalCents),
    byBucket,
    unknownSymbols,
  };
}

/**
 * True when the advisor moved this holding off the bucket the engine proposed.
 *
 * Derived rather than stored, so it cannot go stale when an administrator edits
 * the ticker's default out from under it (decision D1).
 */
export function isOverride(holding: Holding, tickers: ReadonlyMap<string, Ticker>): boolean {
  const defaultBucket = tickers.get(holding.tickerSymbol)?.defaultBucket;
  return defaultBucket !== undefined && defaultBucket !== holding.assignedBucket;
}
