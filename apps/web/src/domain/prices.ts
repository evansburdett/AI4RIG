/**
 * How current the prices on screen are, for the Refresh prices line.
 */

import type { ClientCase, Ticker } from './types.js';

/** Past a long weekend and a holiday, a price that has not moved in this long deserves a look. */
const STALE_AFTER_DAYS = 7;

/** Every fund in the case, once each: what its accounts hold and what a locked proposal holds. */
export function caseSymbols(clientCase: ClientCase): string[] {
  const symbols = clientCase.accounts.flatMap((account) => [
    ...account.lines.map((line) => line.tickerSymbol),
    ...account.proposalShares.map((share) => share.tickerSymbol),
  ]);
  return [...new Set(symbols)].sort();
}

export interface PriceAges {
  readonly total: number;
  /** YYYY-MM-DD, or null when none of them has a dated price. */
  readonly oldest: string | null;
  readonly newest: string | null;
  /** Priced, but more than a week ago. */
  readonly stale: number;
  /** No price at all. */
  readonly missing: number;
}

export function priceAges(symbols: readonly string[], tickers: readonly Ticker[], today: Date): PriceAges {
  const bySymbol = new Map(tickers.map((t) => [t.symbol, t]));
  // YYYY-MM-DD sorts as text, so a cutoff in the same form compares directly.
  const cutoff = new Date(today.getTime() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const days: string[] = [];
  let missing = 0;
  for (const symbol of symbols) {
    const ticker = bySymbol.get(symbol);
    if (ticker?.priceCents == null) missing += 1;
    else if (ticker.priceAsOf !== null) days.push(ticker.priceAsOf);
  }
  days.sort();

  return {
    total: symbols.length,
    oldest: days[0] ?? null,
    newest: days.at(-1) ?? null,
    stale: days.filter((day) => day < cutoff).length,
    missing,
  };
}
