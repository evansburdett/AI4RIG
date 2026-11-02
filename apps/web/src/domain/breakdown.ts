/**
 * Where a client's money sits, worked out from what the advisor entered.
 *
 * RIG allocates by account (10/26). A fund gets into an account from a model,
 * by hand, or from a statement, and after that every fund behaves the same: it
 * holds shares, and its dollars are those shares at today's price. Dollars and
 * weights are how the advisor places the money; shares are what the client
 * owns, and they stay put when the market moves.
 *
 * An account's balance is its funds plus cash not in a fund. The cash pays the
 * advisory fee first and counts toward Now. Each fund counts toward its
 * ticker's default bucket, so the Now / Soon / Later totals are added up from
 * the funds rather than typed.
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
export function valueOfSharesCents(sharesMicros: number, priceMicros: number): Cents {
  const product = BigInt(sharesMicros) * BigInt(priceMicros);
  return Number((product + 5_000_000_000n) / 10_000_000_000n);
}

/**
 * Mutual funds (five letters ending in X) and cash funds can be bought in
 * fractions. Stocks and ETFs are bought in whole shares.
 */
export function buysWholeShares(ticker: Ticker): boolean {
  return ticker.assetClass !== 'CASH' && !/^[A-Z]{4}X$/.test(ticker.symbol);
}

const SHARE_MICROS = 1_000_000n;

/**
 * The shares some dollars buy. A fraction is taken far enough that it comes
 * back to the same cent. Whole shares never spend more than the dollars, and
 * half a cent of slack keeps dollars that came from a share count on that
 * count: 2,060 shares at $53.0092 is $109,198.95, a hair under 2,060 exactly.
 */
export function sharesForDollars(amountCents: Cents, ticker: Ticker, priceMicros: number): number {
  const numerator = (BigInt(amountCents) * 10_000n + 5_000n) * SHARE_MICROS;
  const price = BigInt(priceMicros);
  if (buysWholeShares(ticker)) return Number((numerator / price / SHARE_MICROS) * SHARE_MICROS);
  return Number((BigInt(amountCents) * 10_000n * SHARE_MICROS + price / 2n) / price);
}

/** A fund's dollars as shares at today's price. What whole shares cannot use stays in the balance as cash. */
function pinnedToShares(line: AccountLine, ticker: Ticker, priceMicros: number): AccountLine {
  const sharesMicros = sharesForDollars(line.amountCents, ticker, priceMicros);
  return { ...line, sharesMicros, amountCents: valueOfSharesCents(sharesMicros, priceMicros) };
}

/**
 * The one rule for every fund in every account, however it got there. A fund
 * with shares is worth them at today's price, and its change in value is a
 * change in the balance: a price move, or a share count the advisor typed
 * because the client bought or sold. A fund with dollars and no shares yet (a
 * model just filled, dollars or a weight just typed) becomes shares at today's
 * price, and that is money moving inside the account: the balance stays, and
 * what whole shares could not use is cash. With no price, a fund stays as it
 * is until there is one.
 *
 * The same object when nothing moved.
 */
export function atCurrentPrices(account: Account, tickers: ReadonlyMap<string, Ticker>): Account {
  let balanceCents = account.balanceCents;
  const lines = account.lines.map((line) => {
    const ticker = tickers.get(line.tickerSymbol);
    const price = exactPriceMicros(ticker);
    if (ticker === undefined || price === null) return line;

    if (line.sharesMicros === null) {
      return line.amountCents === 0 ? line : pinnedToShares(line, ticker, price);
    }

    const amountCents = valueOfSharesCents(line.sharesMicros, price);
    if (amountCents === line.amountCents) return line;
    balanceCents += amountCents - line.amountCents;
    return { ...line, amountCents };
  });
  const unchanged = balanceCents === account.balanceCents && lines.every((line, i) => line === account.lines[i]);
  return unchanged ? account : { ...account, lines, balanceCents };
}

/** Every account in the case at today's prices. The same object when nothing moved. */
export function caseAtCurrentPrices(clientCase: ClientCase, tickerList: readonly Ticker[]): ClientCase {
  const tickers = tickersBySymbol(tickerList);
  const accounts = clientCase.accounts.map((account) => atCurrentPrices(account, tickers));
  return accounts.every((account, i) => account === clientCase.accounts[i]) ? clientCase : { ...clientCase, accounts };
}

