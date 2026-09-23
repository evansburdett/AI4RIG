/**
 * Where a client's money sits, worked out from what the advisor entered: each
 * account's balance, how much of it is in Now / Soon / Later, and the model
 * each of those follows.
 *
 * Positions ("holdings") are never entered or stored. They come from a
 * bucket's dollars times its model's weights, recomputed on every render
 * (decision D2). US-11 asset class breakdown and the drift against the
 * worksheet both read from here.
 *
 * Provisional home: this belongs in packages/engine next to splitByWeights.
 * It is pure, so moving it is a file move.
 */

import { addCents, splitByWeights, type Cents } from '@ai4rig/engine';

import { percentOf } from './money.js';
import { ASSET_CLASSES, BUCKETS } from './types.js';
import type {
  Account,
  AccountType,
  AllocationTarget,
  AssetClass,
  BucketType,
  ClientCase,
  Holding,
  ModelPortfolio,
  TaxFunnel,
  Ticker,
} from './types.js';

// ---------------------------------------------------------------------------
// One account
// ---------------------------------------------------------------------------

export function allocatedCents(account: Account): Cents {
  return addCents(...account.sleeves.map((s) => s.amountCents));
}

/** Balance not yet placed in any bucket. Negative when the buckets add up to more than the balance. */
export function unallocatedCents(account: Account): Cents {
  return account.balanceCents - allocatedCents(account);
}

/**
 * The positions one account's bucket works out to. Empty when the bucket has
 * no money or no model, or the model is missing or does not add up to 100%.
 */
export function sleeveHoldings(
  account: Account,
  bucket: BucketType,
  models: ReadonlyMap<string, ModelPortfolio>,
): Holding[] {
  const sleeve = account.sleeves.find((s) => s.bucket === bucket);
  if (sleeve === undefined || sleeve.modelId === null || sleeve.amountCents <= 0) return [];

  const model = models.get(sleeve.modelId);
  if (model === undefined || model.lines.length === 0) return [];

  try {
    return splitByWeights(
      sleeve.amountCents,
      model.lines.map((line) => ({ key: line.tickerSymbol, weightBps: line.weightBps })),
    ).map((share) => ({
      accountId: account.id,
      bucket,
      modelId: model.id,
      tickerSymbol: share.key,
      marketValueCents: share.amountCents,
    }));
  } catch {
    // A model that does not add up to 100% cannot be saved, so this is only
    // reachable with bad data. Show the money as unmodeled rather than crash.
    return [];
  }
}

export function accountHoldings(account: Account, models: ReadonlyMap<string, ModelPortfolio>): Holding[] {
  return BUCKETS.flatMap((bucket) => sleeveHoldings(account, bucket, models));
}

export function modelsById(models: readonly ModelPortfolio[]): Map<string, ModelPortfolio> {
  return new Map(models.map((m) => [m.id, m]));
}

/**
 * Models offered for one account's bucket: that bucket's models, ones meant
 * for the account's tax funnel first, then ones for any funnel, then the rest.
 */
