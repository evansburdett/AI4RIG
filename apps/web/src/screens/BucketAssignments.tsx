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
 * US-08 — Editable Bucket Assignments.
 *
 * Two things are editable here, and both are data rather than code, which is
 * the point of the story: RIG can change how the model behaves without a
 * developer. A ticker's default bucket is what the engine proposes for a new
 * holding. A bucket definition is the language the firm uses to describe what
 * that bucket is for.
 *
 * Changing a default does not move money that is already placed. A holding
 * carries its own `assignedBucket`, set when the advisor put it there
 * (decision D1), and rewriting history underneath an advisor who had already
 * made a deliberate choice is not something an administrator should be able to
 * do by editing a dropdown. The notice at the top says so on the screen.
 *
 * Each row saves on its own. A page-wide Save would mean an administrator
 * reclassifying one symbol has to think about what else they touched.
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
    <div className="screen">
      <header className="screen-header">
        <h2>Ticker universe and bucket rules</h2>
        <p className="muted">
          Administrator screen. {tickers.length} symbols in the approved universe.
        </p>
      </header>

      <Callout tone="warning" title="This is a placeholder investment universe">
        RIG has not sent the Common Investments list yet. The ten symbols below exist so the screen
        has something to render and are not the firm&rsquo;s approved set. Editing them here changes
        nothing outside your browser session until the ticker endpoint lands (US-06).
      </Callout>

      <section className="card">
        <h3>Default bucket by ticker</h3>
        <p className="muted">
          The default is what the engine proposes for a <em>new</em> holding. Holdings already
          placed keep the bucket the advisor chose for them — changing a default here does not
          reach back and move a client&rsquo;s money.
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
        <p className="muted">
          The firm&rsquo;s own wording, editable so the model can be adjusted as RIG&rsquo;s strategy
          evolves. This text is what an advisor reads when deciding where something belongs.
        </p>

        {definitions.map((definition) => (
          <BucketDefinitionEditor
            key={definition.bucket}
            definition={definition}
            onSave={onSaveDefinition}
          />
        ))}
      </section>

      <Callout tone="blocked" title="Classification rules by asset class are not built yet">
        The conceptual model has a <code>ClassificationRule</code> that maps a whole asset class to
        a bucket, so reclassifying every bond position is one edit rather than forty. It is not on
        this screen because the rule table does not exist in the database yet. Per-ticker defaults
        above cover the same ground for a universe this size.
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
