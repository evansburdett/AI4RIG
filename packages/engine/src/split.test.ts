import { describe, expect, it } from 'vitest';

import { splitByWeights } from './split.js';

const sum = (shares: { amountCents: number }[]) => shares.reduce((t, s) => t + s.amountCents, 0);

describe('splitByWeights', () => {
  it('splits evenly divisible amounts exactly', () => {
    const shares = splitByWeights(190_000_00, [
      { key: 'SGOV', weightBps: 6000 },
      { key: 'BIL', weightBps: 4000 },
    ]);
    expect(shares).toEqual([
      { key: 'SGOV', amountCents: 114_000_00 },
      { key: 'BIL', amountCents: 76_000_00 },
    ]);
  });

  it('always adds back up to the amount, to the cent', () => {
    const weights = [
      { key: 'A', weightBps: 3333 },
      { key: 'B', weightBps: 3333 },
      { key: 'C', weightBps: 3334 },
    ];
    for (const amount of [1, 2, 100, 101, 99_999, 914_700_00, 1_895_300_01]) {
      expect(sum(splitByWeights(amount, weights))).toBe(amount);
    }
  });

  it('gives leftover cents to the pieces that lost the most to rounding', () => {
    // $0.10 at 1/3 each: 3.333, 3.333, 3.334 cents. The third has the largest
    // remainder and gets the extra cent.
    const shares = splitByWeights(10, [
      { key: 'A', weightBps: 3333 },
      { key: 'B', weightBps: 3333 },
      { key: 'C', weightBps: 3334 },
    ]);
    expect(shares.map((s) => s.amountCents)).toEqual([3, 3, 4]);
  });

  it('breaks ties toward the earlier line', () => {
    const shares = splitByWeights(1, [
      { key: 'A', weightBps: 5000 },
      { key: 'B', weightBps: 5000 },
    ]);
    expect(shares.map((s) => s.amountCents)).toEqual([1, 0]);
  });

  it('returns zeros for a zero amount', () => {
    expect(splitByWeights(0, [{ key: 'A', weightBps: 10_000 }])).toEqual([{ key: 'A', amountCents: 0 }]);
  });

  it('refuses weights that do not add up to 100%', () => {
    expect(() => splitByWeights(100, [{ key: 'A', weightBps: 9999 }])).toThrow(/10000/);
  });

  it('refuses fractional or non-positive weights', () => {
    expect(() =>
      splitByWeights(100, [
        { key: 'A', weightBps: 5000.5 },
        { key: 'B', weightBps: 4999.5 },
      ]),
    ).toThrow(/whole basis points/);
    expect(() =>
      splitByWeights(100, [
        { key: 'A', weightBps: 10_000 },
        { key: 'B', weightBps: 0 },
      ]),
    ).toThrow(/whole basis points/);
  });

  it('refuses float money and negative amounts', () => {
    expect(() => splitByWeights(10.5, [{ key: 'A', weightBps: 10_000 }])).toThrow(/whole number of cents/);
    expect(() => splitByWeights(-1, [{ key: 'A', weightBps: 10_000 }])).toThrow(/negative/);
  });
});
