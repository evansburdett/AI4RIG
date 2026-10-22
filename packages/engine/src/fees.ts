import { assertCents, MoneyError, type Cents } from './index.js';

/**
 * One row of RIG's advisory fee schedule: from this balance up to the next
 * row's, the whole balance is charged this rate. Basis points, so 1.25% is 125.
 */
export interface FeeTier {
  readonly minBalanceCents: Cents;
  readonly rateBps: number;
}

/**
 * The tier a balance falls in: the row with the highest minimum at or below it.
 * Null for a balance below every minimum, which a valid schedule (one starting
 * at $0) only gives for a negative balance.
 */
export function feeTierFor(balanceCents: Cents, tiers: readonly FeeTier[]): FeeTier | null {
  assertCents(balanceCents, 'balanceCents');
  let found: FeeTier | null = null;
  for (const tier of tiers) {
    if (tier.minBalanceCents <= balanceCents && (found === null || tier.minBalanceCents > found.minBalanceCents)) {
      found = tier;
    }
  }
  return found;
}

/**
 * The annual advisory fee on a balance (US-19), to the cent, rounding half a
 * cent up.
 *
 * RIG's schedule is a breakpoint schedule, not a marginal one (Ari, Sept 23):
 * the tier the balance falls in sets one rate for the entire balance. $6M is
 * charged 0.85% on all $6M, not 1.95% on the first $250k and so on. Nothing
 * here works band by band.
 */
export function advisoryFeeCents(balanceCents: Cents, tiers: readonly FeeTier[]): Cents {
  const tier = feeTierFor(balanceCents, tiers);
  if (tier === null || balanceCents <= 0) return 0;
  if (!Number.isInteger(tier.rateBps) || tier.rateBps < 0) {
    throw new MoneyError(`rateBps must be a whole, non-negative number of basis points (got ${tier.rateBps}).`);
  }

  // BigInt because a balance times a rate can pass 2^53 well before the
  // balance itself does.
  const fee = (BigInt(balanceCents) * BigInt(tier.rateBps) + 5_000n) / 10_000n;
  return Number(fee);
}
