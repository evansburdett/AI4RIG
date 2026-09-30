import { useEffect, useState } from 'react';

import { ApiError } from '../api.js';
import { Callout } from '../components/Callout.js';
import { newModel } from '../domain/factory.js';
import { BUCKET_LABELS, TAX_FUNNEL_LABELS } from '../domain/lifeStage.js';
import { formatBps } from '../domain/percent.js';
import {
  WeightedLines,
  draftProblem,
  toDraftLines,
  toSleeveLines,
  type DraftLine,
} from '../components/WeightedLines.js';
import { BUCKETS, TAX_FUNNELS } from '../domain/types.js';
import type { BucketType, ModelPortfolio, TaxFunnel, Ticker } from '../domain/types.js';

interface Props {
  models: readonly ModelPortfolio[];
  tickers: readonly Ticker[];
  onSave: (model: ModelPortfolio) => Promise<ModelPortfolio>;
  onDelete: (id: string) => Promise<void>;
}

/**
 * US-14 model portfolios. A model is a set of tickers and weights for money in
 * one bucket. RIG's vendors change theirs quarterly, so they live here as data;
 * a custom model is just another one. On the profile, the advisor picks a model
 * for each account's Now, Soon, and Later money.
 */
export function Models({ models, tickers, onSave, onDelete }: Props) {
  /** The unsaved new model, held in state so the editor is not reset on every render. */
  const [blank, setBlank] = useState<ModelPortfolio | null>(null);

  return (
    <div>
      <header className="screen-header">
        <h2>Model portfolios</h2>
        <p className="muted">
          Administrator screen. {models.length} model{models.length === 1 ? '' : 's'}. Each one is
          a set of tickers and weights for one bucket.
        </p>
      </header>

      <Callout tone="warning" title="Placeholder models">
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
          onSave={async (model) => {
            await onSave(model);
            setBlank(null);
          }}
          onDelete={async () => setBlank(null)}
          startOpen
        />
      )}

      {BUCKETS.map((bucket) => {
        const inBucket = models.filter((m) => m.bucket === bucket);
        return (
          <section className="card" key={bucket}>
            <h3>
              <span className={`swatch bucket-${bucket.toLowerCase()}`} aria-hidden="true" />{' '}
              {BUCKET_LABELS[bucket]} models
            </h3>
            {inBucket.length === 0 && <p className="empty">None yet.</p>}
            {inBucket.map((model) => (
              <ModelEditor
                key={model.id}
                model={model}
                tickers={tickers}
                onSave={async (next) => {
                  await onSave(next);
                }}
                onDelete={() => onDelete(model.id)}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function ModelEditor({
  model,
  tickers,
  onSave,
  onDelete,
  startOpen = false,
}: {
  model: ModelPortfolio;
  tickers: readonly Ticker[];
  onSave: (model: ModelPortfolio) => Promise<void>;
  onDelete: () => Promise<void>;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [name, setName] = useState(model.name);
  const [bucket, setBucket] = useState<BucketType>(model.bucket);
  const [taxFunnel, setTaxFunnel] = useState<TaxFunnel | null>(model.taxFunnel);
  const [lines, setLines] = useState<DraftLine[]>(() => toDraftLines(model.lines));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A save elsewhere (or the server's normalised copy) resets the editor.
  useEffect(() => {
    setName(model.name);
    setBucket(model.bucket);
    setTaxFunnel(model.taxFunnel);
    setLines(toDraftLines(model.lines));
  }, [model]);

  const isNew = model.id === '';

  // A reusable model must add up to exactly 100%; a manual bucket need not,
  // which is the only difference between the two callers of WeightedLines.
  const problem =
    name.trim() === ''
      ? 'Give the model a name.'
      : lines.length === 0
        ? 'Add at least one ticker.'
        : draftProblem(lines, { requireFull: true });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave({
        id: model.id,
        name: name.trim(),
        bucket,
        taxFunnel,
        lines: toSleeveLines(lines),
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
    return (
      <div className="model model-closed">
        <div className="model-summary">
          <strong>{model.name}</strong>
          {model.taxFunnel !== null && <span className="tag">{TAX_FUNNEL_LABELS[model.taxFunnel]}</span>}
          <span className="muted">
            {model.lines.map((l) => `${l.tickerSymbol} ${formatBps(l.weightBps)}`).join(' · ')}
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
          <label htmlFor={`model-bucket-${model.id}`}>Bucket</label>
          <select
            id={`model-bucket-${model.id}`}
            value={bucket}
            onChange={(event) => setBucket(event.target.value as BucketType)}
          >
            {BUCKETS.map((b) => (
              <option key={b} value={b}>
                {BUCKET_LABELS[b]}
              </option>
            ))}
          </select>
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

      <WeightedLines lines={lines} tickers={tickers} bucket={bucket} onChange={setLines} />

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
