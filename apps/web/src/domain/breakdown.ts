/**
 * Where a client's money sits, worked out from what the advisor entered.
 *
 * RIG allocates by account (10/26). A fund gets into an account from a model,
 * by hand, or from a statement, and after that every fund behaves the same: it
 * holds shares, and its dollars are those shares at today's price. Dollars and
 * weights are how the advisor places the money; shares are what the client
 * owns, and they stay put when the market moves.
 *
 * An account's balance is its funds plus its cash. The cash pays a year's
 * advisory fee first, and what is beyond the fee is cash to invest (RIG,
 * 11/17); all of it counts toward Now. Each fund counts toward its
 * ticker's default bucket, so the Now / Soon / Later totals are added up from
 * the funds rather than typed.
 *
 * Provisional home: this belongs in packages/engine next to splitByWeights.
 * It is pure, so moving it is a file move.
 */

import { WHOLE_BPS, addCents, splitByWeights, wholeShares, type Cents } from '@ai4rig/engine';

import { percentOf } from './money.js';
import { CASH_SYMBOL } from './tickerGuesses.js';
import { ASSET_CLASSES, BUCKETS } from './types.js';
import type {
  Account,
  AccountLine,
  AlertThresholds,
  Light,
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

/** The money in the account's funds. A plain cash line is cash, not a fund. */
export function allocatedCents(account: Account): Cents {
  return addCents(...investedLines(account).map((line) => line.amountCents));
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

const SHARE_MICROS = 1_000_000n;
/** A hundredth of a share, in millionths. */
const HUNDREDTH = 10_000n;

/**
 * The shares some dollars buy, rounded down to a hundredth of a share (RIG,
 * 11/2: partials are a thing). Half a cent of slack keeps dollars that came
 * from a share count on that count: 2,060 shares at $53.0092 is $109,198.95,
 * a hair under 2,060 exactly. What the hundredth leaves over stays as cash.
 */
export function sharesForDollars(amountCents: Cents, priceMicros: number): number {
  const micros = ((BigInt(amountCents) * 10_000n + 5_000n) * SHARE_MICROS) / BigInt(priceMicros);
  return Number((micros / HUNDREDTH) * HUNDREDTH);
}

/** A fund's dollars as shares at today's price. What whole shares cannot use stays in the balance as cash. */
function pinnedToShares(line: AccountLine, priceMicros: number): AccountLine {
  const sharesMicros = sharesForDollars(line.amountCents, priceMicros);
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
      return line.amountCents === 0 ? line : pinnedToShares(line, price);
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
      return pinnedToShares(line, price);
    });
    return lines.every((line, i) => line === account.lines[i]) ? account : { ...account, lines };
  });
  return accounts.every((account, i) => account === clientCase.accounts[i]) ? clientCase : { ...clientCase, accounts };
}

/** A model's or account's plain cash line ("USD CASH" in a vendor model), not a money market fund. */
export function isCashLine(line: { readonly tickerSymbol: string }): boolean {
  return line.tickerSymbol === CASH_SYMBOL;
}

/** The funds the client is invested in: everything but plain cash. */
function investedLines(account: Account): readonly AccountLine[] {
  return account.lines.filter((line) => !isCashLine(line));
}

/**
 * An account's cash, as the account card lays it out (RIG, 11/17): a fixed
 * row for the year's advisory fee, then a Cash row for what is beyond it,
 * then the funds. The three add up to the balance.
 */
export interface AccountCash {
  /** All the account's cash: the balance less its funds. Negative when the funds add up to more. */
  readonly cashCents: Cents;
  /** The year's advisory fee, held as cash. */
  readonly feeCents: Cents;
  /** The cash beyond the fee, to invest or keep. Negative when cash is short of the fee. */
  readonly investableCashCents: Cents;
  /** How far the funds go over the balance: negative, or 0. */
  readonly overCents: Cents;
}

export function accountCash(account: Account, feeCents: Cents): AccountCash {
  const cashCents = actualCashCents(account);
  return {
    cashCents,
    feeCents,
    investableCashCents: cashCents - feeCents,
    overCents: Math.min(cashCents, 0),
  };
}

/** What a fund's weight is a share of: the balance less the year's fee. */
export function investableCents(account: Account, feeCents: Cents): Cents {
  return Math.max(account.balanceCents - feeCents, 0);
}

/**
 * Money not accounted for: negative when the funds add up to more than the
 * balance, else 0. Cash not in a fund is no longer "left to allocate"; it is
 * cash, in Now (RIG, 11/17).
 */
export function leftToAllocateCents(account: Account): Cents {
  return Math.min(actualCashCents(account), 0);
}

/**
 * The account's actual cash: what is not in a fund, plus any plain cash line.
 * Money market funds do not count; Blake (11/2): only cash pays the fee.
 */
