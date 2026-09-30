import { describe, expect, it } from 'vitest';

import { isValidSymbol, normalizeSymbol, withTicker } from './tickers.js';
import type { Ticker } from './types.js';

describe('normalizeSymbol', () => {
  it('trims and upper-cases what the advisor typed', () => {
    expect(normalizeSymbol('  schd ')).toBe('SCHD');
    expect(normalizeSymbol('brk.b')).toBe('BRK.B');
  });
});

describe('isValidSymbol', () => {
  it('accepts what the API accepts', () => {
    expect(isValidSymbol('SCHD')).toBe(true);
    expect(isValidSymbol('BRK.B')).toBe(true);
    expect(isValidSymbol('BF-B')).toBe(true);
    expect(isValidSymbol('A')).toBe(true);
  });

  it('refuses the rest', () => {
    expect(isValidSymbol('')).toBe(false);
    expect(isValidSymbol('schd')).toBe(false);
    expect(isValidSymbol('ABCDEFGHIJK')).toBe(false);
    expect(isValidSymbol('VT I')).toBe(false);
    expect(isValidSymbol('$VTI')).toBe(false);
  });
});

describe('withTicker', () => {
  const vti: Ticker = { symbol: 'VTI', assetClass: 'EQUITY', defaultBucket: 'LATER' };
  const bnd: Ticker = { symbol: 'BND', assetClass: 'FIXED_INCOME', defaultBucket: 'SOON' };

  it('adds a new ticker in symbol order', () => {
    const schd: Ticker = { symbol: 'SCHD', assetClass: 'EQUITY', defaultBucket: 'LATER' };
    expect(withTicker([bnd, vti], schd).map((t) => t.symbol)).toEqual(['BND', 'SCHD', 'VTI']);
  });

  it('replaces an existing one rather than listing it twice', () => {
    const moved: Ticker = { ...vti, defaultBucket: 'SOON' };
    expect(withTicker([bnd, vti], moved)).toEqual([bnd, moved]);
  });
});
