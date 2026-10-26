import { useRef, useState, type RefObject } from 'react';

import { cashForFee, holdingsToAccount, readHoldingsSheet, type HoldingsFile } from '../domain/importHoldings.js';
import { formatCents } from '../domain/money.js';
import { TICKER_GUESSES } from '../domain/tickerGuesses.js';
import type { Account, ImportRequest, ImportResult, Ticker } from '../domain/types.js';
import { readFirstSheet } from '../spreadsheet.js';

import { BucketTag } from './BucketTag.js';
import { Callout } from './Callout.js';
import { NewTickerChoices, type NewTickerChoice } from './NewTickerChoices.js';
import { formatShares } from './shares.js';

interface Props {
  account: Account;
  tickers: readonly Ticker[];
  /** This account's advisory fee if its balance were this, under RIG's tiers. */
  feeFor: (balanceCents: number) => number;
  onImport: (request: ImportRequest) => Promise<ImportResult>;
  /** The account with its imported funds, for the working copy. Saved with the case. */
  onApply: (account: Account) => void;
}

interface Preview {
  fileName: string;
  file: HoldingsFile;
  /** File rows to import. Every row that can be, to start with. */
  included: Set<number>;
  choices: NewTickerChoice[];
  setBalance: boolean;
  updatePrices: boolean;
  takeFeeFromCash: boolean;
}

/**
 * Importing what an account holds from a custodian export (10/26): each
 * holding becomes one of the account's funds, at its market value, with the
 * exact shares held. The advisor checks every row first: rows that do not
 * add up are flagged, symbols new to the universe get an asset class and
 * bucket suggested from the custodian's own class, and the balance, prices,
 * and fee cash are each the advisor's choice. The funds go into the working
 * copy of the case like any other edit, so Save case keeps them.
 */
