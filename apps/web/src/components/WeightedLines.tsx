/**
 * The ticker-and-percentage table, shared by the model editor (US-14) and a
 * manual bucket on the account card (US-23). Both are the same job -- choose
 * symbols, give each a weight -- so they are the same component, and a change
 * to one is a change to both.
 *
 * Weights are kept as typed text while editing and only parsed to basis points
 * on the way out, so a half-typed "12." does not blank the field.
 */

import type { BucketType, SleeveLine, Ticker } from '../domain/types.js';
import { BUCKET_LABELS } from '../domain/lifeStage.js';
import { WHOLE_BPS, bpsToPercentInput, formatBps, parsePercentToBps } from '../domain/percent.js';

export interface DraftLine {
  readonly key: number;
  readonly tickerSymbol: string;
  readonly percentText: string;
}

let lineKey = 0;

export function newDraftLine(): DraftLine {
  return { key: ++lineKey, tickerSymbol: '', percentText: '' };
}

export function toDraftLines(lines: readonly SleeveLine[]): DraftLine[] {
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
export function toSleeveLines(lines: readonly DraftLine[]): SleeveLine[] {
  return lines.flatMap((l) => {
    const weightBps = parsePercentToBps(l.percentText);
    return l.tickerSymbol === '' || weightBps === null || weightBps === 0
      ? []
      : [{ tickerSymbol: l.tickerSymbol, weightBps }];
  });
}

/**
 * What is wrong with these lines, or null. `requireFull` is the difference
 * between the two callers: a reusable model has to add up to exactly 100%,
 * while a manual bucket may be half finished and still save.
 */
export function draftProblem(
  lines: readonly DraftLine[],
  { requireFull }: { requireFull: boolean },
): string | null {
  if (lines.some((l) => l.tickerSymbol === '')) return 'Choose a ticker on every line.';
  if (new Set(lines.map((l) => l.tickerSymbol)).size !== lines.length) {
    return 'Each ticker can appear once.';
  }
  if (draftWeights(lines).some((w) => w === null || w === 0)) {
    return 'Weights are percentages above 0 with up to two decimals, like 12.5.';
  }

  const total = draftTotalBps(lines);
  if (total > WHOLE_BPS) return `Weights add up to ${formatBps(total)}, which is over 100%.`;
  if (requireFull && total !== WHOLE_BPS) return `Weights add up to ${formatBps(total)}, not 100%.`;
  return null;
}

interface Props {
  lines: readonly DraftLine[];
  tickers: readonly Ticker[];
  /** Which bucket this money sits in, to flag a symbol RIG usually puts elsewhere. */
  bucket: BucketType;
  onChange: (lines: DraftLine[]) => void;
  /** Label on the add button, which differs between a model and a bucket. */
  addLabel?: string;
}

export function WeightedLines({ lines, tickers, bucket, onChange, addLabel = 'Add ticker' }: Props) {
  const tickerBySymbol = new Map(tickers.map((t) => [t.symbol, t]));
  const totalBps = draftTotalBps(lines);

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
                    <span
                      className="tag"
                      title="RIG's ticker mapping puts this symbol in another bucket"
                    >
                      usually {BUCKET_LABELS[ticker.defaultBucket]}
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
        <button type="button" onClick={() => onChange([...lines, newDraftLine()])}>
          {addLabel}
        </button>
      </div>
    </>
  );
}
