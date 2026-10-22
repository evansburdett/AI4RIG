import { describe, expect, it } from 'vitest';

import { sharesValueCents, wholeShares } from './shares.js';

describe('wholeShares', () => {
  it('buys as many whole shares as fit and keeps the rest as cash', () => {
    // $123,000 of SGOV at $100.37.
    expect(wholeShares(123_000_00, 100_37)).toEqual({
      shares: 1225,
      costCents: 122_953_25,
      cashCents: 46_75,
    });
  });

  it('never spends more than the amount', () => {
    for (const [amount, price] of [[99_99, 100_00], [1_000_00, 333_33], [7, 3]] as const) {
      const { costCents, cashCents } = wholeShares(amount, price);
      expect(costCents).toBeLessThanOrEqual(amount);
      expect(costCents + cashCents).toBe(amount);
      expect(cashCents).toBeLessThan(price);
    }
  });

  it('buys nothing with nothing', () => {
    expect(wholeShares(0, 100_00)).toEqual({ shares: 0, costCents: 0, cashCents: 0 });
  });

  it('refuses a price of zero or less, and fractional cents', () => {
    expect(() => wholeShares(100_00, 0)).toThrow(/above zero/);
    expect(() => wholeShares(100.5, 100)).toThrow(/whole number of cents/);
  });
});

describe('sharesValueCents', () => {
  it('values whole shares exactly', () => {
    expect(sharesValueCents(1225, 104_10)).toBe(127_522_50);
  });

  it('refuses a fraction of a share', () => {
    expect(() => sharesValueCents(1.5, 100)).toThrow(/whole/);
  });
});
