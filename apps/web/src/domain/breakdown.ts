/**
 * Actual account and bucket values come from stored shares multiplied by
 * manually maintained ticker prices. Model-weighted holdings are calculated
 * separately as target guidance and never substitute for actual positions.
 */

import { addCents, positionValueCents, splitByWeights, type Cents } from '@ai4rig/engine';

import { percentOf } from './money.js';
import { ASSET_CLASSES, BUCKETS } from './types.js';
import type {
  Account,
  AccountPosition,
  SleeveLine,
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

export interface ValuedPosition extends AccountPosition {
  readonly priceCents: Cents | null;
  readonly marketValueCents: Cents | null;
}

export function valuedPositions(
  account: Account,
  tickerList: readonly Ticker[],
): ValuedPosition[] {
  const tickers = new Map(tickerList.map((ticker) => [ticker.symbol, ticker]));
  return account.positions.map((position) => {
    const priceCents = tickers.get(position.tickerSymbol)?.priceCents ?? null;
    return {
      ...position,
      priceCents,
      marketValueCents:
        priceCents === null
          ? null
          : positionValueCents(position.sharesMicros, priceCents),
    };
  });
}

export function accountValueCents(account: Account, tickerList: readonly Ticker[]): Cents {
  return addCents(
    ...valuedPositions(account, tickerList)
      .flatMap((position) =>
        position.marketValueCents === null ? [] : [position.marketValueCents],
      ),
  );
}

/**
 * The positions one account's bucket works out to, whether it follows a model
 * or the advisor's own lines. Empty when the bucket holds no money, has
 * nothing to follow, or its weights do not add up to 100%.
 */
export function sleeveHoldings(
  account: Account,
  bucket: BucketType,
  models: ReadonlyMap<string, ModelPortfolio>,
): Holding[] {
  const sleeve = account.sleeves.find((s) => s.bucket === bucket);
  if (sleeve === undefined || sleeve.amountCents <= 0) return [];

  // Both modes come down to the same thing: a list of weights, and the id of
  // the model they came from when there is one.
  let lines: readonly SleeveLine[];
  let modelId: string | null;

  if (sleeve.mode === 'MANUAL') {
    lines = sleeve.lines;
    modelId = null;
  } else {
    const model = sleeve.modelId === null ? undefined : models.get(sleeve.modelId);
    if (model === undefined) return [];
    lines = model.lines;
    modelId = model.id;
  }

  if (lines.length === 0) return [];

  try {
    return splitByWeights(
      sleeve.amountCents,
      lines.map((line) => ({ key: line.tickerSymbol, weightBps: line.weightBps })),
    ).map((share) => ({
      accountId: account.id,
      bucket,
      modelId,
      tickerSymbol: share.key,
      marketValueCents: share.amountCents,
    }));
  } catch {
    // Manual lines are allowed to be half-finished, and a model that does not
    // add up cannot be saved, so this is the normal "not done yet" path. The
    // money shows as unmodeled rather than as wrong positions.
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
  /** Sum of priced actual positions assigned to this bucket. */
  readonly valueCents: Cents;
  readonly pctOfPortfolio: number;
  readonly slices: readonly Slice[];
}

export interface Breakdown {
  /** Sum of priced actual positions. */
  readonly totalCents: Cents;
  /** Positive-share positions whose ticker has no price yet. */
  readonly unpricedPositionCount: number;
  readonly byAssetClass: readonly Slice[];
  readonly byBucket: readonly BucketComposition[];
}

function slice(
  holdings: readonly Pick<Holding, 'tickerSymbol' | 'marketValueCents'>[],
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
): Breakdown {
  const tickers = new Map(tickerList.map((t) => [t.symbol, t]));
  const valued = clientCase.accounts.flatMap((account) =>
    valuedPositions(account, tickerList).map((position) => ({ account, position })),
  );
  const holdings = valued.flatMap(({ account, position }) =>
    position.marketValueCents === null
      ? []
      : [{
          accountId: account.id,
          bucket: position.bucket,
          tickerSymbol: position.tickerSymbol,
          marketValueCents: position.marketValueCents,
        }],
  );
  const totalCents = addCents(...holdings.map((holding) => holding.marketValueCents));

  const byBucket = BUCKETS.map((bucket): BucketComposition => {
    const valueCents = addCents(
      ...holdings
        .filter((holding) => holding.bucket === bucket)
        .map((holding) => holding.marketValueCents),
    );
    const inBucket = holdings.filter((h) => h.bucket === bucket);
    return {
      bucket,
      valueCents,
      pctOfPortfolio: percentOf(valueCents, totalCents),
      slices: slice(inBucket, tickers, valueCents),
    };
  });

  return {
    totalCents,
    unpricedPositionCount: valued.filter(
      ({ position }) => position.sharesMicros > 0 && position.marketValueCents === null,
    ).length,
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
  readonly balanceCents: Cents;
  readonly unpricedPositionCount: number;
}

/**
 * Now / Soon / Later per account, which RIG asked for directly: "Each account
 * type would have now, soon and later buckets. The tool would be able to show
 * the detail per account, then nice clean summary that is the total of all the
 * accounts."
 */
export function bucketsByAccount(
  clientCase: ClientCase,
  tickerList: readonly Ticker[],
): AccountBuckets[] {
  return clientCase.accounts.map((account) => {
    const amount = (bucket: BucketType) =>
      addCents(
        ...valuedPositions(account, tickerList)
          .filter((position) => position.bucket === bucket && position.marketValueCents !== null)
          .map((position) => position.marketValueCents ?? 0),
      );

    return {
      accountId: account.id,
      accountType: account.accountType,
      taxFunnel: account.taxFunnel,
      maskedNumber: account.maskedNumber,
      nowCents: amount('NOW'),
      soonCents: amount('SOON'),
      laterCents: amount('LATER'),
      balanceCents: accountValueCents(account, tickerList),
      unpricedPositionCount: valuedPositions(account, tickerList).filter(
        (position) => position.sharesMicros > 0 && position.marketValueCents === null,
      ).length,
    };
  });
}

export interface BucketHolding {
  readonly key: string;
  readonly symbol: string;
  readonly accountType: AccountType;
  readonly maskedNumber: string;
  readonly sharesMicros: number;
  readonly priceCents: Cents | null;
  readonly marketValueCents: Cents | null;
  readonly assetClass: AssetClass | null;
  /** RIG's default mapping puts this ticker in a different bucket than assigned. */
  readonly outsideDefaultBucket: boolean;
}

/** Actual positions in one bucket, across every account, largest first. */
export function holdingsInBucket(
  clientCase: ClientCase,
  tickerList: readonly Ticker[],
  bucket: BucketType,
): BucketHolding[] {
  const tickers = new Map(tickerList.map((t) => [t.symbol, t]));

  return clientCase.accounts
    .flatMap((account) =>
      valuedPositions(account, tickerList)
        .filter((position) => position.bucket === bucket)
        .map((position) => {
          const ticker = tickers.get(position.tickerSymbol);
          return {
            key: `${account.id}:${bucket}:${position.tickerSymbol}`,
            symbol: position.tickerSymbol,
            accountType: account.accountType,
            maskedNumber: account.maskedNumber,
            sharesMicros: position.sharesMicros,
            priceCents: position.priceCents,
            marketValueCents: position.marketValueCents,
            assetClass: ticker?.assetClass ?? null,
            outsideDefaultBucket: ticker !== undefined && ticker.defaultBucket !== bucket,
          };
        }),
    )
    .sort((a, b) => (b.marketValueCents ?? 0) - (a.marketValueCents ?? 0));
}

export function revalueClientCase(
  clientCase: ClientCase,
  tickerList: readonly Ticker[],
): ClientCase {
  return {
    ...clientCase,
    accounts: clientCase.accounts.map((account) => ({
      ...account,
      balanceCents: accountValueCents(account, tickerList),
    })),
  };
}
