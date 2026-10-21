/**
 * Deterministic calculations: the same inputs always give the same answer.
 * No database, no network, no clock (ADR 0005). Money is a whole number of
 * cents everywhere (ADR 0004).
 */

/**
 * A whole number of cents. $2,500.00 is `250000`.
 *
 * This is an alias, not a wrapper — it costs nothing at runtime and it makes
 * the intent of a number visible in a signature. Anything typed `Cents` must
 * be an integer; `assertCents` is how you check a value coming from outside.
 */
export type Cents = number;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/**
 * Guard for values arriving from a request body, a spreadsheet import, or a
 * database column that should have been INTEGER.
 */
export function assertCents(value: unknown, label = 'value'): asserts value is Cents {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new MoneyError(
      `${label} must be a whole number of cents (got ${JSON.stringify(value)}). ` +
        'Money is never a float on this project.',
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} is outside the safe integer range (got ${value}).`);
  }
}

/** Sum cents exactly. Rejects anything that is not a whole number of cents. */
export function addCents(...amounts: Cents[]): Cents {
  let total = 0;
  for (const [index, amount] of amounts.entries()) {
    assertCents(amount, `amounts[${index}]`);
    total += amount;
  }
  assertCents(total, 'total');
  return total;
}

export { splitByWeights, WHOLE_BPS, type Share, type Weighted } from './split.js';
