import { useState } from 'react';

import { typedMoney } from './typedMoney.js';

interface Props {
  /** Read by screen readers; a table cell has no visible label. */
  label: string;
  /** The value as it reads when not being edited, worked out by the caller. */
  text: string;
  /** Null when the text cannot be read; the cell then keeps the last good value. */
  parse: (text: string) => number | null;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  /** A dollar amount: commas are added as it is typed. */
  money?: boolean;
}

/**
 * A number typed in a table cell. While it has focus it keeps the keystrokes,
 * so "12." or "1,2" is not reformatted mid-edit; once it loses focus it shows
 * whatever the caller works out from the saved value. That is what lets the
 * dollars and weight of one fund both be editable: typing in one recomputes
 * the other, and neither fights the cursor.
 */
export function CellInput({ label, text, parse, onChange, prefix, suffix, money = false }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? text;
  const invalid = draft !== null && draft.trim() !== '' && parse(draft) === null;

  return (
    <span className="cell-input">
      {prefix !== undefined && <span aria-hidden="true">{prefix}</span>}
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={shown}
        aria-invalid={invalid}
        onFocus={() => setDraft(text)}
        onChange={(event) => {
          const next = money ? typedMoney(event.target) : event.target.value;
          setDraft(next);
          const value = next.trim() === '' ? 0 : parse(next);
          if (value !== null) onChange(value);
        }}
        onBlur={() => setDraft(null)}
      />
      {suffix !== undefined && <span aria-hidden="true">{suffix}</span>}
    </span>
  );
}