export function actualCashCents(account: Account): Cents {
  return account.balanceCents - addCents(...investedLines(account).map((line) => line.amountCents));
}

/** Typing the account's actual cash: the funds stay, so the balance is them plus the cash. */
export function withActualCash(account: Account, cashCents: Cents): Account {
  const invested = addCents(...investedLines(account).map((line) => line.amountCents));
  return { ...account, balanceCents: invested + cashCents };
}

/** The cash a model holds, as dollars of this account (its weight of the balance less the fee). */
export function modelCashCents(account: Account, model: ModelPortfolio | undefined, feeCents: Cents): Cents {
  if (model === undefined) return 0;
  const bps = model.lines.filter(isCashLine).reduce((sum, line) => sum + line.weightBps, 0);
  return Math.round((Math.max(account.balanceCents - feeCents, 0) * bps) / WHOLE_BPS);
}

/**
 * Each account's cash target (its fee plus its model's cash), by account id.
 * Passed where the bucket totals take fees, so a model's own cash counts as
 * cash in Now rather than as money still to place.
 */
export function cashTargetsByAccount(
  clientCase: ClientCase,
  fees: FeesByAccount,
  models: ReadonlyMap<string, ModelPortfolio>,
): FeesByAccount {
  return new Map(
    clientCase.accounts.map((account) => {
      const fee = fees.get(account.id) ?? 0;
      const model = account.modelId === null ? undefined : models.get(account.modelId);
      return [account.id, fee + modelCashCents(account, model, fee)];
    }),
  );
}

export interface CashStatus {
  readonly light: Light;
  /** The fee plus the model's cash: what the account should hold in cash. */
  readonly targetCents: Cents;
  readonly actualCents: Cents;
  /** Positive when there is more cash than the target. */
  readonly varianceCents: Cents;
  readonly message: string;
}

/**
 * Cash against its target (RIG, 11/2). The fee is filled first, then the
 * model's cash; what is beyond the fee is the Cash row (11/17), and that is
 * what the alerts read. Short of the fee is red, since a fee debit would take
 * the account negative. Short of the model's cash, or more than the threshold
 * over the target (a deposit, say), is yellow: time to rebalance.
 */
export function cashStatus(
  account: Account,
  feeCents: Cents,
  model: ModelPortfolio | undefined,
  thresholds: AlertThresholds,
): CashStatus {
  const modelCash = modelCashCents(account, model, feeCents);
  const targetCents = feeCents + modelCash;
  const actualCents = actualCashCents(account);
  const varianceCents = actualCents - targetCents;
  const money = (cents: Cents) => formatWholeDollars(Math.abs(cents));
  const base = { targetCents, actualCents, varianceCents };

  if (actualCents < 0) {
    return { ...base, light: 'RED', message: `The funds add up to ${money(actualCents)} more than the balance.` };
  }
  if (actualCents < feeCents) {
    return { ...base, light: 'RED', message: `Cash is ${money(feeCents - actualCents)} short of the year's advisory fee. Raise cash.` };
  }
  if (actualCents < targetCents) {
    return { ...base, light: 'YELLOW', message: `The fee is covered, but cash is ${money(-varianceCents)} short of the model's cash.` };
  }
  if (varianceCents * WHOLE_BPS > account.balanceCents * thresholds.cashExcessBps && varianceCents > 0) {
    return { ...base, light: 'YELLOW', message: `${money(varianceCents)} of cash to invest.` };
  }
  return { ...base, light: 'GREEN', message: modelCash > 0 ? 'Cash covers the fee and the model.' : 'Cash covers the fee.' };
}

/**
 * Fill the account from a model: its weights applied to the balance less a
 * year's fee (RIG, 10/26), to the exact cent. The dollars become shares at
 * today's price (atCurrentPrices). The model's own cash stays as the account's
 * cash rather than a fund. Replaces the funds, including any added by hand, so
 * the screen asks before doing this over funds the advisor has changed.
 */
export function applyModel(account: Account, model: ModelPortfolio, feeCents: Cents, now: Date = new Date()): Account {
  const shares = splitByWeights(
    Math.max(account.balanceCents - feeCents, 0),
    model.lines.map((line) => ({ key: line.tickerSymbol, weightBps: line.weightBps })),
  );
  return {
    ...account,
    modelId: model.id,
    modelFilledAt: now.toISOString(),
    lines: shares
      .filter((share) => !isCashLine({ tickerSymbol: share.key }))
      .map((share): AccountLine => ({ tickerSymbol: share.key, amountCents: share.amountCents, sharesMicros: null })),
  };
}

