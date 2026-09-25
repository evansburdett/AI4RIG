import { useEffect, useState } from 'react';

import { ApiError } from '../api.js';
import { Callout } from '../components/Callout.js';
import { newModel } from '../domain/factory.js';
import { BUCKET_LABELS, TAX_FUNNEL_LABELS } from '../domain/lifeStage.js';
import { bpsToPercentInput, formatBps, parsePercentToBps, WHOLE_BPS } from '../domain/percent.js';
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

/** A line being edited: the weight stays as typed text until it parses. */
interface DraftLine {
  readonly key: number;
  readonly tickerSymbol: string;
  readonly percentText: string;
}

let lineKey = 0;

function toDraftLines(model: ModelPortfolio): DraftLine[] {
  return model.lines.map((line) => ({
    key: ++lineKey,
    tickerSymbol: line.tickerSymbol,
    percentText: bpsToPercentInput(line.weightBps),
  }));
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
  const [lines, setLines] = useState<DraftLine[]>(() => toDraftLines(model));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A save elsewhere (or the server's normalised copy) resets the editor.
  useEffect(() => {
    setName(model.name);
    setBucket(model.bucket);
    setTaxFunnel(model.taxFunnel);
    setLines(toDraftLines(model));
  }, [model]);

  const isNew = model.id === '';
  const weights = lines.map((l) => parsePercentToBps(l.percentText));
  const totalBps = weights.reduce<number>((sum, w) => sum + (w ?? 0), 0);
  const unreadable = weights.some((w) => w === null || w === 0);
  const blankTicker = lines.some((l) => l.tickerSymbol === '');
  const duplicate = new Set(lines.map((l) => l.tickerSymbol)).size !== lines.length;
  const tickerBySymbol = new Map(tickers.map((t) => [t.symbol, t]));

  const problem =
    name.trim() === ''
      ? 'Give the model a name.'
      : lines.length === 0
        ? 'Add at least one ticker.'
        : blankTicker
          ? 'Choose a ticker on every line.'
          : duplicate
            ? 'Each ticker can appear once.'
            : unreadable
              ? 'Weights are percentages above 0 with up to two decimals, like 12.5.'
              : totalBps !== WHOLE_BPS
                ? `Weights add up to ${formatBps(totalBps)}, not 100%.`
                : null;

  function patchLine(key: number, changes: Partial<DraftLine>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...changes } : l)));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave({
        id: model.id,
        name: name.trim(),
        bucket,
        taxFunnel,
        lines: lines.map((l, i) => ({ tickerSymbol: l.tickerSymbol, weightBps: weights[i] ?? 0 })),
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

      <table className="model-lines">
        <thead>
          <tr>
            <th scope="col">Ticker</th>
            <th scope="col">Weight</th>
            <th scope="col">
              <span className="visually-hidden">Notes</span>
            </th>
            <th scope="col" className="row-actions">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const ticker = tickerBySymbol.get(line.tickerSymbol);
            return (
              <tr key={line.key}>
                <td>
                  <select
                    aria-label="Ticker"
                    value={line.tickerSymbol}
                    onChange={(event) => patchLine(line.key, { tickerSymbol: event.target.value })}
                  >
                    <option value="">Choose…</option>
                    {tickers.map((t) => (
                      <option key={t.symbol} value={t.symbol}>
                        {t.symbol}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <span className="percent-input">
                    <input
                      aria-label="Weight"
                      type="text"
                      inputMode="decimal"
                      value={line.percentText}
                      aria-invalid={parsePercentToBps(line.percentText) === null}
                      onChange={(event) => patchLine(line.key, { percentText: event.target.value })}
                    />
                    <span aria-hidden="true">%</span>
                  </span>
                </td>
                <td>
                  {ticker !== undefined && ticker.defaultBucket !== bucket && (
                    <span className="tag" title="RIG's ticker mapping puts this symbol in another bucket">
                      usually {BUCKET_LABELS[ticker.defaultBucket]}
                    </span>
                  )}
                </td>
                <td className="row-actions">
                  <button
                    type="button"
                    className="link"
                    onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td className={totalBps === WHOLE_BPS ? '' : 'field-error'}>{formatBps(totalBps)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>

      <div className="button-row">
        <button
          type="button"
          onClick={() =>
            setLines((current) => [...current, { key: ++lineKey, tickerSymbol: '', percentText: '' }])
          }
        >
          Add ticker
        </button>
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
