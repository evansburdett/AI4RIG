import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase, runMigrations, type Db } from '@ai4rig/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpError } from './errors.js';
import { createPriceRefresher, marketDataPrices, marketDay, type PriceSource } from './prices.js';
import { getTicker, upsertTicker } from './repositories/referenceData.js';

/** Midnight in New York on Oct 27, 2026, as Market Data stamps a fund's price. */
const OCT_27_MIDNIGHT_NY = 1793073600;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('marketDay', () => {
  it('reads the day in New York, wherever the laptop is', () => {
    expect(marketDay(new Date(OCT_27_MIDNIGHT_NY * 1000))).toBe('2026-10-27');
    // Past midnight in London, still the 27th in New York.
    expect(marketDay(new Date('2026-10-28T01:00:00Z'))).toBe('2026-10-27');
  });
});

describe('marketDataPrices', () => {
  it('asks for stocks in one request and each mutual fund on its own, exactly priced', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const path = String(url);
      if (path.includes('/stocks/quotes/')) {
        return jsonResponse(
          { s: 'ok', symbol: ['VTI', 'SPYI'], last: [371.57, 53.0092], mid: [371.89, 53.01], updated: [OCT_27_MIDNIGHT_NY, OCT_27_MIDNIGHT_NY] },
          203,
        );
      }
      return jsonResponse({ s: 'ok', t: [OCT_27_MIDNIGHT_NY], c: [268.43] });
    });

    const found = await marketDataPrices({ apiKey: () => 'key', fetch: fetchMock as typeof fetch })(['VTI', 'SPYI', 'FXAIX']);

    expect(found.get('VTI')).toEqual({ priceMicros: 371_570_000, asOf: '2026-10-27' });
    expect(found.get('SPYI')?.priceMicros).toBe(53_009_200);
    expect(found.get('FXAIX')).toEqual({ priceMicros: 268_430_000, asOf: '2026-10-27' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const init = fetchMock.mock.calls[0]?.[1 as never] as unknown as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer key');
  });

  it('tries the other endpoint before calling a symbol not found', async () => {
    const paths: string[] = [];
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const path = String(url);
      paths.push(path);
      // A five-letter X symbol that is really an ETF; an ETF-shaped symbol that is a fund.
      if (path.includes('/funds/candles/D/ABCD/')) return jsonResponse({ s: 'ok', t: [OCT_27_MIDNIGHT_NY], c: [10] });
      if (path.includes('/stocks/quotes/?symbols=WXYZX')) {
        return jsonResponse({ s: 'ok', symbol: ['WXYZX'], last: [20], updated: [OCT_27_MIDNIGHT_NY] });
      }
      if (path.includes('/stocks/quotes/')) {
        // An unknown symbol in a batch comes back with nulls.
        return jsonResponse({ s: 'ok', symbol: ['ABCD'], last: [null], mid: [null], updated: [null] });
      }
      return jsonResponse({ s: 'error', errmsg: 'Input is not a valid fund ticker.' }, 400);
    });

    const found = await marketDataPrices({ apiKey: () => 'key', fetch: fetchMock as typeof fetch })(['ABCD', 'WXYZX']);

    expect(found.get('ABCD')?.priceMicros).toBe(10_000_000);
    expect(found.get('WXYZX')?.priceMicros).toBe(20_000_000);
  });

  it('uses the mid price when a thinly traded fund has no last trade', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ s: 'ok', symbol: ['LALT'], last: [null], mid: [24.96], updated: [OCT_27_MIDNIGHT_NY] }),
    );
    const found = await marketDataPrices({ apiKey: () => 'key', fetch: fetchMock as typeof fetch })(['LALT']);
    expect(found.get('LALT')?.priceMicros).toBe(24_960_000);
  });

  it('says how to set it up when there is no key, without calling anyone', async () => {
    const fetchMock = vi.fn();
    const source = marketDataPrices({ apiKey: () => undefined, fetch: fetchMock as typeof fetch });
    await expect(source(['VTI'])).rejects.toMatchObject({ status: 503, message: expect.stringMatching(/Settings screen/) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks for nothing when there is nothing to ask for, key or no key', async () => {
    expect((await marketDataPrices({ apiKey: () => undefined })([])).size).toBe(0);
  });

  it.each([
    [401, /refused the API key/],
    [402, /plan does not include/],
    [429, /used up its requests/],
    [500, /answered 500/],
  ])('turns a %i into a message for the advisor, never the body', async (status, message) => {
    const fetchMock = vi.fn(async () => jsonResponse({ errmsg: 'token secret-key-text is bad' }, status));
    const source = marketDataPrices({ apiKey: () => 'secret-key-text', fetch: fetchMock as typeof fetch });

    const error = await source(['VTI']).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(502);
    expect((error as HttpError).message).toMatch(message);
    expect((error as HttpError).message).not.toContain('secret-key-text');
  });

  it('says so when Market Data cannot be reached', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const source = marketDataPrices({ apiKey: () => 'key', fetch: fetchMock as typeof fetch });
    await expect(source(['VTI'])).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/internet/) });
  });
});