/**
 * Whether the funds are still what the model would give today, cash aside.
 * A hundredth of a share lands a little off the dollars, and a cent is
 * rounding. For the "differs" alerts, see modelStatus.
 */
export function matchesModel(
  account: Account,
  model: ModelPortfolio,
  feeCents: Cents,
  tickers: ReadonlyMap<string, Ticker>,
): boolean {
  const filled = applyModel(account, model, feeCents).lines;
  const own = investedLines(account);
  return (
    filled.length === own.length &&
    filled.every((line) => {
      const mine = own.find((l) => l.tickerSymbol === line.tickerSymbol);
      if (mine === undefined) return false;
      const aHundredth = Math.ceil((tickers.get(line.tickerSymbol)?.priceCents ?? 0) / 100);
      return Math.abs(mine.amountCents - line.amountCents) <= Math.max(aHundredth, 1);
    })
  );
}

export type ModelStatusKind = 'MATCHES' | 'MODEL_UPDATED' | 'FUNDS_CHANGED' | 'DRIFTED';

export interface ModelStatus {
  readonly kind: ModelStatusKind;
  readonly light: Light;
  readonly message: string;
}

/**
 * How an account on a model stands against it (RIG, 11/2), cash left out:
 * red when the model was saved after the account was filled from it, yellow
 * when its funds are not the model's or any fund's weight is further off than
 * the drift threshold, green otherwise. Weights are each fund's share of the
 * invested funds, so a deposit or a fee debit does not count as drift.
 */
export function modelStatus(account: Account, model: ModelPortfolio, thresholds: AlertThresholds): ModelStatus {
  if (model.updatedAt !== undefined && account.modelFilledAt != null && model.updatedAt > account.modelFilledAt) {
    return { kind: 'MODEL_UPDATED', light: 'RED', message: 'The model has been updated since this account was filled.' };
  }

  const wanted = model.lines.filter((line) => !isCashLine(line));
  const own = investedLines(account).filter((line) => line.amountCents > 0);
  const sameFunds =
    wanted.length === own.length && wanted.every((line) => own.some((l) => l.tickerSymbol === line.tickerSymbol));
  if (!sameFunds) {
    return { kind: 'FUNDS_CHANGED', light: 'YELLOW', message: "The account's funds are not the model's." };
  }

  const wantedTotal = wanted.reduce((sum, line) => sum + line.weightBps, 0);
  const ownTotal = addCents(...own.map((line) => line.amountCents));
  let worst: { symbol: string; offBps: number } | null = null;
  for (const line of wanted) {
    const mine = own.find((l) => l.tickerSymbol === line.tickerSymbol)!;
    const offBps =
      ownTotal === 0 || wantedTotal === 0
        ? 0
        : Math.round((mine.amountCents / ownTotal) * WHOLE_BPS - (line.weightBps / wantedTotal) * WHOLE_BPS);
    if (worst === null || Math.abs(offBps) > Math.abs(worst.offBps)) worst = { symbol: line.tickerSymbol, offBps };
  }
  if (worst !== null && Math.abs(worst.offBps) > thresholds.driftBps) {
    const points = (Math.abs(worst.offBps) / 100).toFixed(1);
    return {
      kind: 'DRIFTED',
      light: 'YELLOW',
      message: `Drifted from the model: ${worst.symbol} is ${points} points ${worst.offBps > 0 ? 'over' : 'under'} its weight.`,
    };
  }
  return { kind: 'MATCHES', light: 'GREEN', message: 'Matches the model.' };
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
 * Every position in one account and the bucket it counts toward: all its cash
 * in Now (the fee's and the rest), then each fund. Nothing for an empty fund.
 */
export function accountHoldings(account: Account, tickers: ReadonlyMap<string, Ticker>): Holding[] {
  const cashCents = actualCashCents(account);
  const cash: Holding[] =
    cashCents > 0 ? [{ accountId: account.id, bucket: 'NOW', tickerSymbol: null, marketValueCents: cashCents }] : [];
  return [
    ...cash,
    ...investedLines(account)
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

export function computeBreakdown(clientCase: ClientCase, tickerList: readonly Ticker[]): Breakdown {
  const tickers = tickersBySymbol(tickerList);
  const holdings = clientCase.accounts.flatMap((account) => accountHoldings(account, tickers));
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
    unallocatedCents: addCents(...clientCase.accounts.map((account) => leftToAllocateCents(account))),
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
export function bucketsByAccount(clientCase: ClientCase, tickerList: readonly Ticker[]): AccountBuckets[] {
  const tickers = tickersBySymbol(tickerList);
  return clientCase.accounts.map((account) => {
    const holdings = accountHoldings(account, tickers);
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
      unallocatedCents: leftToAllocateCents(account),
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
      accountHoldings(account, tickers)
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