/**
 * Turns any fund still in dollars into shares, and nothing else: unlike
 * caseAtCurrentPrices it does not revalue funds that already have shares. This
 * is what goes in the working copy. If dollars stayed there, every new price
 * would just buy a different number of shares, and the balance would never
 * move. The same object when there is nothing to do.
 */
export function caseWithSharesPinned(clientCase: ClientCase, tickerList: readonly Ticker[]): ClientCase {
  const tickers = tickersBySymbol(tickerList);
  const accounts = clientCase.accounts.map((account) => {
    const lines = account.lines.map((line) => {
      const ticker = tickers.get(line.tickerSymbol);
      const price = exactPriceMicros(ticker);
      if (ticker === undefined || price === null || line.sharesMicros !== null || line.amountCents === 0) return line;
      return pinnedToShares(line, ticker, price);
    });
    return lines.every((line, i) => line === account.lines[i]) ? account : { ...account, lines };
  });
  return accounts.every((account, i) => account === clientCase.accounts[i]) ? clientCase : { ...clientCase, accounts };
}

/** What the account's cash funds (money market, sweep) hold. */
export function cashFundsCents(account: Account, tickers: ReadonlyMap<string, Ticker>): Cents {
  return addCents(
    ...account.lines
      .filter((line) => tickers.get(line.tickerSymbol)?.assetClass === 'CASH')
      .map((line) => line.amountCents),
  );
}

/** How the money in an account that is not in a fund is spoken for. */
export interface AccountCash {
  /** The balance less the funds. Negative when the funds add up to more. */
  readonly uninvestedCents: Cents;
  /** Held back for the year's advisory fee, up to the fee. */
  readonly feeCashCents: Cents;
  /** Too little to buy another share of anything: staying cash is the plan, not a job left undone. */
  readonly roundingCents: Cents;
  /** Still to put in a fund. Negative when the funds add up to more than the balance. */
  readonly leftCents: Cents;
}

export function accountCash(account: Account, tickers: ReadonlyMap<string, Ticker>, feeCents: Cents): AccountCash {
  const uninvestedCents = account.balanceCents - allocatedCents(account);
  const feeCashCents = Math.max(Math.min(uninvestedCents, feeCents), 0);
  const spare = uninvestedCents - feeCashCents;
  const oneShareOfEach = addCents(
    ...account.lines.map((line) => {
      const ticker = tickers.get(line.tickerSymbol);
      return ticker !== undefined && buysWholeShares(ticker) ? (ticker.priceCents ?? 0) : 0;
    }),
  );
  const roundingCents = spare > 0 && spare <= oneShareOfEach ? spare : 0;
  return { uninvestedCents, feeCashCents, roundingCents, leftCents: spare - roundingCents };
}

/**
 * What the funds are a share of: the balance less the cash held for the fee.
 * An account from a statement often has no such cash, because its fee comes
 * from a money market it already holds, and then all of it counts.
 */
export function investableCents(account: Account, feeCents: Cents): Cents {
  const uninvested = account.balanceCents - allocatedCents(account);
  return account.balanceCents - Math.max(Math.min(uninvested, feeCents), 0);
}

/** Still to put in a fund. Negative when the funds add up to more than the balance. */
export function leftToAllocateCents(account: Account, tickers: ReadonlyMap<string, Ticker>, feeCents: Cents): Cents {
  return accountCash(account, tickers, feeCents).leftCents;
}

/** What the year's fee can come from: cash not in a fund, and cash funds. */
export function cashForFeeCents(account: Account, tickers: ReadonlyMap<string, Ticker>): Cents {
  return Math.max(account.balanceCents - allocatedCents(account), 0) + cashFundsCents(account, tickers);
}

/**
 * Fill the account from a model: its weights applied to the balance less a
 * year's fee (RIG, 10/26), to the exact cent. The dollars become shares at
 * today's price (atCurrentPrices). Replaces the funds, including any added by
 * hand, so the screen asks before doing this over funds the advisor has
 * changed.
 */
export function applyModel(account: Account, model: ModelPortfolio, feeCents: Cents): Account {
  const shares = splitByWeights(
    Math.max(account.balanceCents - feeCents, 0),
    model.lines.map((line) => ({ key: line.tickerSymbol, weightBps: line.weightBps })),
  );
  return {
    ...account,
    modelId: model.id,
    lines: shares.map(
      (share): AccountLine => ({ tickerSymbol: share.key, amountCents: share.amountCents, sharesMicros: null }),
    ),
  };
}

