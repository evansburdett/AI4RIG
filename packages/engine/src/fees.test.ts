import { describe, expect, it } from 'vitest';

import { advisoryFeeCents, feeTierFor, type FeeTier } from './fees.js';

/** RIG's schedule as Ari sent it, Sept 23. */
const RIG_TIERS: FeeTier[] = [
  { minBalanceCents: 0, rateBps: 195 },
  { minBalanceCents: 250_000_00, rateBps: 175 },
  { minBalanceCents: 500_000_00, rateBps: 150 },
  { minBalanceCents: 1_000_000_00, rateBps: 125 },
  { minBalanceCents: 2_500_000_00, rateBps: 100 },
  { minBalanceCents: 5_000_000_00, rateBps: 85 },
];

describe('feeTierFor', () => {
  it('puts each boundary in the tier it starts', () => {
    const rate = (cents: number) => feeTierFor(cents, RIG_TIERS)?.rateBps;
    expect(rate(0)).toBe(195);
    expect(rate(249_999_99)).toBe(195);
    expect(rate(250_000_00)).toBe(175);
    expect(rate(499_999_99)).toBe(175);
    expect(rate(500_000_00)).toBe(150);
    expect(rate(999_999_99)).toBe(150);
    expect(rate(1_000_000_00)).toBe(125);
    expect(rate(2_499_999_99)).toBe(125);
    expect(rate(2_500_000_00)).toBe(100);
    expect(rate(4_999_999_99)).toBe(100);
    expect(rate(5_000_000_00)).toBe(85);
  });

  it('does not depend on the order the tiers are listed in', () => {
    expect(feeTierFor(600_000_00, [...RIG_TIERS].reverse())?.rateBps).toBe(150);
  });
});

describe('advisoryFeeCents', () => {
  it('matches the example from the Sept 23 meeting: $1.2M at 1.25% is $15,000', () => {
    expect(advisoryFeeCents(1_200_000_00, RIG_TIERS)).toBe(15_000_00);
  });

  it('charges the whole balance the one rate, not band by band', () => {
    // Ari's example: $6M is 0.85% of the full $6M.
    expect(advisoryFeeCents(6_000_000_00, RIG_TIERS)).toBe(51_000_00);
  });

  it('steps down at a breakpoint rather than blending across it', () => {
    expect(advisoryFeeCents(249_999_99, RIG_TIERS)).toBe(4_875_00); // 1.95%, rounded
    expect(advisoryFeeCents(250_000_00, RIG_TIERS)).toBe(4_375_00); // 1.75%
  });

  it('rounds half a cent up', () => {
    // $1.00 at 1.50% is 1.5 cents.
    expect(advisoryFeeCents(100, [{ minBalanceCents: 0, rateBps: 150 }])).toBe(2);
    expect(advisoryFeeCents(100, [{ minBalanceCents: 0, rateBps: 140 }])).toBe(1);
  });

  it('is zero for no balance, or no schedule', () => {
    expect(advisoryFeeCents(0, RIG_TIERS)).toBe(0);
    expect(advisoryFeeCents(-5_00, RIG_TIERS)).toBe(0);
    expect(advisoryFeeCents(1_000_000_00, [])).toBe(0);
  });
});
