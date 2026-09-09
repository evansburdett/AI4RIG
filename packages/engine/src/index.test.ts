import { describe, expect, it } from 'vitest';

import { addCents, assertCents, MoneyError } from './index.js';

describe('integer-cents money', () => {
  it('sums exactly where float dollars would not', () => {
    // 0.10 + 0.20 !== 0.30 in float dollars. In cents it is just 10 + 20.
    expect(addCents(10, 20)).toBe(30);
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('adds large balances without drift', () => {
    expect(addCents(125_000_00, 87_550_25, 3_99)).toBe(212_554_24);
  });

  it('rejects a float that slipped in as dollars', () => {
    expect(() => addCents(2500.5)).toThrow(MoneyError);
    expect(() => assertCents(0.1 + 0.2)).toThrow(/whole number of cents/);
  });

  it('rejects values that are not numbers at all', () => {
    expect(() => assertCents('250000')).toThrow(MoneyError);
    expect(() => assertCents(null)).toThrow(MoneyError);
  });

  it('sums nothing to zero', () => {
    expect(addCents()).toBe(0);
  });
});
