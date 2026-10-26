import { groupThousands } from '../domain/money.js';

/**
 * Adds commas to a money field as it is typed, keeping the cursor after the
 * same digit. Call it from onChange and use what it returns as the new value.
 *
 * It writes the formatted text and the cursor to the field itself before
 * React re-renders. React then finds the field already showing the new
 * value and leaves the cursor alone; otherwise every comma would throw the
 * cursor to the end of the field.
 */
export function typedMoney(input: HTMLInputElement): string {
  const raw = input.value;
  const formatted = groupThousands(raw);
  if (formatted === raw) return raw;

  // Count the characters that matter before the cursor, then find the spot
  // in the formatted text with the same count in front of it.
  const caret = input.selectionStart ?? raw.length;
  const before = raw.slice(0, caret).replace(/[^\d.-]/g, '').length;
  let position = 0;
  for (let seen = 0; position < formatted.length && seen < before; position += 1) {
    if (/[\d.-]/.test(formatted[position] ?? '')) seen += 1;
  }

  input.value = formatted;
  input.setSelectionRange(position, position);
  return formatted;
}
