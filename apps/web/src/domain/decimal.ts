/**
 * Numbers from a spreadsheet, read exactly. A price of 53.0092 or a quantity
 * of 3.796 shares is not exact as a JavaScript number, and money rounding
 * happens once, on purpose (ADR 0004). So the import reads every number cell
 * as its text and turns it into a whole number of the unit wanted here:
 * cents, millionths of a share, or millionths of a weight.
 */

/**
 * "53.0092" with 2 decimals is 5301: the number times 10^decimals, rounded
 * half away from zero. Accepts what Excel writes, including "1.2E-2" and a
 * stray "$" or commas. Null for anything that is not a number.
 */
export function toScaledInteger(text: string, decimals: number): number | null {
  const cleaned = text.trim().replace(/[$,\s]/g, '');
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(cleaned);
  if (!match) return null;
  const [, sign = '', whole = '', fraction = '', exponent = '0'] = match;
  if (whole === '' && fraction === '') return null;

  // All the digits, and how many of them come before the point once scaled.
  const digits = whole + fraction;
  const kept = whole.length + Number(exponent) + decimals;

  let value: number;
  if (kept >= digits.length) {
    value = Number(digits + '0'.repeat(kept - digits.length));
  } else if (kept < 0) {
    value = 0;
  } else {
    const roundUp = (digits[kept] ?? '0') >= '5';
    value = Number(digits.slice(0, kept) || '0') + (roundUp ? 1 : 0);
  }
  if (!Number.isSafeInteger(value)) return null;
  return sign === '-' && value !== 0 ? -value : value;
}

/** A spreadsheet cell as text: numbers read as text stay exact, anything else is stringified. */
export function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString();
  return String(cell).trim();
}
