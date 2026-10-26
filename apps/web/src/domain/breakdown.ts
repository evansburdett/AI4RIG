/**
 * Where a client's money sits, worked out from what the advisor entered.
 *
 * RIG allocates by account (10/26). Each account's advisory fee is held as
 * cash and counts toward Now. The rest of the balance, the amount to invest,
 * goes into funds: usually filled from a model, then adjusted fund by fund.
 * Each fund counts toward its ticker's default bucket, so the Now / Soon /
 * Later totals are added up from the funds rather than typed.
 *
 * Provisional home: this belongs in packages/engine next to splitByWeights.
 * It is pure, so moving it is a file move.
 */

import { WHOLE_BPS, addCents, splitByWeights, wholeShares, type Cents } from '@ai4rig/engine';

import { percentOf } from './money.js';
import { ASSET_CLASSES, BUCKETS } from './types.js';
import type {
  Account,
  AccountLine,
  AccountType,
  AllocationTarget,
  AssetClass,
  BucketType,
  ClientCase,
  Holding,
  ModelLine,
  ModelPortfolio,
  TaxFunnel,
  Ticker,
} from './types.js';
import type { AccountFee } from './worksheet.js';

/** Each account's fee, by account id, for looking up as the accounts are walked. */
export type FeesByAccount = ReadonlyMap<string, Cents>;

export function feesByAccount(fees: readonly AccountFee[]): FeesByAccount {
  return new Map(fees.map((fee) => [fee.accountId, fee.feeCents]));
}

// ---------------------------------------------------------------------------
// One account
// ---------------------------------------------------------------------------

/** The money in the account's funds. */
export function allocatedCents(account: Account): Cents {
  return addCents(...account.lines.map((line) => line.amountCents));
}

/**
 * Whether the account is what a client holds, from a statement, rather than
 * a plan to invest a balance: at least one fund carries the shares it holds.
 * RIG (meeting, 10/26): shares rarely change between reviews, the price is
 * live, and the value should be today's without anyone retyping it.
 */
export function holdsShares(account: Account): boolean {
  return account.lines.some((line) => line.heldSharesMicros !== null);
}

/** A ticker's exact price in millionths of a dollar, or its price in cents when that is all there is. */
export function exactPriceMicros(ticker: Ticker | undefined): number | null {
  if (ticker === undefined) return null;
  return ticker.priceMicros ?? (ticker.priceCents === null ? null : ticker.priceCents * 10_000);
}

/**
 * Shares times an exact price, to the cent, rounded once. Both are
 * millionths, so the product is held as a BigInt: 93,572.35 shares of a
 * money market at $1.000000 is already past what a double holds exactly.
 */
export function heldValueCents(sharesMicros: number, priceMicros: number): Cents {
  const product = BigInt(sharesMicros) * BigInt(priceMicros);
  return Number((product + 5_000_000_000n) / 10_000_000_000n);
}

/**
 * A statement account at today's prices: each held fund is worth its shares
 * times the ticker's current price, and the balance is what the funds add up
 * to, so it is never typed. A fund with no price keeps its last value. Any
 * other account comes back unchanged (the same object).
 */
export function atCurrentPrices(account: Account, tickers: ReadonlyMap<string, Ticker>): Account {
  if (!holdsShares(account)) return account;
  const lines = account.lines.map((line) => {
    const price = exactPriceMicros(tickers.get(line.tickerSymbol));
    if (line.heldSharesMicros === null || price === null) return line;
    const amountCents = heldValueCents(line.heldSharesMicros, price);
    return amountCents === line.amountCents ? line : { ...line, amountCents };
  });
  const balanceCents = addCents(...lines.map((line) => line.amountCents));
  const unchanged = balanceCents === account.balanceCents && lines.every((line, i) => line === account.lines[i]);
  return unchanged ? account : { ...account, lines, balanceCents };
}

/** Every statement account in the case at today's prices. The same object when nothing moved. */
export function caseAtCurrentPrices(clientCase: ClientCase, tickerList: readonly Ticker[]): ClientCase {
  const tickers = tickersBySymbol(tickerList);
  const accounts = clientCase.accounts.map((account) => atCurrentPrices(account, tickers));
  return accounts.every((account, i) => account === clientCase.accounts[i]) ? clientCase : { ...clientCase, accounts };
}

