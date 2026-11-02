import { describe, expect, it } from 'vitest';

import { caseSymbols, priceAges } from './prices.js';
import type { ClientCase, Ticker } from './types.js';

const ticker = (symbol: string, priceCents: number | null, priceAsOf: string | null): Ticker => ({
  symbol,
  name: null,
  assetClass: 'EQUITY',
  defaultBucket: 'LATER',
  priceCents,
  priceMicros: priceCents === null ? null : priceCents * 10_000,
  priceAsOf,
});

const today = new Date('2026-11-02T15:00:00Z');

describe('priceAges', () => {
  it('gives the range of dates among the funds asked about', () => {
    const tickers = [ticker('A', 100, '2026-10-30'), ticker('B', 100, '2026-11-02'), ticker('C', 100, '2020-01-01')];
    expect(priceAges(['A', 'B'], tickers, today)).toEqual({
      total: 2,
      oldest: '2026-10-30',
      newest: '2026-11-02',
      stale: 0,
      missing: 0,
    });
  });

  it('counts prices over a week old and funds with no price', () => {
    const tickers = [ticker('A', 100, '2026-10-20'), ticker('B', null, null), ticker('C', 100, '2026-11-02')];
    expect(priceAges(['A', 'B', 'C', 'UNKNOWN'], tickers, today)).toMatchObject({ stale: 1, missing: 2 });
  });

  it('has nothing to say about no funds', () => {
    expect(priceAges([], [], today)).toEqual({ total: 0, oldest: null, newest: null, stale: 0, missing: 0 });
  });
});

describe('caseSymbols', () => {
  it('lists each fund once, from the accounts and from a locked proposal', () => {
    const clientCase = {
      accounts: [
        {
          lines: [{ tickerSymbol: 'VTI' }, { tickerSymbol: 'BND' }],
          proposalShares: [{ tickerSymbol: 'SOLD' }],
        },
        { lines: [{ tickerSymbol: 'VTI' }], proposalShares: [] },
      ],
    } as unknown as ClientCase;
    expect(caseSymbols(clientCase)).toEqual(['BND', 'SOLD', 'VTI']);
  });
});
