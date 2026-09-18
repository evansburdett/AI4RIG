import { useEffect, useId, useState } from 'react';

import { centsToInput, parseCents, type Cents } from '../domain/money.js';

interface Props {
  label: string;
  valueCents: Cents;
  onChange: (cents: Cents) => void;
  hint?: string;
}

/**
 * A money field that hands back whole cents.
 *
 * Keeps the raw keystrokes in local state so the text is not reformatted
 * mid-edit, and tidies it on blur. Unparseable input keeps the last good value
 * and marks the field invalid rather than silently becoming zero.
 */
export function MoneyInput({ label, valueCents, onChange, hint }: Props) {
  const id = useId();
  const [draft, setDraft] = useState(() => centsToInput(valueCents));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(centsToInput(valueCents));
  }, [valueCents, focused]);

  const parsed = parseCents(draft);
  const invalid = draft.trim() !== '' && parsed === null;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="money-input">
        <span aria-hidden="true">$</span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={draft}
          aria-invalid={invalid}
          onFocus={() => setFocused(true)}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            const cents = parseCents(next);
            if (cents !== null) onChange(cents);
            else if (next.trim() === '') onChange(0);
          }}
          onBlur={() => {
            setFocused(false);
            setDraft(centsToInput(parsed ?? valueCents));
          }}
        />
      </div>
      {invalid && <p className="field-error">Enter an amount like 1234.56</p>}
      {hint !== undefined && !invalid && <p className="field-hint">{hint}</p>}
    </div>
  );
}