export function modelChoices(
  models: readonly ModelPortfolio[],
  bucket: BucketType,
  taxFunnel: TaxFunnel,
): ModelPortfolio[] {
  const rank = (m: ModelPortfolio) => (m.taxFunnel === taxFunnel ? 0 : m.taxFunnel === null ? 1 : 2);
  return models
    .filter((m) => m.bucket === bucket)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// The whole case
// ---------------------------------------------------------------------------

export interface Slice {
  readonly assetClass: AssetClass;
  readonly valueCents: Cents;
  readonly pct: number;
}

export interface BucketComposition {
  readonly bucket: BucketType;
  /** Everything the advisor put in this bucket, with or without a model. */
  readonly valueCents: Cents;
  readonly pctOfPortfolio: number;
  /** In this bucket but with no model chosen, so no asset class. */
  readonly unmodeledCents: Cents;
  readonly slices: readonly Slice[];
}

export interface Breakdown {
  /** Sum of account balances. */
  readonly totalCents: Cents;
  /** Balance not in any bucket yet, across all accounts. */
  readonly unallocatedCents: Cents;
  /** Money in a bucket with no model chosen, across all buckets. */
  readonly unmodeledCents: Cents;
  readonly byAssetClass: readonly Slice[];
  readonly byBucket: readonly BucketComposition[];
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

export function computeBreakdown(
  clientCase: ClientCase,
  tickerList: readonly Ticker[],
  modelList: readonly ModelPortfolio[],
): Breakdown {
  const tickers = new Map(tickerList.map((t) => [t.symbol, t]));
  const models = modelsById(modelList);
  const holdings = clientCase.accounts.flatMap((account) => accountHoldings(account, models));
  const totalCents = addCents(...clientCase.accounts.map((a) => a.balanceCents));

  const byBucket = BUCKETS.map((bucket): BucketComposition => {
    const valueCents = addCents(
      ...clientCase.accounts.map((a) => a.sleeves.find((s) => s.bucket === bucket)?.amountCents ?? 0),
    );
    const inBucket = holdings.filter((h) => h.bucket === bucket);
    const modeledCents = addCents(...inBucket.map((h) => h.marketValueCents));
    return {
      bucket,
      valueCents,
      pctOfPortfolio: percentOf(valueCents, totalCents),
      unmodeledCents: valueCents - modeledCents,
      slices: slice(inBucket, tickers, valueCents),
    };
  });

  const allocated = addCents(...byBucket.map((b) => b.valueCents));

  return {
    totalCents,
    unallocatedCents: totalCents - allocated,
    unmodeledCents: addCents(...byBucket.map((b) => b.unmodeledCents)),
    byAssetClass: slice(holdings, tickers, totalCents),
    byBucket,
  };
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
 * What the advisor has put in each bucket against what the worksheet says
 * the client needs there. The gap is the thing the advisor acts on.
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
  readonly taxFunnel: TaxFunnel;
  readonly maskedNumber: string;
  readonly nowCents: Cents;
  readonly soonCents: Cents;
  readonly laterCents: Cents;
  readonly unallocatedCents: Cents;
  readonly balanceCents: Cents;
}

/**
 * Now / Soon / Later per account, which RIG asked for directly: "Each account
 * type would have now, soon and later buckets. The tool would be able to show
 * the detail per account, then nice clean summary that is the total of all the
 * accounts."
 */
export function bucketsByAccount(clientCase: ClientCase): AccountBuckets[] {
  return clientCase.accounts.map((account) => {
    const amount = (bucket: BucketType) =>
      account.sleeves.find((s) => s.bucket === bucket)?.amountCents ?? 0;

    return {
      accountId: account.id,
      accountType: account.accountType,
      taxFunnel: account.taxFunnel,
      maskedNumber: account.maskedNumber,
      nowCents: amount('NOW'),
      soonCents: amount('SOON'),
      laterCents: amount('LATER'),
      unallocatedCents: unallocatedCents(account),
      balanceCents: account.balanceCents,
    };
  });
}

export interface BucketHolding {
  readonly key: string;
  readonly symbol: string;
  readonly accountType: AccountType;
  readonly maskedNumber: string;
  readonly modelName: string;
  readonly marketValueCents: Cents;
  readonly assetClass: AssetClass | null;
  /** RIG's mapping puts this ticker in a different bucket than the model does. */
  readonly outsideDefaultBucket: boolean;
}

/** The positions in one bucket, across every account, largest first. */
export function holdingsInBucket(
  clientCase: ClientCase,
  tickerList: readonly Ticker[],
  modelList: readonly ModelPortfolio[],
  bucket: BucketType,
): BucketHolding[] {
  const tickers = new Map(tickerList.map((t) => [t.symbol, t]));
  const models = modelsById(modelList);

  return clientCase.accounts
    .flatMap((account) =>
      sleeveHoldings(account, bucket, models).map((holding) => {
        const ticker = tickers.get(holding.tickerSymbol);
        return {
          key: `${account.id}:${bucket}:${holding.tickerSymbol}`,
          symbol: holding.tickerSymbol,
          accountType: account.accountType,
          maskedNumber: account.maskedNumber,
          modelName: models.get(holding.modelId)?.name ?? '',
          marketValueCents: holding.marketValueCents,
          assetClass: ticker?.assetClass ?? null,
          outsideDefaultBucket: ticker !== undefined && ticker.defaultBucket !== bucket,
        };
      }),
    )
    .sort((a, b) => b.marketValueCents - a.marketValueCents);
}