/**
 * What the account has in cash funds (money market, sweep) against a year of
 * its fee. For a statement account the fee is paid from cash it already
 * holds, so this is the check that it can be.
 */
export function cashForFeeCents(account: Account, tickers: ReadonlyMap<string, Ticker>): Cents {
  return addCents(
    ...account.lines
      .filter((line) => tickers.get(line.tickerSymbol)?.assetClass === 'CASH')
      .map((line) => line.amountCents),
  );
}

/**
 * The balance less the fee cash: what the funds should add up to. A
 * statement account's balance is its funds, fee cash included in whatever
 * cash it holds, so all of it counts.
 */
export function investableCents(account: Account, feeCents: Cents): Cents {
  if (holdsShares(account)) return account.balanceCents;
  return Math.max(account.balanceCents - feeCents, 0);
}

/** Still to put in a fund. Negative when the funds add up to more than there is. */
export function leftToAllocateCents(account: Account, feeCents: Cents): Cents {
  return investableCents(account, feeCents) - allocatedCents(account);
}

/**
 * Fill the account from a model: its weights applied to the amount to invest,
 * to the exact cent. Replaces the funds, including any added by hand, so the
 * screen asks before doing this over funds the advisor has changed.
 */
export function applyModel(account: Account, model: ModelPortfolio, feeCents: Cents): Account {
  const shares = splitByWeights(
    investableCents(account, feeCents),
    model.lines.map((line) => ({ key: line.tickerSymbol, weightBps: line.weightBps })),
  );
  return {
    ...account,
    modelId: model.id,
    lines: shares.map(
      (share): AccountLine => ({ tickerSymbol: share.key, amountCents: share.amountCents, heldSharesMicros: null }),
    ),
  };
}

/** Whether the funds are still exactly what the model would give, for the "adjusted" label. */
export function matchesModel(account: Account, model: ModelPortfolio, feeCents: Cents): boolean {
  const filled = applyModel(account, model, feeCents).lines;
  return (
    filled.length === account.lines.length &&
    filled.every((line) =>
      account.lines.some((own) => own.tickerSymbol === line.tickerSymbol && own.amountCents === line.amountCents),
    )
  );
}

/** A fund's share of the amount to invest, in basis points, for the weight column. */
export function weightBpsOf(amountCents: Cents, investable: Cents): number {
  return investable > 0 ? Math.round((amountCents * WHOLE_BPS) / investable) : 0;
}

/** The dollars a typed weight stands for: that share of the amount to invest. */
export function amountForWeight(weightBps: number, investable: Cents): Cents {
  return Math.round((investable * weightBps) / WHOLE_BPS);
}

/**
 * An account's funds as model weights that add up to exactly 100%, for saving
 * them as a model. Largest remainder, like splitByWeights; a fund too small to
 * reach 0.01% is left out.
 */
export function linesAsWeights(lines: readonly AccountLine[]): ModelLine[] {
  const funded = lines.filter((line) => line.amountCents > 0);
  const total = addCents(...funded.map((line) => line.amountCents));
  if (total === 0) return [];

  const pieces = funded.map((line, index) => {
    const scaled = line.amountCents * WHOLE_BPS;
    return { line, index, bps: Math.floor(scaled / total), remainder: scaled % total };
  });
  let leftover = WHOLE_BPS - pieces.reduce((sum, p) => sum + p.bps, 0);
  for (const piece of [...pieces].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (leftover === 0) break;
    piece.bps += 1;
    leftover -= 1;
  }
  return pieces
    .filter((p) => p.bps > 0)
    .map((p) => ({ tickerSymbol: p.line.tickerSymbol, weightBps: p.bps }));
}

/**
 * Keeps model accounts on their model as balances change. An account whose
 * funds were exactly its model before the edit is filled again at its new
 * amount to invest, so a new balance, or a new fee tier from another
 * account's balance, carries through. One the advisor has adjusted is left
 * alone and shows what is left to allocate instead.
 */