describe('createPriceRefresher', () => {
  let workspace: string;
  let db: Db;
  const now = () => new Date('2026-11-02T15:00:00Z');

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'ai4rig-prices-'));
    db = openDatabase({ path: join(workspace, 'test.db') });
    runMigrations(db);
    db.prepare('DELETE FROM model_lines').run();
    db.prepare('DELETE FROM tickers').run();
    upsertTicker(db, { symbol: 'VTI', assetClass: 'EQUITY', defaultBucket: 'LATER', priceCents: 30_000 }, now());
    upsertTicker(db, { symbol: 'FXAIX', assetClass: 'EQUITY', defaultBucket: 'LATER' }, now());
    upsertTicker(db, { symbol: 'NOPE', assetClass: 'EQUITY', defaultBucket: 'LATER', priceCents: 1_234 }, now());
    upsertTicker(db, { symbol: 'VXPXX', assetClass: 'CASH', defaultBucket: 'NOW' }, now());
    upsertTicker(db, { symbol: 'CASH', assetClass: 'CASH', defaultBucket: 'NOW', priceCents: 100 }, now());
    upsertTicker(db, { symbol: '9999227', assetClass: 'CASH', defaultBucket: 'NOW' }, now());
  });

  afterEach(() => {
    db.close();
    rmSync(workspace, { recursive: true, force: true });
  });

  const market: PriceSource = async (symbols) =>
    new Map(
      symbols
        .filter((s) => s === 'VTI' || s === 'FXAIX')
        .map((s) => [s, { priceMicros: s === 'VTI' ? 371_570_000 : 268_430_000, asOf: '2026-10-30' }]),
    );

  it('saves what it finds with the day it is from, and reports the rest', async () => {
    const result = await createPriceRefresher(db, market, now)({ skipCheckedToday: false });

    expect(result.updated.slice().sort()).toEqual(['FXAIX', 'VTI']);
    expect(result.assumedCash.slice().sort()).toEqual(['9999227', 'VXPXX']);
    expect(result.notFound).toEqual(['NOPE']);

    expect(getTicker(db, 'VTI')).toMatchObject({ priceMicros: 371_570_000, priceCents: 37_157, priceAsOf: '2026-10-30' });
    expect(getTicker(db, 'VXPXX')).toMatchObject({ priceMicros: 1_000_000, priceCents: 100, priceAsOf: '2026-11-02' });
    // Not found keeps the price it had.
    expect(getTicker(db, 'NOPE')).toMatchObject({ priceCents: 1_234 });
    expect(result.tickers).toHaveLength(6);
  });

  it('tells a price that changed from one that was only looked up', async () => {
    const refresh = createPriceRefresher(db, market, now);
    expect((await refresh({ symbols: ['VTI'], skipCheckedToday: false })).changed).toEqual(['VTI']);
    const again = await refresh({ symbols: ['VTI'], skipCheckedToday: false });
    expect(again.updated).toEqual(['VTI']);
    expect(again.changed).toEqual([]);
  });

  it('never sends a quote service its own CASH line or a custodian row', async () => {
    const asked = vi.fn(market);
    await createPriceRefresher(db, asked, now)({ skipCheckedToday: false });
    expect(asked.mock.calls[0]?.[0]).not.toContain('CASH');
    expect(asked.mock.calls[0]?.[0]).not.toContain('9999227');
  });

  it('looks up only the symbols asked for', async () => {
    const asked = vi.fn(market);
    const result = await createPriceRefresher(db, asked, now)({ symbols: ['VTI'], skipCheckedToday: false });
    expect(asked.mock.calls[0]?.[0]).toEqual(['VTI']);
    expect(result.updated).toEqual(['VTI']);
    expect(getTicker(db, 'FXAIX')?.priceCents).toBeNull();
  });

  it('skips what it already looked up today, unless told to look now', async () => {
    const asked = vi.fn(market);
    const refresh = createPriceRefresher(db, asked, now);

    await refresh({ symbols: ['VTI', 'NOPE'], skipCheckedToday: true });
    const second = await refresh({ symbols: ['VTI', 'NOPE'], skipCheckedToday: true });
    expect(asked.mock.calls[1]?.[0]).toEqual([]);
    expect(second.updated).toEqual([]);
    expect(second.notFound).toEqual([]);

    await refresh({ symbols: ['VTI'], skipCheckedToday: false });
    expect(asked.mock.calls[2]?.[0]).toEqual(['VTI']);
  });

  it('changes nothing when the lookup fails', async () => {
    const failing: PriceSource = async () => {
      throw new HttpError(502, 'Market Data refused the API key.');
    };
    await expect(createPriceRefresher(db, failing, now)({ skipCheckedToday: false })).rejects.toThrow(/refused/);
    expect(getTicker(db, 'VTI')?.priceCents).toBe(30_000);
    expect(getTicker(db, 'VXPXX')?.priceCents).toBeNull();
  });
});
