import { describe, expect, it } from 'vitest';

import { positionValueCents, SHARES_SCALE } from './index.js';

describe('positionValueCents', () => {
  it('values whole and fractional shares in cents', () => {
    expect(positionValueCents(2 * SHARES_SCALE, 12_345)).toBe(24_690);
    expect(positionValueCents(1_500_000, 10_001)).toBe(15_002);
  });

  it('rounds half a cent away from zero', () => {
    expect(positionValueCents(500_000, 1)).toBe(1);
  });

  it('rejects invalid shares and prices', () => {
    expect(() => positionValueCents(-1, 100)).toThrow(/sharesMicros/);
    expect(() => positionValueCents(1.2, 100)).toThrow(/sharesMicros/);
    expect(() => positionValueCents(1, -1)).toThrow(/priceCents/);
  });
});
