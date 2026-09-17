import { useEffect, useId, useState } from 'react';

import { centsToInput, parseCents, type Cents } from '../domain/money.js';

interface Props {
  label: string;
  valueCents: Cents;
  onChange: (cents: Cents) => void;
  hint?: string;
  disabled?: boolean;
}

/**
 * A money field that hands back whole cents.
 *
 * It keeps the advisor's raw keystrokes in local state rather than reformatting
 * on every change. Normalising as they type is the behaviour where someone
 * enters "10.05", the field rewrites it to "10.5" mid-keystroke, and they end
 * up with the wrong number and no idea why. The text is theirs until they leave
 * the field; only then does it get tidied to match the cents it parsed to.
 *
 * Anything unparseable leaves the last good value in place and marks the field
 * invalid, so a typo cannot silently become zero.
 */
export function MoneyInput({ label, valueCents, onChange, hint, disabled = false }: Props) {
  const id = useId();
  const [draft, setDraft] = useState(() => centsToInput(valueCents));
  const [focused, setFocused] = useState(false);

  // Follow the value when it changes from somewhere else — a different client
  // loaded into the same field — but never while the advisor is mid-edit.
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
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={hint === undefined ? undefined : `${id}-hint`}
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
      {hint !== undefined && !invalid && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}
