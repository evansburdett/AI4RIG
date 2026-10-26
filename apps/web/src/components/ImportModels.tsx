import { useRef, useState } from 'react';

import { modelBucketMix } from '../domain/breakdown.js';
import { readModelsSheet, type ModelsFile } from '../domain/importModels.js';
import { BUCKET_LABELS } from '../domain/lifeStage.js';
import { formatBps } from '../domain/percent.js';
import { CASH_SYMBOL, TICKER_GUESSES } from '../domain/tickerGuesses.js';
import { BUCKETS } from '../domain/types.js';
import type { ImportRequest, ImportResult, ModelPortfolio, Ticker } from '../domain/types.js';
import { readFirstSheet } from '../spreadsheet.js';

import { Callout } from './Callout.js';
import { NewTickerChoices, type NewTickerChoice } from './NewTickerChoices.js';

interface Props {
  models: readonly ModelPortfolio[];
  tickers: readonly Ticker[];
  onImport: (request: ImportRequest) => Promise<ImportResult>;
}

interface Preview {
  fileName: string;
  file: ModelsFile;
  /** Model names to import, lower-cased. All of them to start with. */
  included: Set<string>;
  choices: NewTickerChoice[];
}

/**
 * Importing RIG's model spreadsheet (10/26). The file is read and checked
 * here, and the advisor sees every model and every new ticker, with an asset
 * class and bucket suggested for each, before anything is saved. Saving is
 * all or nothing. A model with the same name as one already here is replaced,
 * keeping the accounts that use it linked, so the next quarter's file can be
 * imported over this one.
 */