export function ImportHoldings({ account, tickers, feeFor, onImport, onApply }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const bySymbol = new Map(tickers.map((t) => [t.symbol, t]));

  async function open(file: File) {
    setError(null);
    setDone(null);
    try {
      const read = readHoldingsSheet(await readFirstSheet(file));
      const usable = read.holdings.filter((h) => h.problem === null);
      const fresh = new Map<string, NewTickerChoice>();
      for (const holding of usable) {
        if (bySymbol.has(holding.symbol) || fresh.has(holding.symbol)) continue;
        const guess = TICKER_GUESSES[holding.symbol];
        fresh.set(
          holding.symbol,
          guess === undefined
            ? {
                symbol: holding.symbol,
                name: holding.description === '' ? null : holding.description,
                assetClass: holding.assetClass,
                bucket: holding.bucket,
                source: holding.custodianClass === '' ? 'No class in the file: check it' : `"${holding.custodianClass}"`,
              }
            : { symbol: holding.symbol, name: guess.name ?? holding.description, assetClass: guess.assetClass, bucket: guess.bucket, source: 'Fund research' },
        );
      }
      setPreview({
        fileName: file.name,
        file: read,
        included: new Set(usable.map((h) => h.row)),
        choices: [...fresh.values()],
        setBalance: true,
        updatePrices: true,
        takeFeeFromCash: true,
      });
    } catch (caught: unknown) {
      setPreview(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  if (preview === null) {
    return (
      <div className="import-holdings">
        <button type="button" onClick={() => input.current?.click()}>
          Import holdings from Excel…
        </button>
        <FileInput input={input} onFile={(file) => void open(file)} />
        {done !== null && <span className="muted">{done}</span>}
        {error !== null && <p className="field-error">{error}</p>}
      </div>
    );
  }

  const chosen = preview.file.holdings.filter((h) => preview.included.has(h.row));
  const totalCents = chosen.reduce((sum, h) => sum + h.marketValueCents, 0);
  const balanceCents = preview.setBalance ? totalCents : account.balanceCents;
  const feeCents = feeFor(balanceCents);
  const feeSource = cashForFee(chosen, feeCents);
  const newSymbols = new Set(preview.choices.map((c) => c.symbol));
  const priced = chosen.filter((h) => h.priceCents !== null && !newSymbols.has(h.symbol) && bySymbol.get(h.symbol)?.priceCents !== h.priceCents);

  function patch(changes: Partial<Preview>) {
    if (preview !== null) setPreview({ ...preview, ...changes });
  }

  async function save(current: Preview) {
    setBusy(true);
    setError(null);
    try {
      const used = new Set(chosen.map((h) => h.symbol));
      const filePrice = new Map(chosen.filter((h) => h.priceCents !== null).map((h) => [h.symbol, h.priceCents!]));
      await onImport({
        newTickers: current.choices
          .filter((c) => used.has(c.symbol))
          .map((c) => ({
            symbol: c.symbol,
            name: c.name,
            assetClass: c.assetClass,
            defaultBucket: c.bucket,
            priceCents: filePrice.get(c.symbol) ?? null,
            priceAsOf: null,
          })),
        prices: current.updatePrices ? priced.map((h) => ({ symbol: h.symbol, priceCents: h.priceCents! })) : [],
        models: [],
      });
      onApply(
        holdingsToAccount(account, chosen, {
          setBalance: current.setBalance,
          feeCents,
          feeFrom: current.takeFeeFromCash ? feeSource : null,
        }),
      );
      setDone(`Imported ${chosen.length} holdings from ${current.fileName}. Save the case to keep them.`);
      setPreview(null);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  function toggle(row: number) {
    const included = new Set(preview!.included);
    if (included.has(row)) included.delete(row);
    else included.add(row);
    patch({ included });
  }

  const flagged = preview.file.holdings.filter((h) => h.warning !== null || h.problem !== null).length;

  return (
    <div className="import-holdings import-holdings-open">
      <div className="card-head">
        <h4>Import holdings: {preview.fileName}</h4>
        <button type="button" disabled={busy} onClick={() => input.current?.click()}>
          Choose another file…
        </button>
        <FileInput input={input} onFile={(file) => void open(file)} />
      </div>

      {preview.file.problems.length > 0 && (
        <Callout tone="error" title="This file cannot be imported">
          <ul>
            {preview.file.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Callout>
      )}
      {(preview.file.warnings.length > 0 || flagged > 0) && (
        <Callout tone="warning" title="Check before importing">
          <ul>
            {flagged > 0 && <li>{flagged} row{flagged === 1 ? ' is' : 's are'} flagged below.</li>}
            {preview.file.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Callout>
      )}

      {preview.file.holdings.length > 0 && (
        <table className="import-table">
          <caption>
            {preview.file.holdings.length} holdings, {formatCents(totalCents)} selected
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Import</span>
              </th>
              <th scope="col">Symbol</th>
              <th scope="col">Description</th>
              <th scope="col" className="amount">
                Quantity
              </th>
              <th scope="col" className="amount">
                Price
              </th>
              <th scope="col" className="amount">
                Market value
              </th>
              <th scope="col">Bucket</th>
            </tr>
          </thead>
          <tbody>
            {preview.file.holdings.map((h) => {
              const known = bySymbol.get(h.symbol);
              const choice = preview.choices.find((c) => c.symbol === h.symbol);
              const note = h.problem ?? h.warning;
              return (
                <tr key={h.row} className={h.problem !== null ? 'import-row-blocked' : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Import ${h.rawSymbol || `row ${h.row}`}`}
                      disabled={h.problem !== null}
                      checked={preview.included.has(h.row)}
                      onChange={() => toggle(h.row)}
                    />
                  </td>
                  <th scope="row">
                    <code>{h.rawSymbol}</code>
                    {known === undefined && h.problem === null && <span className="tag">new</span>}
                  </th>
                  <td className="import-name">
                    {h.description}
                    {note !== null && (
                      <span className={h.problem !== null ? 'field-error import-note' : 'text-warn import-note'}>{note}</span>
                    )}
                  </td>
                  <td className="amount">{h.sharesMicros === null ? '—' : formatShares(h.sharesMicros)}</td>
                  <td className="amount">{h.priceCents === null ? '—' : formatCents(h.priceCents)}</td>
                  <td className="amount">{formatCents(h.marketValueCents)}</td>
                  <td>
                    <BucketTag bucket={known?.defaultBucket ?? choice?.bucket ?? h.bucket} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <NewTickerChoices
        choices={preview.choices.filter((c) => chosen.some((h) => h.symbol === c.symbol))}
        onChange={(symbol, changes) =>
          patch({ choices: preview.choices.map((c) => (c.symbol === symbol ? { ...c, ...changes } : c)) })
        }
      />

      <fieldset className="import-options">
        <legend>When importing</legend>
        <label>
          <input type="checkbox" checked={preview.setBalance} onChange={(e) => patch({ setBalance: e.target.checked })} />{' '}
          Set the account balance to {formatCents(totalCents)} (now {formatCents(account.balanceCents)})
        </label>
        <label>
          <input
            type="checkbox"
            checked={preview.updatePrices}
            disabled={priced.length === 0}
            onChange={(e) => patch({ updatePrices: e.target.checked })}
          />{' '}
          Update the price of {priced.length} ticker{priced.length === 1 ? '' : 's'} already in the list from this file
        </label>
        <label>
          <input
            type="checkbox"
            checked={preview.takeFeeFromCash && feeSource !== null}
            disabled={feeSource === null}
            onChange={(e) => patch({ takeFeeFromCash: e.target.checked })}
          />{' '}
          {feeSource === null
            ? `Hold the ${formatCents(feeCents)} advisory fee out of a cash holding (none is large enough)`
            : `Hold the ${formatCents(feeCents)} advisory fee out of ${feeSource}`}
        </label>
        {account.lines.length > 0 && (
          <p className="text-warn">
            Replaces the {account.lines.length} fund{account.lines.length === 1 ? '' : 's'} in this account, and its model.
          </p>
        )}
      </fieldset>

      {error !== null && <p className="field-error">{error}</p>}

      <div className="button-row">
        <button
          type="button"
          className="primary"
          disabled={busy || chosen.length === 0 || preview.file.problems.length > 0}
          onClick={() => void save(preview)}
        >
          {busy ? 'Importing…' : `Import ${chosen.length} holding${chosen.length === 1 ? '' : 's'}`}
        </button>
        <button type="button" disabled={busy} onClick={() => setPreview(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function FileInput({ input, onFile }: { input: RefObject<HTMLInputElement | null>; onFile: (file: File) => void }) {
  return (
    <input
      ref={input}
      type="file"
      accept=".xlsx"
      hidden
      onChange={(event) => {
        const file = event.target.files?.[0];
        // Cleared so choosing the same file again still reads it.
        event.target.value = '';
        if (file !== undefined) onFile(file);
      }}
    />
  );
}