export function followModels(
  previous: ClientCase,
  next: readonly Account[],
  models: ReadonlyMap<string, ModelPortfolio>,
  previousFees: FeesByAccount,
  nextFees: FeesByAccount,
): Account[] {
  return next.map((account) => {
    const model = account.modelId === null ? undefined : models.get(account.modelId);
    const before = previous.accounts.find((a) => a.id === account.id);
    if (model === undefined || before === undefined || before.modelId !== account.modelId) return account;
    if (!matchesModel(before, model, previousFees.get(before.id) ?? 0)) return account;
    if (before.lines !== account.lines) return account;
    return applyModel(account, model, nextFees.get(account.id) ?? 0);
  });
}

/** The bucket a fund counts toward: its ticker's default. */
export function bucketOf(tickerSymbol: string, tickers: ReadonlyMap<string, Ticker>): BucketType {
  // Every fund's ticker is in the universe (the API refuses one that is not);
  // Later is only a fallback for a list that has not loaded yet.
  return tickers.get(tickerSymbol)?.defaultBucket ?? 'LATER';
}

/**
 * Every position in one account and the bucket it counts toward: the fee cash
 * in Now, then each fund. Nothing for an empty fund.
 */
export function accountHoldings(
  account: Account,
  tickers: ReadonlyMap<string, Ticker>,
  feeCents: Cents,
): Holding[] {
  // A statement account's fee is paid from the cash funds it holds, which
  // are already in Now; counting it again would double it.
  const cash: Holding[] =
    feeCents > 0 && account.balanceCents > 0 && !holdsShares(account)
      ? [{ accountId: account.id, bucket: 'NOW', tickerSymbol: null, marketValueCents: Math.min(feeCents, account.balanceCents) }]
      : [];
  return [
    ...cash,
    ...account.lines
      .filter((line) => line.amountCents > 0)
      .map(
        (line): Holding => ({
          accountId: account.id,
          bucket: bucketOf(line.tickerSymbol, tickers),
          tickerSymbol: line.tickerSymbol,
          marketValueCents: line.amountCents,
        }),
      ),
  ];
}

export function modelsById(models: readonly ModelPortfolio[]): Map<string, ModelPortfolio> {
  return new Map(models.map((m) => [m.id, m]));
}

export function tickersBySymbol(tickers: readonly Ticker[]): Map<string, Ticker> {
  return new Map(tickers.map((t) => [t.symbol, t]));
}

/**
 * Models offered for an account: ones meant for its tax funnel first, then
 * ones for any funnel, then the rest, each group by name.
 */
