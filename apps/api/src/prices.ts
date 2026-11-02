/**
 * Live prices (RIG, 10/26): shares stay the same from quarter to quarter and
 * the price is looked up, so a statement account's value is today's without
 * retyping anything.
 *
 * RIG chose Market Data (marketdata.app), and each advisor pastes the firm's
 * key into Settings. Only this process talks to Market Data, so the key never
 * reaches the page, and all it is ever sent is ticker symbols (ADR 0006).
 *
 * The lookup sits behind PriceSource so another provider is one new function
 * (ADR 0008), and so tests never reach the network.
 */

import type { Db } from '@ai4rig/db';
import type { PriceRefreshResult } from '@ai4rig/shared';

import { HttpError } from './errors.js';
import { listTickers, savePrices } from './repositories/referenceData.js';

export interface MarketPrice {
  /** Millionths of a dollar. */
  readonly priceMicros: number;
  /** The trading day the price is from, YYYY-MM-DD, in New York. */
  readonly asOf: string;
}

/** Whatever it could find. A symbol it does not know is left out, not an error. */
export type PriceSource = (symbols: readonly string[]) => Promise<ReadonlyMap<string, MarketPrice>>;

export interface MarketDataSettings {
  /** Read on every request, so a key saved in Settings works at once. */
  apiKey: () => string | undefined;
  /** Overridable for tests. */
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
}

/** Mutual funds are five letters ending in X. Anything else is tried as a stock or ETF first. */
const LIKELY_MUTUAL_FUND = /^[A-Z]{4}X$/;
/** How many funds to ask for at once. Each fund is its own request. */
const FUND_REQUESTS_AT_ONCE = 16;
/** Market Data takes many symbols per quote request; this keeps the URL a sensible length. */
const QUOTE_BATCH = 100;

/** The calendar day in New York, which is what prices and their dates follow. */
export function marketDay(moment: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(moment);
}

/** A dollar price as a whole number of millionths. Null when it is not a usable price. */
function toMicros(price: unknown): number | null {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null;
  const micros = Math.round(price * 1_000_000);
  return micros > 0 ? micros : null;
}

/**
 * Stocks and ETFs come from one quote request for many symbols, mutual funds
 * and money markets from one request each for the latest daily price. A fund's
 * price is the last close it published, so before the evening's prices are out
 * it is the previous trading day's, the same one a statement would show.
 */
export function marketDataPrices(settings: MarketDataSettings): PriceSource {
  const doFetch = settings.fetch ?? fetch;
  const baseUrl = (settings.baseUrl ?? 'https://api.marketdata.app/v1').replace(/\/$/, '');
  const now = settings.now ?? (() => new Date());

  /** The answer's body, or null when Market Data has nothing for what was asked. */
  async function getJson<T>(path: string, apiKey: string): Promise<T | null> {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(settings.timeoutMs ?? 20_000),
      });
    } catch {
      throw new HttpError(502, 'Could not reach Market Data. Check the internet connection. Prices were not changed.');
    }

    // 203 is a normal answer from their cache. 400 is "not a valid fund
    // ticker" and 404 is "symbol not found", both just nothing to report.
    if (response.ok) return (await response.json().catch(() => null)) as T | null;
    if (response.status === 400 || response.status === 404) return null;

    // Never echo the body: an auth failure's body could quote part of the key.
    const reason =
      response.status === 401
        ? 'Market Data refused the API key. Check it on the Settings screen'
        : response.status === 402
          ? 'This Market Data plan does not include these prices'
          : response.status === 429
            ? 'This Market Data key has used up its requests for today'
            : `Market Data answered ${response.status}`;
    throw new HttpError(502, `${reason}. Prices were not changed.`);
  }

  async function quotes(symbols: readonly string[], apiKey: string): Promise<Map<string, MarketPrice>> {
    const found = new Map<string, MarketPrice>();
    for (let start = 0; start < symbols.length; start += QUOTE_BATCH) {
      const batch = symbols.slice(start, start + QUOTE_BATCH).map(encodeURIComponent).join(',');
      const body = await getJson<{
        symbol?: unknown[];
        last?: unknown[];
        mid?: unknown[];
        updated?: unknown[];
      }>(`/stocks/quotes/?symbols=${batch}`, apiKey);

      (body?.symbol ?? []).forEach((symbol, i) => {
        // An unknown symbol comes back with nulls. A thinly traded fund may
        // have no last trade yet but still a bid and an ask.
        const priceMicros = toMicros(body?.last?.[i]) ?? toMicros(body?.mid?.[i]);
        const updated = body?.updated?.[i];
        if (typeof symbol !== 'string' || priceMicros === null || typeof updated !== 'number') return;
        found.set(symbol, { priceMicros, asOf: marketDay(new Date(updated * 1000)) });
      });
    }
    return found;
  }

  async function fundPrices(symbols: readonly string[], apiKey: string): Promise<Map<string, MarketPrice>> {
    const found = new Map<string, MarketPrice>();
    const to = marketDay(now());
    const queue = [...symbols];

    const worker = async () => {
      for (let symbol = queue.shift(); symbol !== undefined; symbol = queue.shift()) {
        const body = await getJson<{ c?: unknown[]; t?: unknown[] }>(
          `/funds/candles/D/${encodeURIComponent(symbol)}/?to=${to}&countback=1`,
          apiKey,
        );
        // Stamped midnight in New York on the day it is for, which is why the
        // day is read there: on a Central laptop it would look a day early.
        const priceMicros = toMicros(body?.c?.at(-1));
        const stamped = body?.t?.at(-1);
        if (priceMicros === null || typeof stamped !== 'number') continue;
        found.set(symbol, { priceMicros, asOf: marketDay(new Date(stamped * 1000)) });
      }
    };
    await Promise.all(Array.from({ length: FUND_REQUESTS_AT_ONCE }, worker));
    return found;
  }

  return async (symbols) => {
    if (symbols.length === 0) return new Map();

    const apiKey = settings.apiKey()?.trim();
    if (apiKey === undefined || apiKey === '') {
      throw new HttpError(
        503,
        'Live prices are not set up on this computer. Add a Market Data API key on the Settings screen.',
      );
    }

    const funds = symbols.filter((s) => LIKELY_MUTUAL_FUND.test(s));
    const others = symbols.filter((s) => !LIKELY_MUTUAL_FUND.test(s));
    const found = new Map([...(await quotes(others, apiKey)), ...(await fundPrices(funds, apiKey))]);

    // A guess that missed gets the other endpoint before it counts as not found.
    const missing = (list: readonly string[]) => list.filter((s) => !found.has(s));
    const second = new Map([
      ...(await fundPrices(missing(others), apiKey)),
      ...(await quotes(missing(funds), apiKey)),
    ]);
    return new Map([...found, ...second]);
  };
}

