import { useState } from 'react';

import { Callout } from '../components/Callout.js';
import { ASSET_CLASS_LABELS, BUCKET_LABELS } from '../domain/lifeStage.js';
import { ASSET_CLASSES, BUCKETS } from '../domain/types.js';
import type { AssetClass, BucketDefinition, BucketType, Ticker } from '../domain/types.js';

interface Props {
  tickers: readonly Ticker[];
  definitions: readonly BucketDefinition[];
  onSaveTicker: (ticker: Ticker) => Promise<void>;
  onSaveDefinition: (definition: BucketDefinition) => Promise<void>;
}

/**
 * US-08 — ticker defaults and bucket definitions, both stored as data so RIG can
 * change them without a developer. Changing a default does not move holdings
 * already placed; a holding carries the bucket the advisor chose (decision D1).
 * Each row saves on its own.
 */
export function BucketAssignments({
  tickers,
  definitions,
  onSaveTicker,
  onSaveDefinition,
}: Props) {
  const [filter, setFilter] = useState('');
  const [savingSymbol, setSavingSymbol] = useState<string | null>(null);

  const query = filter.trim().toUpperCase();
  const visible = query === '' ? tickers : tickers.filter((t) => t.symbol.includes(query));

  async function updateTicker(ticker: Ticker, changes: Partial<Ticker>) {
    setSavingSymbol(ticker.symbol);
    try {
      await onSaveTicker({ ...ticker, ...changes });
    } finally {
      setSavingSymbol(null);
    }
  }

  return (
    <div>
      <header className="screen-header">
        <h2>Ticker universe and bucket rules</h2>
        <p className="muted">
          Administrator screen. {tickers.length} symbols in the approved universe.
        </p>
      </header>

      <Callout tone="warning" title="Placeholder investment universe">
        RIG has not sent the Common Investments list yet. These symbols come from the sample seed
        data and are not the firm&rsquo;s approved set (US-06).
      </Callout>

      <section className="card">
        <h3>Default bucket by ticker</h3>
        <p className="muted">
          Which bucket each symbol normally belongs in. A model that uses a symbol in a different
          bucket is flagged on the Models screen, not blocked.
        </p>

        <div className="field">
          <label htmlFor="ticker-filter">Filter by symbol</label>
          <input
            id="ticker-filter"
            type="search"
            value={filter}
            placeholder="VTI"
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>

        <table className="tickers">
          <thead>
            <tr>
              <th scope="col">Symbol</th>
              <th scope="col">Asset class</th>
              <th scope="col">Default bucket</th>
              <th scope="col">
                <span className="visually-hidden">Save state</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((ticker) => (
              <tr key={ticker.symbol}>
                <th scope="row">
                  <code>{ticker.symbol}</code>
                </th>
                <td>
                  <select
                    aria-label={`${ticker.symbol} asset class`}
                    value={ticker.assetClass}
                    onChange={(event) =>
                      void updateTicker(ticker, {
                        assetClass: event.target.value as AssetClass,
                      })
                    }
                  >
                    {ASSET_CLASSES.map((assetClass) => (
                      <option key={assetClass} value={assetClass}>
                        {ASSET_CLASS_LABELS[assetClass]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    aria-label={`${ticker.symbol} default bucket`}
                    value={ticker.defaultBucket}
                    onChange={(event) =>
                      void updateTicker(ticker, {
                        defaultBucket: event.target.value as BucketType,
                      })
                    }
                  >
                    {BUCKETS.map((bucket) => (
                      <option key={bucket} value={bucket}>
                        {BUCKET_LABELS[bucket]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="muted">{savingSymbol === ticker.symbol ? 'Saving…' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {visible.length === 0 && <p className="muted">No symbol matches “{filter}”.</p>}
      </section>

      <section className="card">
        <h3>What each bucket is for</h3>
        <p className="muted">Editable wording, shown to the advisor when assigning a holding.</p>

        {definitions.map((definition) => (
          <BucketDefinitionEditor
            key={definition.bucket}
            definition={definition}
            onSave={onSaveDefinition}
          />
        ))}
      </section>

      <Callout tone="info" title="Asset-class rules not built">
        <code>ClassificationRule</code> maps a whole asset class to a bucket. The table does not
        exist yet; per-ticker defaults cover the same ground for a universe this size.
      </Callout>
    </div>
  );
}

function BucketDefinitionEditor({
  definition,
  onSave,
}: {
  definition: BucketDefinition;
  onSave: (definition: BucketDefinition) => Promise<void>;
}) {
  const [draft, setDraft] = useState(definition);
  const [saving, setSaving] = useState(false);

  const dirty =
    draft.label !== definition.label ||
    draft.horizonMonths !== definition.horizonMonths ||
    draft.purposeText !== definition.purposeText;

  return (
    <div className="definition">
      <div className="definition-head">
        <span className={`swatch bucket-${definition.bucket.toLowerCase()}`} aria-hidden="true" />
        <input
          aria-label={`${definition.bucket} label`}
          className="definition-label"
          value={draft.label}
          onChange={(event) => setDraft({ ...draft, label: event.target.value })}
        />
        <label htmlFor={`horizon-${definition.bucket}`}>Horizon (months)</label>
        <input
          id={`horizon-${definition.bucket}`}
          type="number"
          min={0}
          value={draft.horizonMonths}
          onChange={(event) =>
            setDraft({ ...draft, horizonMonths: Number(event.target.value) })
          }
        />
      </div>

      <textarea
        aria-label={`${definition.bucket} purpose`}
        rows={3}
        value={draft.purposeText}
        onChange={(event) => setDraft({ ...draft, purposeText: event.target.value })}
      />

      <div className="definition-actions">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => {
            setSaving(true);
            void onSave(draft).finally(() => setSaving(false));
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {dirty && !saving && <span className="muted">Unsaved changes</span>}
      </div>
    </div>
  );
}
