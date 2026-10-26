import { useEffect, useState } from 'react';

import { Callout } from '../components/Callout.js';
import { About } from '../components/Help.js';
import { NewTickerFields } from '../components/NewTickerFields.js';
import { typedMoney } from '../components/typedMoney.js';
import { ASSET_CLASS_LABELS, BUCKET_LABELS } from '../domain/lifeStage.js';
import { formatDay } from '../domain/dates.js';
import { centsToInput, parseCents } from '../domain/money.js';
import { isValidSymbol, normalizeSymbol } from '../domain/tickers.js';
import { ASSET_CLASSES, BUCKETS } from '../domain/types.js';
import type { AssetClass, BucketDefinition, BucketType, Ticker } from '../domain/types.js';

interface Props {
  tickers: readonly Ticker[];
  definitions: readonly BucketDefinition[];
  onSaveTicker: (ticker: Ticker) => Promise<void>;
  /** Adds a symbol to the universe (US-24). Rejects with the reason when it cannot. */
  onAddTicker: (ticker: Ticker) => Promise<Ticker>;
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
  onAddTicker,
  onSaveDefinition,
}: Props) {
  const [filter, setFilter] = useState('');
  const [newSymbolText, setNewSymbolText] = useState('');
  const newSymbol = normalizeSymbol(newSymbolText);
  const alreadyListed = tickers.some((t) => t.symbol === newSymbol);
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

      <Callout tone="info" title="Placeholder investment universe">
        RIG has not sent the Common Investments list yet. These symbols come from the sample seed
        data and are not the firm&rsquo;s approved set (US-06).
      </Callout>

      <section className="card">
        <h3>Default bucket by ticker</h3>
        <p className="muted">Each symbol&rsquo;s usual bucket, asset class, and price per share.</p>
        <About>
          <p>
            A model that uses a symbol in a different bucket is flagged on the Models screen, not
            blocked. A symbol typed on a model or a manual bucket that is not listed here can be
            added from there too. Prices are typed here until RIG picks a price provider.
          </p>
        </About>

        <div className="add-ticker">
          <div className="field">
            <label htmlFor="new-ticker">Add a symbol</label>
            <input
              id="new-ticker"
              type="text"
              className="symbol-input"
              autoComplete="off"
              spellCheck={false}
              value={newSymbolText}
              placeholder="SCHD"
              aria-invalid={newSymbol !== '' && !isValidSymbol(newSymbol)}
              onChange={(event) => setNewSymbolText(event.target.value)}
            />
          </div>
          {newSymbol !== '' && alreadyListed && (
            <span className="muted">
              <code>{newSymbol}</code> is already in the list.
            </span>
          )}
          {newSymbol !== '' && !alreadyListed && !isValidSymbol(newSymbol) && (
            <span className="field-error">Letters, digits, dots, and dashes, up to 10.</span>
          )}
          {newSymbol !== '' && !alreadyListed && isValidSymbol(newSymbol) && (
            <NewTickerFields
              key={newSymbol}
              symbol={newSymbol}
              suggestedBucket="LATER"
              onAdd={onAddTicker}
              onAdded={() => setNewSymbolText('')}
            />
          )}
        </div>

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
              <th scope="col">Price per share</th>
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
                <td>
                  <TickerPriceEditor
                    ticker={ticker}
                    saving={savingSymbol === ticker.symbol}
                    onSave={(priceCents) => updateTicker(ticker, { priceCents })}
                  />
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
        <p className="muted">The wording shown to the advisor when assigning a holding.</p>

        {definitions.map((definition) => (
          <BucketDefinitionEditor
            key={definition.bucket}
            definition={definition}
            onSave={onSaveDefinition}
          />
        ))}
      </section>

      <About title="Why there are no asset-class rules">
        <p>
          A rule mapping a whole asset class to a bucket was planned but not built; the per-ticker
          defaults above cover the same ground for a universe this size.
        </p>
      </About>
    </div>
  );
}

/**
 * US-21: the price shares are worked out at. Typed here until RIG picks a
 * price provider; the date shows how old it is.
 */
function TickerPriceEditor({
  ticker,
  saving,
  onSave,
}: {
  ticker: Ticker;
  saving: boolean;
  onSave: (priceCents: Ticker['priceCents']) => Promise<void>;
}) {
  const [draft, setDraft] = useState(ticker.priceCents === null ? '' : centsToInput(ticker.priceCents));
  const parsed = draft.trim() === '' ? null : parseCents(draft);
  const invalid = draft.trim() !== '' && (parsed === null || parsed <= 0);
  const dirty = parsed !== ticker.priceCents;

  useEffect(() => {
    setDraft(ticker.priceCents === null ? '' : centsToInput(ticker.priceCents));
  }, [ticker.priceCents]);

  return (
    <div className="inline-action">
      <div className="money-input">
        <span aria-hidden="true">$</span>
        <input
          type="text"
          inputMode="decimal"
          aria-label={`${ticker.symbol} price per share`}
          aria-invalid={invalid}
          placeholder="Not set"
          value={draft}
          onChange={(event) => setDraft(typedMoney(event.target))}
        />
      </div>
      <button type="button" disabled={!dirty || invalid || saving} onClick={() => void onSave(parsed)}>
        Save price
      </button>
      {ticker.priceAsOf !== null && !dirty && <span className="muted">as of {formatDay(ticker.priceAsOf)}</span>}
      {invalid && <span className="field-error">A price above $0, like 123.45</span>}
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