export function modelChoices(models: readonly ModelPortfolio[], taxFunnel: TaxFunnel): ModelPortfolio[] {
  const rank = (m: ModelPortfolio) => (m.taxFunnel === taxFunnel ? 0 : m.taxFunnel === null ? 1 : 2);
  return [...models].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** How much of a model lands in each bucket, from its tickers' default buckets. */
export function modelBucketMix(
  model: ModelPortfolio,
  tickers: ReadonlyMap<string, Ticker>,
): Record<BucketType, number> {
  const mix: Record<BucketType, number> = { NOW: 0, SOON: 0, LATER: 0 };
  for (const line of model.lines) mix[bucketOf(line.tickerSymbol, tickers)] += line.weightBps;
  return mix;
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
  /** Fee cash (Now) plus every fund that counts toward this bucket. */
  readonly valueCents: Cents;
  readonly pctOfPortfolio: number;
  readonly slices: readonly Slice[];
}

export interface Breakdown {
  /** Sum of account balances. */
  readonly totalCents: Cents;
  /** Money not in a fund yet, across all accounts. Negative when funds add up to more. */
  readonly unallocatedCents: Cents;
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
    // The fee cash is cash.
    const assetClass =
      holding.tickerSymbol === null ? 'CASH' : tickers.get(holding.tickerSymbol)?.assetClass;
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
  fees: FeesByAccount,
): Breakdown {
  const tickers = tickersBySymbol(tickerList);
  const holdings = clientCase.accounts.flatMap((account) =>
    accountHoldings(account, tickers, fees.get(account.id) ?? 0),
  );
  const totalCents = addCents(...clientCase.accounts.map((a) => a.balanceCents));

  const byBucket = BUCKETS.map((bucket): BucketComposition => {
    const inBucket = holdings.filter((h) => h.bucket === bucket);
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
    unallocatedCents: addCents(
      ...clientCase.accounts.map((account) => leftToAllocateCents(account, fees.get(account.id) ?? 0)),
    ),
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
 * What the accounts hold in each bucket against what the questionnaire says
 * the household needs there. The variance is what the advisor acts on.
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

/**
 * What the variances mean, in words. Only Now and Soon are needs: the plan
 * works them out from the client's answers. Later is the rest of the money,
 * so it is never short of a need. When it holds less than it could, that is
 * because Now or Soon hold more than they need, and that is what to say.
 */
export function varianceAdvice(nowVarianceCents: Cents, soonVarianceCents: Cents, unallocatedCents: Cents = 0): string[] {
  const advice: string[] = [];
  if (unallocatedCents > 0) {
    advice.push(`${formatWholeDollars(unallocatedCents)} is not in a fund yet. Pick a model or add funds to the accounts.`);
  }
  const extra = Math.max(nowVarianceCents, 0) + Math.max(soonVarianceCents, 0);
  if (extra > 0) {
    const where =
      nowVarianceCents > 0 && soonVarianceCents > 0 ? 'Now and Soon hold' : nowVarianceCents > 0 ? 'Now holds' : 'Soon holds';
    advice.push(`${where} ${formatWholeDollars(extra)} more than the plan needs. That money could be in Later funds, for growth.`);
  }
  if (nowVarianceCents < 0) {
    advice.push(`Now is ${formatWholeDollars(-nowVarianceCents)} short of the next year's needs. Put more in cash funds.`);
  }
  if (soonVarianceCents < 0) {
    advice.push(`Soon is ${formatWholeDollars(-soonVarianceCents)} short of what the plan needs. Put more in bond or income funds.`);
  }
  return advice;
}

function formatWholeDollars(cents: Cents): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
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
export function bucketsByAccount(
  clientCase: ClientCase,
  tickerList: readonly Ticker[],
  fees: FeesByAccount,
): AccountBuckets[] {
  const tickers = tickersBySymbol(tickerList);
  return clientCase.accounts.map((account) => {
    const feeCents = fees.get(account.id) ?? 0;
    const holdings = accountHoldings(account, tickers, feeCents);
    const amount = (bucket: BucketType) =>
      addCents(...holdings.filter((h) => h.bucket === bucket).map((h) => h.marketValueCents));

    return {
      accountId: account.id,
      accountType: account.accountType,
      taxFunnel: account.taxFunnel,
      maskedNumber: account.maskedNumber,
      nowCents: amount('NOW'),
      soonCents: amount('SOON'),
      laterCents: amount('LATER'),
      unallocatedCents: leftToAllocateCents(account, feeCents),
      balanceCents: account.balanceCents,
    };
  });
}

export interface BucketHolding {
  readonly key: string;
  /** null for the account's advisory fee cash. */
  readonly symbol: string | null;
  readonly accountType: AccountType;
  readonly maskedNumber: string;
  readonly marketValueCents: Cents;
  /** Whole shares at the ticker's price (US-21), or null for cash or a fund with no price. */
  readonly shares: number | null;
  readonly assetClass: AssetClass | null;
}

/** The positions in one bucket, across every account, largest first. */
export function holdingsInBucket(
  clientCase: ClientCase,
  tickerList: readonly Ticker[],
  fees: FeesByAccount,
  bucket: BucketType,
): BucketHolding[] {
  const tickers = tickersBySymbol(tickerList);

  return clientCase.accounts
    .flatMap((account) =>
      accountHoldings(account, tickers, fees.get(account.id) ?? 0)
        .filter((holding) => holding.bucket === bucket)
        .map((holding): BucketHolding => {
          const ticker = holding.tickerSymbol === null ? undefined : tickers.get(holding.tickerSymbol);
          return {
            key: `${account.id}:${holding.tickerSymbol ?? 'fee-cash'}`,
            symbol: holding.tickerSymbol,
            accountType: account.accountType,
            maskedNumber: account.maskedNumber,
            marketValueCents: holding.marketValueCents,
            shares:
              ticker?.priceCents == null ? null : wholeShares(holding.marketValueCents, ticker.priceCents).shares,
            assetClass: holding.tickerSymbol === null ? 'CASH' : (ticker?.assetClass ?? null),
          };
        }),
    )
    .sort((a, b) => b.marketValueCents - a.marketValueCents);
}