/** Always worth $1. Not something a quote service knows about. */
const CASH_SYMBOL = 'CASH';
/** Custodian rows like "9999227" (an insured cash account) are not market symbols. */
const QUOTABLE = /^[A-Z][A-Z0-9.-]*$/;
const ONE_DOLLAR_MICROS = 1_000_000;

export interface RefreshOptions {
  /** Just these. Left out means the whole universe. */
  readonly symbols?: readonly string[] | undefined;
  /**
   * Opening a case asks for its prices with this set, so going back and forth
   * between clients does not spend requests on funds already looked up today.
   * The button leaves it off, since it means "look now".
   */
  readonly skipCheckedToday: boolean;
}

export type PriceRefresher = (options: RefreshOptions) => Promise<PriceRefreshResult>;

/**
 * Look up prices and save them. A symbol with no answer keeps the price it
 * has, and the result names it, so nothing goes stale silently. A cash fund
 * with no answer is $1.00: money markets hold that price, and not every one is
 * covered (VXPXX, in RIG's sample export, is not).
 */
export function createPriceRefresher(db: Db, source: PriceSource, now: () => Date = () => new Date()): PriceRefresher {
  /** In memory on purpose: at worst a restart looks each fund up once more. */
  const lastChecked = new Map<string, string>();

  return async ({ symbols, skipCheckedToday }) => {
    const today = marketDay(now());
    const wanted = symbols === undefined ? null : new Set(symbols);
    const tickers = listTickers(db).filter((t) => wanted === null || wanted.has(t.symbol));
    const due = skipCheckedToday ? tickers.filter((t) => lastChecked.get(t.symbol) !== today) : tickers;

    const found = await source(due.map((t) => t.symbol).filter((s) => s !== CASH_SYMBOL && QUOTABLE.test(s)));

    const updated: string[] = [];
    const changed: string[] = [];
    const assumedCash: string[] = [];
    const notFound: string[] = [];
    const prices: { symbol: string; priceMicros: number; asOf: string }[] = [];

    for (const ticker of due) {
      const price = found.get(ticker.symbol);
      if (price !== undefined) {
        updated.push(ticker.symbol);
        if (price.priceMicros !== ticker.priceMicros) changed.push(ticker.symbol);
        prices.push({ symbol: ticker.symbol, ...price });
      } else if (ticker.assetClass === 'CASH') {
        if (ticker.symbol !== CASH_SYMBOL) assumedCash.push(ticker.symbol);
        prices.push({ symbol: ticker.symbol, priceMicros: ONE_DOLLAR_MICROS, asOf: today });
      } else {
        notFound.push(ticker.symbol);
      }
      lastChecked.set(ticker.symbol, today);
    }

    savePrices(db, prices);
    return { tickers: listTickers(db), updated, changed, assumedCash, notFound };
  };
}
