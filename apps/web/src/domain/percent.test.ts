import { describe, expect, it } from 'vitest';

import { bpsToPercentInput, formatBps, parsePercentToBps } from './percent.js';

describe('parsePercentToBps', () => {
  it('reads whole and fractional percentages', () => {
    expect(parsePercentToBps('60')).toBe(6000);
    expect(parsePercentToBps('12.5')).toBe(1250);
    expect(parsePercentToBps('0.01')).toBe(1);
    expect(parsePercentToBps(' 33.33 % ')).toBe(3333);
    expect(parsePercentToBps('100')).toBe(10_000);
  });

  it('refuses anything it cannot read exactly', () => {
    expect(parsePercentToBps('')).toBeNull();
    expect(parsePercentToBps('abc')).toBeNull();
    expect(parsePercentToBps('12.345')).toBeNull();
    expect(parsePercentToBps('-5')).toBeNull();
    expect(parsePercentToBps('100.01')).toBeNull();
  });
});

describe('bpsToPercentInput', () => {
  it('round-trips and drops trailing zeros', () => {
    expect(bpsToPercentInput(6000)).toBe('60');
    expect(bpsToPercentInput(1250)).toBe('12.5');
    expect(bpsToPercentInput(3333)).toBe('33.33');
    expect(formatBps(1)).toBe('0.01%');
  });
});
