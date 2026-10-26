import { useEffect, useState } from 'react';

import { Callout } from '../components/Callout.js';
import { typedMoney } from '../components/typedMoney.js';
import { centsToInput, formatCents, parseCents } from '../domain/money.js';
import { bpsToPercentInput, parsePercentToBps } from '../domain/percent.js';
import type { AdvisoryFeeTier } from '../domain/types.js';
import { FEE_TIER_BASIS } from '../domain/worksheet.js';

interface Props {
  tiers: readonly AdvisoryFeeTier[];
  /** Rejects with the reason when the schedule is refused. */
  onSave: (tiers: AdvisoryFeeTier[]) => Promise<void>;
}

interface DraftTier {
  readonly key: number;
  readonly minText: string;
  readonly rateText: string;
}

let nextKey = 1;

function toDraft(tiers: readonly AdvisoryFeeTier[]): DraftTier[] {
  return tiers.map((t) => ({
    key: nextKey++,
    minText: centsToInput(t.minBalanceCents),
    rateText: bpsToPercentInput(t.rateBps),
  }));
}

/**
 * US-19: RIG's advisory fee schedule, as data. A breakpoint schedule: the
 * row a balance falls in sets the rate for the whole balance, which is the
 * thing most worth saying on this screen, because the natural reading of a
 * tier table is the marginal one.
 */
export function FeeTiers({ tiers, onSave }: Props) {
  const [draft, setDraft] = useState<DraftTier[]>(() => toDraft(tiers));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // Reload when the saved schedule changes underneath (first load, or a save).
  useEffect(() => setDraft(toDraft(tiers)), [tiers]);

  const parsed = draft.map((row) => ({
    minBalanceCents: parseCents(row.minText),
    rateBps: parsePercentToBps(row.rateText),
  }));
  const problem =
    parsed.length === 0
      ? 'The schedule needs at least one tier.'
      : parsed.some((t) => t.minBalanceCents === null || t.rateBps === null)
        ? 'Every tier needs a starting balance like 250000 and a rate like 1.75.'
        : parsed[0]?.minBalanceCents !== 0
          ? 'The first tier has to start at $0.'
          : parsed.some((t, i) => i > 0 && (t.minBalanceCents ?? 0) <= (parsed[i - 1]?.minBalanceCents ?? 0))
            ? 'List the tiers lowest balance first, each starting above the one before.'
            : null;

  async function save() {
    if (problem !== null) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(parsed.map((t) => ({ minBalanceCents: t.minBalanceCents ?? 0, rateBps: t.rateBps ?? 0 })));
      setSavedAt(new Date());
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  function patch(key: number, changes: Partial<DraftTier>) {
    setDraft((rows) => rows.map((r) => (r.key === key ? { ...r, ...changes } : r)));
    setSavedAt(null);
  }

  return (
    <div>
      <header className="screen-header">
        <h2>Advisory fee tiers</h2>
        <p className="muted">
          Each account sets aside one year of its advisory fee as cash in its Now bucket, and the
          plan&rsquo;s Now total includes it.
        </p>
      </header>

      <section className="card">
        <Callout tone="info" title="The whole balance is charged one rate">
          This is a breakpoint schedule, not a marginal one. The tier a balance falls in sets the
          rate for all of it: $6,000,000 is charged 0.85% on the full $6,000,000.
        </Callout>

        <table>
          <thead>
            <tr>
              <th scope="col">From balance</th>
              <th scope="col">Up to</th>
              <th scope="col">Annual rate</th>
              <th scope="col">
                <span className="visually-hidden">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {draft.map((row, index) => {
              const next = parsed[index + 1]?.minBalanceCents;
              return (
                <tr key={row.key}>
                  <td>
                    <div className="money-input">
                      <span aria-hidden="true">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`Tier ${index + 1} starting balance`}
                        value={row.minText}
                        aria-invalid={parseCents(row.minText) === null}
                        onChange={(event) => patch(row.key, { minText: typedMoney(event.target) })}
                      />
                    </div>
                  </td>
                  <td className="muted">
                    {next === undefined
                      ? 'and up'
                      : next === null
                        ? '—'
                        : `${formatCents(Math.max(next - 1, 0))}`}
                  </td>
                  <td>
                    <span className="percent-input">
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`Tier ${index + 1} rate`}
                        value={row.rateText}
                        aria-invalid={parsePercentToBps(row.rateText) === null}
                        onChange={(event) => patch(row.key, { rateText: event.target.value })}
                      />
                      <span aria-hidden="true">%</span>
                    </span>
                  </td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        setDraft((rows) => rows.filter((r) => r.key !== row.key));
                        setSavedAt(null);
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="button-row">
          <button
            type="button"
            onClick={() =>
              setDraft((rows) => [...rows, { key: nextKey++, minText: '', rateText: '' }])
            }
          >
            Add tier
          </button>
          <button type="button" className="primary" disabled={problem !== null || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save schedule'}
          </button>
          {problem !== null && <span className="muted">{problem}</span>}
          {savedAt !== null && problem === null && <span className="muted">Saved.</span>}
        </div>
        {error !== null && <p className="field-error">{error}</p>}
      </section>

      <section className="card">
        <h3>Which balance picks the tier</h3>
        <p>
          {FEE_TIER_BASIS === 'HOUSEHOLD'
            ? 'The household’s total across all accounts picks the tier, and that one rate is charged on every account. Each account holds its own share of the fee as cash in its Now bucket.'
            : 'Each account’s own balance picks its tier.'}
        </p>
      </section>
    </div>
  );
}
