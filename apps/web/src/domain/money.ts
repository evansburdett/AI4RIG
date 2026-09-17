/**
 * Dollars in, cents out.
 *
 * The advisor types "1,234.56" and the rest of the app has to see `123456`.
 * The obvious `Math.round(parseFloat(text) * 100)` is the bug this module
 * exists to avoid: `parseFloat('1.005') * 100` is `100.49999999999999`, which
 * rounds to the wrong cent. We split the string on the decimal point and read
 * each side as an integer instead, so no float is ever involved.
 *
 * See docs/decisions/0004-money-as-integer-cents.md.
 */

import { assertCents, type Cents } from '@ai4rig/engine';

export type { Cents };

const CURRENCY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const CURRENCY_WHOLE = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** "$1,234.56". Formatting is display only — never feed the result back in. */
export function formatCents(cents: Cents): string {
  assertCents(cents, 'cents');
  return CURRENCY.format(cents / 100);
}

/** "$1,235" — for totals in a summary, where the pennies are noise. */
export function formatCentsWhole(cents: Cents): string {
  assertCents(cents, 'cents');
  return CURRENCY_WHOLE.format(Math.round(cents / 100));
}

/** "1234.56" — what goes into a text input the advisor is about to edit. */
export function centsToInput(cents: Cents): string {
  assertCents(cents, 'cents');
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const dollars = Math.trunc(absolute / 100);
  const remainder = String(absolute % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${dollars}.${remainder}`;
}

/**
 * Read what the advisor typed. Accepts "$1,234.56", "1234.5", "1234", "".
 *
 * Returns null for anything it cannot read, including empty — the caller
 * decides whether that means zero or means the field is incomplete. Silently
 * returning 0 for garbage is how a typo becomes a wrong plan.
 */
export function parseCents(text: string): Cents | null {
  const cleaned = text.trim().replace(/[$,\s]/g, '');
  if (cleaned === '') return null;

  const match = /^(-?)(\d*)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;

  const [, sign, whole = '', fraction] = match;
  if (whole === '' && fraction === undefined) return null;

  const dollars = whole === '' ? 0 : Number(whole);
  const pennies = fraction === undefined ? 0 : Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(dollars * 100 + pennies)) return null;

  const total = dollars * 100 + pennies;
  return sign === '-' ? -total : total;
}

/**
 * Multiply money by a plain number and round to the nearest cent.
 *
 * Used for the worksheet's inflation hedge (× 0.075) and its 1.15 tax gross-up
 * on forced withdrawals. Rounding happens here, once, half-up, so that there is
 * one documented answer to "where did the half cent go" rather than a different
 * answer at every call site.
 */
export function multiplyCents(cents: Cents, factor: number): Cents {
  assertCents(cents, 'cents');
  if (!Number.isFinite(factor)) {
    throw new TypeError(`factor must be a finite number (got ${String(factor)})`);
  }
  const product = cents * factor;
  // Math.round breaks ties toward +Infinity, so -0.5 would go to -0 and 0.5 to
  // 1 — asymmetric. Rounding the magnitude and reapplying the sign keeps the
  // two directions consistent.
  const rounded = Math.sign(product) * Math.round(Math.abs(product));
  assertCents(rounded, 'product');
  return rounded;
}

/** Percentage of `total` that `part` represents, to one decimal. 0 when total is 0. */
export function percentOf(part: Cents, total: Cents): number {
  assertCents(part, 'part');
  assertCents(total, 'total');
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function formatPercent(pct: number): string {
  return `${pct.toFixed(1)}%`;
}
