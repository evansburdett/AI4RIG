/**
 * Dollars in, cents out.
 *
 * Parsing splits the string on the decimal point rather than using
 * `parseFloat(text) * 100`, which rounds "1.005" to the wrong cent.
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

export function formatCents(cents: Cents): string {
  assertCents(cents, 'cents');
  return CURRENCY.format(cents / 100);
}

export function formatCentsWhole(cents: Cents): string {
  assertCents(cents, 'cents');
  return CURRENCY_WHOLE.format(Math.round(cents / 100));
}

/** "1234.56" — the value for a text input. */
export function centsToInput(cents: Cents): string {
  assertCents(cents, 'cents');
  const absolute = Math.abs(cents);
  const dollars = Math.trunc(absolute / 100);
  const remainder = String(absolute % 100).padStart(2, '0');
  return `${cents < 0 ? '-' : ''}${dollars}.${remainder}`;
}

/** Null when the text cannot be read, so a typo never becomes 0 silently. */
export function parseCents(text: string): Cents | null {
  const cleaned = text.trim().replace(/[$,\s]/g, '');
  if (cleaned === '') return null;

  const match = /^(-?)(\d*)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;

  const [, sign, whole = '', fraction] = match;
  if (whole === '' && fraction === undefined) return null;

  const dollars = whole === '' ? 0 : Number(whole);
  const pennies = fraction === undefined ? 0 : Number(fraction.padEnd(2, '0'));
  const total = dollars * 100 + pennies;
  if (!Number.isSafeInteger(total)) return null;

  return sign === '-' ? -total : total;
}

/** Rounds half away from zero. The one place money rounding happens. */
export function multiplyCents(cents: Cents, factor: number): Cents {
  assertCents(cents, 'cents');
  if (!Number.isFinite(factor)) {
    throw new TypeError(`factor must be a finite number (got ${String(factor)})`);
  }
  const product = cents * factor;
  const rounded = Math.sign(product) * Math.round(Math.abs(product));
  assertCents(rounded, 'product');
  return rounded;
}

export function percentOf(part: Cents, total: Cents): number {
  assertCents(part, 'part');
  assertCents(total, 'total');
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function formatPercent(pct: number): string {
  return `${pct.toFixed(1)}%`;
}