/**
 * Whether the funds are still what the model would give today. Whole shares
 * land up to one share off the dollars, and a cent is rounding. An edit makes
 * this false, and so do prices moving unevenly, which is the same news to the
 * advisor: the account has moved away from its model.
 */
export function matchesModel(
  account: Account,
  model: ModelPortfolio,
  feeCents: Cents,
  tickers: ReadonlyMap<string, Ticker>,
): boolean {
  const filled = applyModel(account, model, feeCents).lines;
  return (
    filled.length === account.lines.length &&
    filled.every((line) => {
      const own = account.lines.find((l) => l.tickerSymbol === line.tickerSymbol);
      if (own === undefined) return false;
      const ticker = tickers.get(line.tickerSymbol);
      const oneShare = ticker !== undefined && buysWholeShares(ticker) ? (ticker.priceCents ?? 0) : 0;
      return Math.abs(own.amountCents - line.amountCents) <= Math.max(oneShare, 1);
    })
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
 * funds were still its model before the edit is filled again at its new
 * amount to invest, so a new balance, or a new fee tier from another
 * account's balance, carries through. One that has moved away from its model
 * is left alone and shows what is left to allocate instead, and so is one whose
 * balance and fee did not change: its shares are the record.
 */
export function followModels(
  previous: ClientCase,
  next: readonly Account[],
  models: ReadonlyMap<string, ModelPortfolio>,
  previousFees: FeesByAccount,
  nextFees: FeesByAccount,
  tickers: ReadonlyMap<string, Ticker>,
): Account[] {
  return next.map((account) => {
    const model = account.modelId === null ? undefined : models.get(account.modelId);
    const before = previous.accounts.find((a) => a.id === account.id);
    if (model === undefined || before === undefined || before.modelId !== account.modelId) return account;
    const previousFee = previousFees.get(before.id) ?? 0;
    const nextFee = nextFees.get(account.id) ?? 0;
    if (before.balanceCents === account.balanceCents && previousFee === nextFee) return account;
    if (!matchesModel(before, model, previousFee, tickers)) return account;
    if (before.lines !== account.lines) return account;
    return applyModel(account, model, nextFee);
  });
}

/** The bucket a fund counts toward: its ticker's default. */
export function bucketOf(tickerSymbol: string, tickers: ReadonlyMap<string, Ticker>): BucketType {
  // Every fund's ticker is in the universe (the API refuses one that is not);
  // Later is only a fallback for a list that has not loaded yet.
  return tickers.get(tickerSymbol)?.defaultBucket ?? 'LATER';
}

/**
 * Every position in one account and the bucket it counts toward: the cash
 * held for the fee and left over from whole shares in Now, then each fund.
 * Money still to allocate is in no bucket yet. Nothing for an empty fund.
 */
export function accountHoldings(
  account: Account,
  tickers: ReadonlyMap<string, Ticker>,
  feeCents: Cents,
): Holding[] {
  const { feeCashCents, roundingCents } = accountCash(account, tickers, feeCents);
  const cash: Holding[] =
    feeCashCents + roundingCents > 0
      ? [{ accountId: account.id, bucket: 'NOW', tickerSymbol: null, marketValueCents: feeCashCents + roundingCents }]
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
      ...clientCase.accounts.map((account) => leftToAllocateCents(account, tickers, fees.get(account.id) ?? 0)),
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
      unallocatedCents: leftToAllocateCents(account, tickers, feeCents),
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
  /** The shares the fund holds (US-21), or null for cash or a fund with no price. */
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
          const sharesMicros = account.lines.find((l) => l.tickerSymbol === holding.tickerSymbol)?.sharesMicros ?? null;
          return {
            key: `${account.id}:${holding.tickerSymbol ?? 'fee-cash'}`,
            symbol: holding.tickerSymbol,
            accountType: account.accountType,
            maskedNumber: account.maskedNumber,
            marketValueCents: holding.marketValueCents,
            shares:
              sharesMicros !== null
                ? sharesMicros / 1_000_000
                : ticker?.priceCents == null
                  ? null
                  : wholeShares(holding.marketValueCents, ticker.priceCents).shares,
            assetClass: holding.tickerSymbol === null ? 'CASH' : (ticker?.assetClass ?? null),
          };
        }),
    )
    .sort((a, b) => b.marketValueCents - a.marketValueCents);
}
