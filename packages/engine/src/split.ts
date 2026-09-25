import { assertCents, MoneyError, type Cents } from './index.js';

/** Weights are basis points: 100 is 1%, 10000 is the whole amount. */
export const WHOLE_BPS = 10_000;

export interface Weighted<K> {
  readonly key: K;
  readonly weightBps: number;
}

export interface Share<K> {
  readonly key: K;
  readonly amountCents: Cents;
}

/**
 * Split an amount across weights so the pieces add back up to the amount
 * exactly, to the cent.
 *
 * This is how a bucket's dollars become positions in a model: $190,000.00 in a
 * 60/40 model is $114,000.00 and $76,000.00. When a weight does not divide the
 * amount evenly, each piece is rounded down and the leftover cents go, one at
 * a time, to the pieces that lost the most to rounding (largest remainder).
 * Ties go to the earlier line. Rounding each piece separately instead can
 * leave the positions a cent above or below the bucket, which then shows up
 * as a reconciliation difference against RIG's spreadsheet.
 *
 * Throws if the weights do not add up to exactly 10000, or if any weight is
 * not a positive whole number of basis points.
 */
export function splitByWeights<K>(amountCents: Cents, weights: readonly Weighted<K>[]): Share<K>[] {
  assertCents(amountCents, 'amountCents');
  if (amountCents < 0) throw new MoneyError(`amountCents must not be negative (got ${amountCents})`);

  let totalBps = 0;
  for (const { weightBps } of weights) {
    if (!Number.isInteger(weightBps) || weightBps <= 0) {
      throw new RangeError(`weights must be positive whole basis points (got ${weightBps})`);
    }
    totalBps += weightBps;
  }
  if (totalBps !== WHOLE_BPS) {
    throw new RangeError(`weights must add up to ${WHOLE_BPS} basis points (got ${totalBps})`);
  }

  // amount * weight stays well inside the safe integer range for any amount
  // below $9 trillion, so this is exact integer arithmetic.
  const pieces = weights.map(({ key, weightBps }, index) => {
    const scaled = amountCents * weightBps;
    return { key, index, cents: Math.floor(scaled / WHOLE_BPS), remainder: scaled % WHOLE_BPS };
  });

  let leftover = amountCents - pieces.reduce((sum, p) => sum + p.cents, 0);
  const byRemainder = [...pieces].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const piece of byRemainder) {
    if (leftover === 0) break;
    piece.cents += 1;
    leftover -= 1;
  }

  return pieces.map(({ key, cents }) => ({ key, amountCents: cents }));
}
