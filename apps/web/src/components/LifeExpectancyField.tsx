import { useId, useState } from 'react';

import type {
  LifeExpectancyEstimate,
  LifeExpectancyRequest,
  Person,
} from '../domain/types.js';

interface Props {
  person: Person;
  /** Null until a valid year of birth is entered. */
  age: number | null;
  onChange: (changes: Pick<Person, 'lifeExpectancyAge' | 'lifeExpectancySource'>) => void;
  onEstimate: (request: LifeExpectancyRequest) => Promise<LifeExpectancyEstimate>;
}

/**
 * US-28: life expectancy as an AI suggestion the advisor can accept or type
 * over. The button sends age, gender, and health concerns, and nothing else;
 * the answer lands in the field marked as an estimate. Typing in the field
 * makes it the advisor's own figure.
 */
export function LifeExpectancyField({ person, age, onChange, onEstimate }: Props) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);

  const blocker =
    age === null
      ? 'Enter a year of birth first.'
      : person.gender === null
        ? 'Choose a gender first.'
        : null;

  async function estimate() {
    if (age === null || person.gender === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onEstimate({
        age,
        gender: person.gender,
        healthConcerns: person.healthConcerns,
        healthConcernOther: person.healthConcernOther,
      });
      onChange({ lifeExpectancyAge: result.lifeExpectancyAge, lifeExpectancySource: 'AI' });
      setExplanation(result.explanation === '' ? null : result.explanation);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <label htmlFor={id}>
        Life expectancy age{' '}
        {person.lifeExpectancySource === 'AI' && <span className="tag">AI estimate</span>}
        {person.lifeExpectancySource === 'ADVISOR' && <span className="tag">entered by advisor</span>}
      </label>
      <div className="inline-action">
        <input
          id={id}
          type="number"
          min={age ?? 0}
          max={120}
          value={person.lifeExpectancyAge ?? ''}
          onChange={(event) => {
            const raw = event.target.value;
            setExplanation(null);
            onChange(
              raw === ''
                ? { lifeExpectancyAge: null, lifeExpectancySource: null }
                : { lifeExpectancyAge: Number(raw), lifeExpectancySource: 'ADVISOR' },
            );
          }}
        />
        <button
          type="button"
          disabled={blocker !== null || busy}
          title={blocker ?? undefined}
          onClick={() => void estimate()}
        >
          {busy ? 'Estimating…' : person.lifeExpectancySource === 'AI' ? 'Estimate again' : 'Estimate with AI'}
        </button>
      </div>
      {explanation !== null && <p className="field-hint">{explanation}</p>}
      {error !== null && <p className="field-error">{error}</p>}
      <p className="field-hint">
        {blocker ?? 'Uses age, gender, and health concerns only. Type over it to use your own.'}
      </p>
    </div>
  );
}
