/**
 * US-11 — asset class distribution, overall and per bucket.
 *
 * Derived on every render, never stored (decision D2). Provisional home; this
 * belongs in packages/engine alongside the rest of the BucketPlan.
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
