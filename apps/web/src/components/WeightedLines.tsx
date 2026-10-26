/**
 * The ticker-and-percentage table of the model editor (US-14). Each ticker
 * shows the bucket it counts toward, so a model's Now / Soon / Later mix is
 * visible while it is built.
 *
 * Weights are kept as typed text while editing and only parsed to basis points
 * on the way out, so a half-typed "12." does not blank the field.
 *
 * Symbols are typed, not picked from a list (US-24). A line's `tickerSymbol`
 * only ever holds a symbol the universe knows, or ''; a symbol that is not in
 * the universe yet stays in the input box, with an offer to add it, until it
 * is added. Everything downstream can keep assuming a line's symbol is real.
 */

import { Fragment, useId, useState } from 'react';

import type { ModelLine, Ticker } from '../domain/types.js';
import { BUCKET_LABELS } from '../domain/lifeStage.js';
import { WHOLE_BPS, bpsToPercentInput, formatBps, parsePercentToBps } from '../domain/percent.js';
import { isValidSymbol, normalizeSymbol } from '../domain/tickers.js';

import { NewTickerFields } from './NewTickerFields.js';

export interface DraftLine {
  readonly key: number;
  readonly tickerSymbol: string;
  readonly percentText: string;
}

let lineKey = 0;

export function newDraftLine(): DraftLine {
  return { key: ++lineKey, tickerSymbol: '', percentText: '' };
}

export function toDraftLines(lines: readonly ModelLine[]): DraftLine[] {
  return lines.map((line) => ({
    key: ++lineKey,
    tickerSymbol: line.tickerSymbol,
    percentText: bpsToPercentInput(line.weightBps),
  }));
}

export function draftWeights(lines: readonly DraftLine[]): (number | null)[] {
  return lines.map((l) => parsePercentToBps(l.percentText));
}

export function draftTotalBps(lines: readonly DraftLine[]): number {
  return draftWeights(lines).reduce<number>((sum, w) => sum + (w ?? 0), 0);
}

/** Only the lines that are complete and readable. */
export function toModelLines(lines: readonly DraftLine[]): ModelLine[] {
  return lines.flatMap((l) => {
    const weightBps = parsePercentToBps(l.percentText);
    return l.tickerSymbol === '' || weightBps === null || weightBps === 0
      ? []
      : [{ tickerSymbol: l.tickerSymbol, weightBps }];
  });
}

/** What is wrong with these lines, or null. A model adds up to exactly 100%. */
export function draftProblem(lines: readonly DraftLine[]): string | null {
  if (lines.some((l) => l.tickerSymbol === '')) return 'Enter a ticker on every line, adding any new ones.';
  if (new Set(lines.map((l) => l.tickerSymbol)).size !== lines.length) {
    return 'Each ticker can appear once.';
  }
  if (draftWeights(lines).some((w) => w === null || w === 0)) {
    return 'Weights are percentages above 0 with up to two decimals, like 12.5.';
  }

  const total = draftTotalBps(lines);
  if (total !== WHOLE_BPS) return `Weights add up to ${formatBps(total)}, not 100%.`;
  return null;
}

interface Props {
  lines: readonly DraftLine[];
  tickers: readonly Ticker[];
  onChange: (lines: DraftLine[]) => void;
  /** Adds a symbol to the universe. Rejects with the reason when it cannot. */
  onAddTicker: (ticker: Ticker) => Promise<Ticker>;
}

export function WeightedLines({ lines, tickers, onChange, onAddTicker }: Props) {
  const tickerBySymbol = new Map(tickers.map((t) => [t.symbol, t]));
  const totalBps = draftTotalBps(lines);
  const listId = useId();
  /** What is in each symbol box, by line key, when it differs from the line's symbol. */
  const [typed, setTyped] = useState<Record<number, string>>({});

  function patchLine(key: number, changes: Partial<DraftLine>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...changes } : l)));
  }

  return (
    <>
      <table className="model-lines">
        <thead>
          <tr>
            <th scope="col">Ticker</th>
            <th scope="col">Weight</th>
            <th scope="col">Bucket</th>
            <th scope="col" className="row-actions">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const ticker = tickerBySymbol.get(line.tickerSymbol);
            const text = typed[line.key] ?? line.tickerSymbol;
            const symbol = normalizeSymbol(text);
            const isNew = symbol !== '' && !tickerBySymbol.has(symbol);
            const valid = isValidSymbol(symbol);

            function onType(value: string) {
              setTyped((current) => ({ ...current, [line.key]: value }));
              const next = normalizeSymbol(value);
              // Only a known symbol reaches the line; anything else leaves it blank.
              const known = tickerBySymbol.has(next) ? next : '';
              if (known !== line.tickerSymbol) patchLine(line.key, { tickerSymbol: known });
            }

            return (
              <Fragment key={line.key}>
                <tr>
                  <td>
                    <input
                      aria-label="Ticker"
                      className="symbol-input"
                      type="text"
                      list={listId}
                      autoComplete="off"
                      spellCheck={false}
                      value={text}
                      aria-invalid={isNew && !valid}
                      onChange={(event) => onType(event.target.value)}
                    />
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
                    {ticker !== undefined && (
                      <span className="bucket-tag">
                        <span
                          className={`swatch bucket-${ticker.defaultBucket.toLowerCase()}`}
                          aria-hidden="true"
                        />{' '}
                        {BUCKET_LABELS[ticker.defaultBucket]}
                      </span>
                    )}
                  </td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="link"
                      onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
                {/* Its own row under the line, so the columns do not shift while typing. */}
                {isNew && (
                  <tr className="new-ticker-row">
                    <td colSpan={4}>
                      {valid ? (
                        <NewTickerFields
                          key={symbol}
                          symbol={symbol}
                          suggestedBucket="LATER"
                          onAdd={onAddTicker}
                          onAdded={(added) => {
                            setTyped((current) => ({ ...current, [line.key]: added.symbol }));
                            patchLine(line.key, { tickerSymbol: added.symbol });
                          }}
                        />
                      ) : (
                        <span className="field-error">
                          Symbols are letters, digits, dots, and dashes, up to 10.
                        </span>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
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

      <datalist id={listId}>
        {tickers.map((t) => (
          <option key={t.symbol} value={t.symbol} />
        ))}
      </datalist>

      <div className="button-row">
        <button type="button" onClick={() => onChange([...lines, newDraftLine()])}>
          Add ticker
        </button>
      </div>
    </>
  );
}
