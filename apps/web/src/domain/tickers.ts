/**
 * US-24: symbols the advisor types that the universe does not have yet.
 *
 * The rule matches the API's tickerSchema, so a symbol the screen offers to
 * add is one the server will accept.
 */

import type { Ticker } from './types.js';

export const SYMBOL_PATTERN = /^[A-Z0-9.-]{1,10}$/;

/** How a typed symbol is stored: trimmed and upper case. */
export function normalizeSymbol(text: string): string {
  return text.trim().toUpperCase();
}

export function isValidSymbol(symbol: string): boolean {
  return SYMBOL_PATTERN.test(symbol);
}

/** Add or replace one ticker, keeping the list in symbol order like the API returns it. */
export function withTicker(tickers: readonly Ticker[], ticker: Ticker): Ticker[] {
  return [...tickers.filter((t) => t.symbol !== ticker.symbol), ticker].sort((a, b) =>
    a.symbol.localeCompare(b.symbol),
  );
}
