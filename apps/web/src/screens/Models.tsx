import { useEffect, useState } from 'react';

import { ApiError } from '../api.js';
import { Callout } from '../components/Callout.js';
import { newModel } from '../domain/factory.js';
import { modelBucketMix, tickersBySymbol } from '../domain/breakdown.js';
import { BUCKET_LABELS, TAX_FUNNEL_LABELS } from '../domain/lifeStage.js';
import { formatBps } from '../domain/percent.js';
import {
  WeightedLines,
  draftProblem,
  toDraftLines,
  toModelLines,
  type DraftLine,
} from '../components/WeightedLines.js';
import { BUCKETS, TAX_FUNNELS } from '../domain/types.js';
import type { ModelPortfolio, TaxFunnel, Ticker } from '../domain/types.js';

interface Props {
  models: readonly ModelPortfolio[];
  tickers: readonly Ticker[];
  onSave: (model: ModelPortfolio) => Promise<ModelPortfolio>;
  onDelete: (id: string) => Promise<void>;
  onAddTicker: (ticker: Ticker) => Promise<Ticker>;
}

/**
 * US-14 model portfolios. A model is a set of tickers and weights. RIG's
 * vendors change theirs quarterly, so they live here as data; a custom model
 * is just another one. On the profile, the advisor fills each account from a
 * model (10/26), and each ticker's default bucket decides where its money
 * counts, so a model can span Now, Soon, and Later.
 */
export function Models({ models, tickers, onSave, onDelete, onAddTicker }: Props) {
  /** The unsaved new model, held in state so the editor is not reset on every render. */
  const [blank, setBlank] = useState<ModelPortfolio | null>(null);

  return (
    <div>
      <header className="screen-header">
        <h2>Model portfolios</h2>
        <p className="muted">
          Administrator screen. {models.length} model{models.length === 1 ? '' : 's'}. Each one is
          a set of tickers and weights that fills an account.
        </p>
      </header>

      <Callout tone="info" title="Placeholder models">
        RIG has not sent its vendor models yet. These are built from the placeholder tickers so the
        profile has something to pick. Edit or replace them freely.
      </Callout>

      <div className="button-row">
        <button type="button" className="primary" disabled={blank !== null} onClick={() => setBlank(newModel())}>
          New model
        </button>
      </div>

      {blank !== null && (
        <ModelEditor
          model={blank}
          tickers={tickers}
          onAddTicker={onAddTicker}
          onSave={async (model) => {
            await onSave(model);
            setBlank(null);
          }}
          onDelete={async () => setBlank(null)}
          startOpen
        />
      )}

      <section className="card">
        {models.length === 0 && <p className="empty">None yet.</p>}
        {models.map((model) => (
          <ModelEditor
            key={model.id}
            model={model}
            tickers={tickers}
            onAddTicker={onAddTicker}
            onSave={async (next) => {
              await onSave(next);
            }}
            onDelete={() => onDelete(model.id)}
          />
        ))}
      </section>
    </div>
  );
}

function ModelEditor({
  model,
  tickers,
  onSave,
  onDelete,
  onAddTicker,
  startOpen = false,
}: {
  model: ModelPortfolio;
  tickers: readonly Ticker[];
  onSave: (model: ModelPortfolio) => Promise<void>;
  onAddTicker: (ticker: Ticker) => Promise<Ticker>;
  onDelete: () => Promise<void>;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [name, setName] = useState(model.name);
  const [taxFunnel, setTaxFunnel] = useState<TaxFunnel | null>(model.taxFunnel);
  const [lines, setLines] = useState<DraftLine[]>(() => toDraftLines(model.lines));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A save elsewhere (or the server's normalised copy) resets the editor.
  useEffect(() => {
    setName(model.name);
    setTaxFunnel(model.taxFunnel);
    setLines(toDraftLines(model.lines));
  }, [model]);

  const isNew = model.id === '';

  const problem =
    name.trim() === ''
      ? 'Give the model a name.'
      : lines.length === 0
        ? 'Add at least one ticker.'
        : draftProblem(lines);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave({
        id: model.id,
        name: name.trim(),
        taxFunnel,
        lines: toModelLines(lines),
      });
      if (!isNew) setOpen(false);
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!isNew && !window.confirm(`Delete "${model.name}"? Accounts using it keep their money, with no model.`)) {
      return;
    }
    setBusy(true);
    try {
      await onDelete();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
      setBusy(false);
    }
  }

  if (!open) {
    const mix = modelBucketMix(model, tickersBySymbol(tickers));
    return (
      <div className="model model-closed">
        <div className="model-summary">
          <strong>{model.name}</strong>
          {model.taxFunnel !== null && <span className="tag">{TAX_FUNNEL_LABELS[model.taxFunnel]}</span>}
          <span className="muted">
            {model.lines.map((l) => `${l.tickerSymbol} ${formatBps(l.weightBps)}`).join(' · ')}
          </span>
          <span className="muted">
            {BUCKETS.filter((b) => mix[b] > 0)
              .map((b) => `${BUCKET_LABELS[b]} ${formatBps(mix[b])}`)
              .join(' · ')}
          </span>
        </div>
        <button type="button" onClick={() => setOpen(true)}>
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="model">
      <div className="model-head">
        <div className="field">
          <label htmlFor={`model-name-${model.id}`}>Name</label>
          <input
            id={`model-name-${model.id}`}
            type="text"
            value={name}
            placeholder="Vendor and model name"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`model-funnel-${model.id}`}>For tax funnel</label>
          <select
            id={`model-funnel-${model.id}`}
            value={taxFunnel ?? ''}
            onChange={(event) =>
              setTaxFunnel(event.target.value === '' ? null : (event.target.value as TaxFunnel))
            }
          >
            <option value="">Any</option>
            {TAX_FUNNELS.map((f) => (
              <option key={f} value={f}>
                {TAX_FUNNEL_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <WeightedLines
        lines={lines}
        tickers={tickers}
        onChange={setLines}
        onAddTicker={onAddTicker}
      />

      <div className="button-row">
        <button type="button" className="primary" disabled={problem !== null || busy} onClick={() => void save()}>
          {busy ? 'Saving…' : isNew ? 'Create model' : 'Save model'}
        </button>
        {!isNew && (
          <button type="button" onClick={() => setOpen(false)} disabled={busy}>
            Close
          </button>
        )}
        <button type="button" className="danger" onClick={() => void remove()} disabled={busy}>
          {isNew ? 'Cancel' : 'Delete'}
        </button>
        {problem !== null && <span className="muted">{problem}</span>}
      </div>

      {error !== null && <p className="field-error">{error}</p>}
    </div>
  );
}