export function ImportModels({ models, tickers, onImport }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const known = new Set(tickers.map((t) => t.symbol));
  const existing = new Map(models.map((m) => [m.name.toLowerCase(), m]));

  async function open(file: File) {
    setError(null);
    setDone(null);
    try {
      const read = readModelsSheet(await readFirstSheet(file));
      const symbols = [...new Set(read.models.flatMap((m) => m.lines.map((l) => l.tickerSymbol)))];
      setPreview({
        fileName: file.name,
        file: read,
        included: new Set(read.models.map((m) => m.name.toLowerCase())),
        choices: symbols.filter((symbol) => !known.has(symbol)).map(suggest),
      });
    } catch (caught: unknown) {
      setPreview(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function save(current: Preview) {
    const chosen = current.file.models.filter((m) => current.included.has(m.name.toLowerCase()));
    const used = new Set(chosen.flatMap((m) => m.lines.map((l) => l.tickerSymbol)));
    setBusy(true);
    setError(null);
    try {
      await onImport({
        newTickers: current.choices
          .filter((choice) => used.has(choice.symbol))
          .map((choice) => ({
            symbol: choice.symbol,
            name: choice.name,
            assetClass: choice.assetClass,
            defaultBucket: choice.bucket,
            // Cash is always worth a dollar, so its shares can be worked out.
            priceCents: choice.symbol === CASH_SYMBOL ? 100 : null,
            priceAsOf: null,
          })),
        prices: [],
        models: chosen.map((m) => ({
          id: '',
          name: m.name,
          // A replaced model keeps the funnel RIG gave it; the file has none.
          taxFunnel: existing.get(m.name.toLowerCase())?.taxFunnel ?? null,
          lines: m.lines,
        })),
      });
      const added = current.choices.filter((choice) => used.has(choice.symbol)).length;
      setDone(
        `Imported ${chosen.length} model${chosen.length === 1 ? '' : 's'}` +
          (added > 0 ? ` and added ${added} ticker${added === 1 ? '' : 's'}` : '') +
          ` from ${current.fileName}.`,
      );
      setPreview(null);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  function toggle(name: string) {
    if (preview === null) return;
    const included = new Set(preview.included);
    if (included.has(name)) included.delete(name);
    else included.add(name);
    setPreview({ ...preview, included });
  }

  // Each model's buckets, from RIG's mapping or the choice being made here.
  const bucketOf = new Map<string, Ticker>([
    ...tickers.map((t): [string, Ticker] => [t.symbol, t]),
    ...(preview?.choices ?? []).map((c): [string, Ticker] => [
      c.symbol,
      { symbol: c.symbol, name: c.name, assetClass: c.assetClass, defaultBucket: c.bucket, priceCents: null, priceAsOf: null },
    ]),
  ]);

  return (
    <section className="card import">
      <div className="card-head">
        <h3>Import models from Excel</h3>
        <button type="button" disabled={busy} onClick={() => input.current?.click()}>
          {preview === null ? 'Choose file…' : 'Choose another file…'}
        </button>
        <input
          ref={input}
          type="file"
          accept=".xlsx"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file !== undefined) void open(file);
          }}
        />
      </div>
      <p className="muted">
        One row with a model&rsquo;s name, then a row for each fund with its symbol and weight. A
        model with the same name as one here replaces it.
      </p>

      {done !== null && (
        <Callout tone="info" title="Imported">
          {done} Edit any of them below, or change a ticker&rsquo;s bucket on the Tickers screen.
        </Callout>
      )}
      {error !== null && (
        <Callout tone="error" title="Could not import">
          {error}
        </Callout>
      )}

      {preview !== null && (
        <>
          {preview.file.problems.length > 0 && (
            <Callout tone="error" title={`Fix ${preview.fileName} first`}>
              <ul>
                {preview.file.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </Callout>
          )}

          <table className="import-table">
            <caption>
              {preview.fileName}: {preview.file.models.length} model{preview.file.models.length === 1 ? '' : 's'}
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Import</span>
                </th>
                <th scope="col">Model</th>
                <th scope="col" className="amount">
                  Funds
                </th>
                <th scope="col">Buckets</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {preview.file.models.map((model) => {
                const key = model.name.toLowerCase();
                const mix = modelBucketMix({ id: '', name: model.name, taxFunnel: null, lines: model.lines }, bucketOf);
                return (
                  <tr key={key}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Import ${model.name}`}
                        checked={preview.included.has(key)}
                        onChange={() => toggle(key)}
                      />
                    </td>
                    <th scope="row">{model.name}</th>
                    <td className="amount">{model.lines.length}</td>
                    <td className="muted">
                      {BUCKETS.filter((b) => mix[b] > 0)
                        .map((b) => `${BUCKET_LABELS[b]} ${formatBps(mix[b])}`)
                        .join(' · ')}
                    </td>
                    <td>
                      {existing.has(key) && <span className="tag">replaces existing</span>}
                      {model.notes.map((note) => (
                        <span key={note} className="import-note">
                          {note}
                        </span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <NewTickerChoices
            choices={preview.choices}
            onChange={(symbol, changes) =>
              setPreview({
                ...preview,
                choices: preview.choices.map((c) => (c.symbol === symbol ? { ...c, ...changes } : c)),
              })
            }
          />

          <div className="button-row">
            <button
              type="button"
              className="primary"
              disabled={busy || preview.file.problems.length > 0 || preview.included.size === 0}
              onClick={() => void save(preview)}
            >
              {busy ? 'Importing…' : `Import ${preview.included.size} model${preview.included.size === 1 ? '' : 's'}`}
            </button>
            <button type="button" disabled={busy} onClick={() => setPreview(null)}>
              Cancel
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** A new symbol's suggestion: our researched guess, or equity in Later for one we have never seen. */
function suggest(symbol: string): NewTickerChoice {
  const guess = TICKER_GUESSES[symbol];
  return guess === undefined
    ? { symbol, name: null, assetClass: 'EQUITY', bucket: 'LATER', source: 'No guess: check it' }
    : { symbol, name: guess.name, assetClass: guess.assetClass, bucket: guess.bucket, source: 'Fund research' };
}
