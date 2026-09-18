import { describe, expect, it } from 'vitest';

import {
  centsToInput,
  formatCents,
  multiplyCents,
  parseCents,
  percentOf,
} from './money.js';

describe('parseCents', () => {
  it('reads the formats an advisor actually types', () => {
    expect(parseCents('1234.56')).toBe(123456);
    expect(parseCents('$1,234.56')).toBe(123456);
    expect(parseCents('  1234 ')).toBe(123400);
    expect(parseCents('1234.5')).toBe(123450);
    expect(parseCents('.5')).toBe(50);
    expect(parseCents('-40')).toBe(-4000);
  });

  it('does not lose the cent that a float would lose', () => {
    // The reason this module exists: parseFloat('1.005') * 100 is
    // 100.49999999999999, which rounds down to the wrong cent.
    expect(parseCents('1.00')).toBe(100);
    expect(parseCents('0.07')).toBe(7);
    expect(parseCents('1234567.89')).toBe(123456789);
  });

  it('returns null rather than guessing', () => {
    expect(parseCents('')).toBeNull();
    expect(parseCents('abc')).toBeNull();
    expect(parseCents('1.234')).toBeNull();
    expect(parseCents('1.2.3')).toBeNull();
    expect(parseCents('-')).toBeNull();
  });
});

describe('centsToInput', () => {
  it('round-trips through parseCents', () => {
    for (const cents of [0, 7, 100, 123456, -4000, 999999999]) {
      expect(parseCents(centsToInput(cents))).toBe(cents);
    }
  });

  it('keeps the leading zero on the pennies', () => {
    expect(centsToInput(1007)).toBe('10.07');
    expect(centsToInput(1000)).toBe('10.00');
  });
});

describe('formatCents', () => {
  it('formats for display', () => {
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(0)).toBe('$0.00');
  });

  it('refuses a float', () => {
    expect(() => formatCents(12.5)).toThrow(/whole number of cents/);
  });
});

describe('multiplyCents', () => {
  it('matches the worksheet inflation hedge', () => {
    // $60,000 annual gap * 5 years * 0.075 = $22,500.
    expect(multiplyCents(multiplyCents(6_000_000, 5), 0.075)).toBe(2_250_000);
  });

  it('rounds half away from zero in both directions', () => {
    expect(multiplyCents(101, 0.5)).toBe(51);
    expect(multiplyCents(-101, 0.5)).toBe(-51);
  });

  it('applies the 1.15 gross-up without drifting', () => {
    expect(multiplyCents(10_000_00, 1.15)).toBe(11_500_00);
  });
});

describe('percentOf', () => {
  it('reports one decimal place', () => {
    expect(percentOf(2500, 10000)).toBe(25);
    expect(percentOf(1, 3)).toBe(33.3);
  });

  it('is zero rather than NaN on an empty portfolio', () => {
    expect(percentOf(0, 0)).toBe(0);
  });
});
