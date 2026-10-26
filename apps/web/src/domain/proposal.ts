/**
 * US-21: the proposal in shares. Each fund's dollars in an account become
 * whole shares at the ticker's price, with what is left over held as cash.
 *
 * Share counts are worked out live from the plan, but kept only when the
 * advisor locks the proposal in (decision: "lock in proposal", not
 * recalculated on every save). After that, the locked shares are what the
 * client was given, and they are valued at today's prices whenever the case
 * is opened, so nobody retypes positions when the client comes back.
 */

import { addCents, sharesValueCents, wholeShares, type Cents } from '@ai4rig/engine';

import { bucketOf, tickersBySymbol } from './breakdown.js';
import type { BucketType, ClientCase, ProposalShare, Ticker } from './types.js';

export interface ProposedPosition {
  readonly bucket: BucketType;
  readonly tickerSymbol: string;
  /** The money in the fund. */
  readonly amountCents: Cents;
  /** Null when the ticker has no price yet. */
  readonly priceCents: Cents | null;
  readonly shares: number | null;
  readonly costCents: Cents | null;
  /** Left over after whole shares; under one share's price. */
  readonly cashCents: Cents | null;
}

/** The funds one account holds right now, in shares where there is a price. Empty funds are left out. */
export function proposedPositions(
  account: ClientCase['accounts'][number],
  tickerList: readonly Ticker[],
): ProposedPosition[] {
  const tickers = tickersBySymbol(tickerList);

  return account.lines
    .filter((line) => line.amountCents > 0)
    .map((line): ProposedPosition => {
      const bucket = bucketOf(line.tickerSymbol, tickers);
      const priceCents = tickers.get(line.tickerSymbol)?.priceCents ?? null;
      if (priceCents === null) {
        return {
          bucket,
          tickerSymbol: line.tickerSymbol,
          amountCents: line.amountCents,
          priceCents: null,
          shares: null,
          costCents: null,
          cashCents: null,
        };
      }
      const bought = wholeShares(line.amountCents, priceCents);
      return {
        bucket,
        tickerSymbol: line.tickerSymbol,
        amountCents: line.amountCents,
        priceCents,
        shares: bought.shares,
        costCents: bought.costCents,
        cashCents: bought.cashCents,
      };
    });
}

/** Tickers in the plan with no price yet. Locking waits for these. */
export function missingPrices(
  clientCase: ClientCase,
  tickers: readonly Ticker[],
): string[] {
  const symbols = clientCase.accounts.flatMap((account) =>
    proposedPositions(account, tickers)
      .filter((p) => p.priceCents === null)
      .map((p) => p.tickerSymbol),
  );
  return [...new Set(symbols)].sort();
}

/**
 * The case with today's proposal locked in: every account's share counts and
 * the prices they were worked out at. Refuses while any ticker in the plan
 * has no price, rather than locking a partial proposal.
 */
export function lockProposal(
  clientCase: ClientCase,
  tickers: readonly Ticker[],
  now: Date,
): ClientCase {
  const missing = missingPrices(clientCase, tickers);
  if (missing.length > 0) {
    throw new Error(`Enter a price for ${missing.join(', ')} on the Tickers screen first.`);
  }

  return {
    ...clientCase,
    proposalLockedAt: now.toISOString(),
    accounts: clientCase.accounts.map((account) => ({
      ...account,
      proposalShares: proposedPositions(account, tickers)
        .filter((p) => p.shares !== null && p.shares > 0 && p.priceCents !== null)
        .map(
          (p): ProposalShare => ({
            bucket: p.bucket,
            tickerSymbol: p.tickerSymbol,
            shares: p.shares ?? 0,
            priceCents: p.priceCents ?? 0,
          }),
        ),
    })),
  };
}

/** Drop the locked shares, back to a proposal that is only worked out live. */
export function unlockProposal(clientCase: ClientCase): ClientCase {
  return {
    ...clientCase,
    proposalLockedAt: null,
    accounts: clientCase.accounts.map((account) => ({ ...account, proposalShares: [] })),
  };
}

export interface LockedValuation {
  readonly accountId: string;
  readonly bucket: BucketType;
  readonly tickerSymbol: string;
  readonly shares: number;
  readonly lockedPriceCents: Cents;
  readonly lockedValueCents: Cents;
  /** Null when the ticker has since lost its price, or left the universe. */
  readonly currentPriceCents: Cents | null;
  readonly currentValueCents: Cents | null;
}

/** Every locked position, valued at the price it was locked at and at today's. */
export function valueLockedShares(clientCase: ClientCase, tickers: readonly Ticker[]): LockedValuation[] {
  const prices = new Map(tickers.map((t) => [t.symbol, t.priceCents]));
  return clientCase.accounts.flatMap((account) =>
    account.proposalShares.map((share): LockedValuation => {
      const currentPriceCents = prices.get(share.tickerSymbol) ?? null;
      return {
        accountId: account.id,
        bucket: share.bucket,
        tickerSymbol: share.tickerSymbol,
        shares: share.shares,
        lockedPriceCents: share.priceCents,
        lockedValueCents: sharesValueCents(share.shares, share.priceCents),
        currentPriceCents,
        currentValueCents:
          currentPriceCents === null ? null : sharesValueCents(share.shares, currentPriceCents),
      };
    }),
  );
}

/** Sum of a column, skipping the positions that have no value in it. */
export function totalOf(values: readonly (Cents | null)[]): Cents {
  return addCents(...values.filter((v): v is Cents => v !== null));
}

/**
 * Whether the plan still works out to the shares that were locked in. False
 * after the advisor changes an amount, a model, or a weight, or a price
 * changes the share count; the screen then offers to lock in again.
 */
export function lockedMatchesPlan(
  clientCase: ClientCase,
  tickers: readonly Ticker[],
): boolean {
  if (clientCase.proposalLockedAt === null) return false;
  return clientCase.accounts.every((account) => {
    const locked = account.proposalShares.map((s) => `${s.bucket}:${s.tickerSymbol}:${s.shares}`);
    const live = proposedPositions(account, tickers.map((t) => {
      // Compare at the prices that were locked, so a price change alone does
      // not read as the plan changing.
      const lockedPrice = account.proposalShares.find((s) => s.tickerSymbol === t.symbol)?.priceCents;
      return lockedPrice === undefined ? t : { ...t, priceCents: lockedPrice };
    }))
      .filter((p) => p.shares !== null && p.shares > 0)
      .map((p) => `${p.bucket}:${p.tickerSymbol}:${p.shares}`);
    return locked.length === live.length && locked.every((key) => live.includes(key));
  });
}
