import { useId } from 'react';

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  uppercase?: boolean;
}

export function TextField({ label, value, onChange, placeholder, hint, uppercase }: TextFieldProps) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder ?? ''}
        onChange={(event) =>
          onChange(uppercase === true ? event.target.value.toUpperCase() : event.target.value)
        }
      />
      {hint !== undefined && <p className="field-hint">{hint}</p>}
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}

/** Counts and years only. Money goes through MoneyInput. */
export function NumberField({ label, value, onChange, min, max, step, hint }: NumberFieldProps) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw === '' ? null : Number(raw));
        }}
      />
      {hint !== undefined && <p className="field-hint">{hint}</p>}
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
  hint?: string;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
  hint,
}: SelectFieldProps<T>) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
      {hint !== undefined && <p className="field-hint">{hint}</p>}
    </div>
  );
}

/** A value the system works out rather than one the advisor types. */
export function DerivedField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <output className="derived">{value}</output>
      {hint !== undefined && <p className="field-hint">{hint}</p>}
    </div>
  );
}
