import { assertCents, MoneyError, type Cents } from './index.js';

export interface WholeShares {
  readonly shares: number;
  /** shares x price: what the shares cost. */
  readonly costCents: Cents;
  /** What is left of the dollar amount, held as cash. Always under one share's price. */
  readonly cashCents: Cents;
}

/**
 * How many whole shares a dollar amount buys at a price (US-21). The team
 * settled on whole shares only, so this rounds down and keeps the remainder
 * as cash rather than buying a fraction or overspending the bucket.
 */
export function wholeShares(amountCents: Cents, priceCents: Cents): WholeShares {
  assertCents(amountCents, 'amountCents');
  assertCents(priceCents, 'priceCents');
  if (priceCents <= 0) throw new MoneyError(`priceCents must be above zero (got ${priceCents}).`);
  if (amountCents <= 0) return { shares: 0, costCents: 0, cashCents: Math.max(amountCents, 0) };

  const shares = Math.floor(amountCents / priceCents);
  const costCents = shares * priceCents;
  assertCents(costCents, 'costCents');
  return { shares, costCents, cashCents: amountCents - costCents };
}

/** A share count's value at a price, exactly. */
export function sharesValueCents(shares: number, priceCents: Cents): Cents {
  if (!Number.isSafeInteger(shares) || shares < 0) {
    throw new MoneyError(`shares must be a whole, non-negative number (got ${shares}).`);
  }
  assertCents(priceCents, 'priceCents');
  const value = shares * priceCents;
  assertCents(value, 'value');
  return value;
}
