import { Fragment, useEffect, useState } from 'react';

import { SHARES_SCALE } from '@ai4rig/engine';
import { formatCents, formatCentsWhole } from '../domain/money.js';
import {
  accountValueCents,
  allocatedCents,
  modelChoices,
  modelsById,
  sleeveHoldings,
  valuedPositions,
} from '../domain/breakdown.js';
import { ACCOUNT_TYPE_LABELS, BUCKET_LABELS, TAX_FUNNEL_LABELS } from '../domain/lifeStage.js';
import { ACCOUNT_TYPES, DEFAULT_TAX_FUNNEL, SLEEVE_MODES, TAX_FUNNELS } from '../domain/types.js';
import type {
  Account,
  BucketSleeve,
  BucketType,
  ModelPortfolio,
  Ticker,
} from '../domain/types.js';

import { SelectField, TextField } from './Fields.js';
import { MoneyInput } from './MoneyInput.js';
import {
  WeightedLines,
  draftProblem,
  toDraftLines,
  toSleeveLines,
  type DraftLine,
} from './WeightedLines.js';

interface Props {
  account: Account;
  models: readonly ModelPortfolio[];
  tickers: readonly Ticker[];
  onChange: (next: Account) => void;
  onRemove: () => void;
  /** Turns a manual bucket into a reusable model. Resolves to the saved model. */
  onSaveAsModel: (model: ModelPortfolio) => Promise<ModelPortfolio>;
  /** Adds a symbol typed on a manual bucket to the universe (US-24). */
  onAddTicker: (ticker: Ticker) => Promise<Ticker>;
}

const MODE_LABELS: Record<BucketSleeve['mode'], string> = {
  MODEL: 'Model',
  MANUAL: 'Manual',
};

/**
 * Target amounts and model guidance stay separate from actual positions, whose
 * account value is derived from shares multiplied by the ticker's price.
 */
export function AccountCard({
  account,
  models,
  tickers,
  onChange,
  onRemove,
  onSaveAsModel,
  onAddTicker,
}: Props) {
  const byId = modelsById(models);
  const allocated = allocatedCents(account);
  const positions = valuedPositions(account, tickers);

  /**
   * Manual lines being typed. They live here rather than on the case because a
   * half-typed weight like "12." is not a number yet; only complete lines are
   * pushed up. The `key={account.id}` on this component reseeds them when a
   * save hands back server ids.
   */
  const [drafts, setDrafts] = useState<Partial<Record<BucketType, DraftLine[]>>>(() =>
    Object.fromEntries(account.sleeves.map((s) => [s.bucket, toDraftLines(s.lines)])),
  );
  const [modelNames, setModelNames] = useState<Partial<Record<BucketType, string>>>({});
  const [savingModel, setSavingModel] = useState<BucketType | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setDraft(bucket: BucketType, lines: DraftLine[]) {
    setDrafts((current) => ({ ...current, [bucket]: lines }));
    // Only the readable lines reach the case; the text stays here.
    patchSleeve(bucket, { lines: toSleeveLines(lines) });
  }

  /** Model or manual are mutually exclusive, and the database enforces it. */
  function setMode(bucket: BucketType, mode: BucketSleeve['mode']) {
    if (mode === 'MANUAL') {
      patchSleeve(bucket, { mode, modelId: null, lines: toSleeveLines(drafts[bucket] ?? []) });
    } else {
      patchSleeve(bucket, { mode, lines: [] });
    }
  }

  async function saveAsModel(sleeve: BucketSleeve) {
    setSavingModel(sleeve.bucket);
    setError(null);
    try {
      const created = await onSaveAsModel({
        id: '',
        name: (modelNames[sleeve.bucket] ?? '').trim(),
        bucket: sleeve.bucket,
        taxFunnel: account.taxFunnel,
        lines: toSleeveLines(drafts[sleeve.bucket] ?? []),
      });
      // The bucket now follows the model it just became.
      patchSleeve(sleeve.bucket, { mode: 'MODEL', modelId: created.id, lines: [] });
      setModelNames((current) => ({ ...current, [sleeve.bucket]: '' }));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSavingModel(null);
    }
  }

  function patch(changes: Partial<Account>) {
    const next = { ...account, ...changes };
    onChange({ ...next, balanceCents: accountValueCents(next, tickers) });
  }

  function patchSleeve(bucket: BucketType, changes: Partial<BucketSleeve>) {
    patch({ sleeves: account.sleeves.map((s) => (s.bucket === bucket ? { ...s, ...changes } : s)) });
  }

  return (
    <div className="account">
      <div className="account-head">
        <SelectField
          label="Account type"
          value={account.accountType}
          options={ACCOUNT_TYPES}
          labels={ACCOUNT_TYPE_LABELS}
          // A new type brings its usual funnel; the advisor can still change it.
          onChange={(accountType) => patch({ accountType, taxFunnel: DEFAULT_TAX_FUNNEL[accountType] })}
        />
        <SelectField
          label="Tax funnel"
          value={account.taxFunnel}
          options={TAX_FUNNELS}
          labels={TAX_FUNNEL_LABELS}
          onChange={(taxFunnel) => patch({ taxFunnel })}
        />
        <TextField
          label="Masked number"
          value={account.maskedNumber}
          placeholder="Last four"
          onChange={(maskedNumber) => patch({ maskedNumber })}
        />
        <div className="field">
          <span className="field-label">Priced position value</span>
          <output className="derived">{formatCents(account.balanceCents)}</output>
        </div>
        <div className="field">
          <span className="field-label">Positions with no price</span>
          <output className="derived">
            {
              positions.filter((position) => position.sharesMicros > 0 && position.priceCents === null)
                .length
            }
          </output>
        </div>
        <div className="field">
          <button type="button" className="danger" onClick={onRemove}>
            Remove account
          </button>
        </div>
      </div>

      <table className="sleeves">
        <thead>
          <tr>
            <th scope="col">Bucket</th>
            <th scope="col">Target amount</th>
            <th scope="col">Model guidance</th>
            <th scope="col">Target mix</th>
          </tr>
        </thead>
        <tbody>
          {account.sleeves.map((sleeve) => {
            const choices = modelChoices(models, sleeve.bucket, account.taxFunnel);
            const missing = sleeve.modelId !== null && !byId.has(sleeve.modelId);
            const holdings = sleeveHoldings(account, sleeve.bucket, byId);
            const label = BUCKET_LABELS[sleeve.bucket];
            const draftLines = drafts[sleeve.bucket] ?? [];

            // Reusing a set of lines as a model holds it to the same rules as
            // any other model: a name, and weights that add up to exactly 100%.
            const modelBlocker =
              draftProblem(draftLines, { requireFull: true }) ??
              ((modelNames[sleeve.bucket] ?? '').trim() === ''
                ? 'Name it to reuse it on other accounts.'
                : null);

            return (
              <Fragment key={sleeve.bucket}>
                <tr>
                  <th scope="row">
                    <span
                      className={`swatch bucket-${sleeve.bucket.toLowerCase()}`}
                      aria-hidden="true"
                    />{' '}
                    {label}
                  </th>
                  <td>
                    <MoneyInput
                      label={`${label} amount`}
                      valueCents={sleeve.amountCents}
                      onChange={(amountCents) => patchSleeve(sleeve.bucket, { amountCents })}
                    />
                  </td>
                  <td>
                    <div className="follows">
                      <select
                        className="follows-mode"
                        aria-label={`${label} follows`}
                        value={sleeve.mode}
                        onChange={(event) =>
                          setMode(sleeve.bucket, event.target.value as BucketSleeve['mode'])
                        }
                      >
                        {SLEEVE_MODES.map((mode) => (
                          <option key={mode} value={mode}>
                            {MODE_LABELS[mode]}
                          </option>
                        ))}
                      </select>

                      {sleeve.mode === 'MODEL' && (
                        <select
                          className="follows-model"
                          aria-label={`${label} model`}
                          // The name can outrun the column, so it is truncated
                          // in place; hovering shows it in full.
                          title={sleeve.modelId === null ? undefined : byId.get(sleeve.modelId)?.name}
                          value={sleeve.modelId ?? ''}
                          onChange={(event) =>
                            patchSleeve(sleeve.bucket, {
                              modelId: event.target.value === '' ? null : event.target.value,
                            })
                          }
                        >
                          <option value="">No model</option>
                          {missing && <option value={sleeve.modelId ?? ''}>(deleted model)</option>}
                          {choices.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.name}
                              {model.taxFunnel !== null && model.taxFunnel !== account.taxFunnel
                                ? ` (for ${TAX_FUNNEL_LABELS[model.taxFunnel].toLowerCase()})`
                                : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </td>
                  <td className="works-out">
                    {holdings.length > 0 ? (
                      holdings.map((h) => (
                        <span key={h.tickerSymbol} className="position">
                          <code>{h.tickerSymbol}</code> {formatCentsWhole(h.marketValueCents)}
                        </span>
                      ))
                    ) : sleeve.amountCents <= 0 ? (
                      <span className="muted">—</span>
                    ) : sleeve.mode === 'MANUAL' ? (
                      <span className="muted">Weights must reach 100% to place this money</span>
                    ) : (
                      <span className="muted">Choose a model to see positions</span>
                    )}
                  </td>
                </tr>

                {sleeve.mode === 'MANUAL' && (
                  <tr className="sleeve-manual">
                    <td colSpan={4}>
                      <p className="muted">
                        Symbols picked for this client&rsquo;s {label} money. They can be left
                        short of 100% and finished later.
                      </p>

                      <WeightedLines
                        lines={draftLines}
                        tickers={tickers}
                        bucket={sleeve.bucket}
                        onChange={(next) => setDraft(sleeve.bucket, next)}
                        onAddTicker={onAddTicker}
                        addLabel="Add symbol"
                      />

                      <div className="button-row">
                        <input
                          type="text"
                          aria-label={`Name for a model from ${label}`}
                          placeholder="Name to reuse this as a model"
                          value={modelNames[sleeve.bucket] ?? ''}
                          onChange={(event) =>
                            setModelNames((current) => ({
                              ...current,
                              [sleeve.bucket]: event.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          disabled={modelBlocker !== null || savingModel !== null}
                          onClick={() => void saveAsModel(sleeve)}
                        >
                          {savingModel === sleeve.bucket ? 'Saving…' : 'Save as a model'}
                        </button>
                        {modelBlocker !== null && <span className="muted">{modelBlocker}</span>}
                      </div>

                      {error !== null && <p className="field-error">{error}</p>}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Planned target amounts</th>
            <td colSpan={3}>
              {formatCents(allocated)}
            </td>
          </tr>
          <tr>
            <th scope="row">Actual position value</th>
            <td colSpan={3}>{formatCents(account.balanceCents)}</td>
          </tr>
        </tfoot>
      </table>

      <section className="card">
        <h4>Actual ticker shares by bucket</h4>
        <p className="muted">
          Enter actual shares here. Values use the manually maintained ticker price above; model
          guidance remains a separate target.
        </p>
        {account.sleeves.map((sleeve) => {
          const bucketPositions = positions.filter((position) => position.bucket === sleeve.bucket);
          const bucketValue = bucketPositions.reduce(
            (sum, position) => sum + (position.marketValueCents ?? 0),
            0,
          );
          const available = tickers.filter(
            (ticker) =>
              !bucketPositions.some((position) => position.tickerSymbol === ticker.symbol),
          );

          return (
            <fieldset className="rows" key={sleeve.bucket}>
              <legend>{BUCKET_LABELS[sleeve.bucket]} — {formatCents(bucketValue)} priced</legend>
              {bucketPositions.map((position) => {
                const choices = tickers.filter(
                  (ticker) =>
                    ticker.symbol === position.tickerSymbol ||
                    !bucketPositions.some((other) => other.tickerSymbol === ticker.symbol),
                );
                return (
                  <div className="row" key={`${position.bucket}:${position.tickerSymbol}`}>
                    <div className="field">
                      <label htmlFor={`position-symbol-${account.id}-${position.bucket}-${position.tickerSymbol}`}>
                        Ticker
                      </label>
                      <select
                        id={`position-symbol-${account.id}-${position.bucket}-${position.tickerSymbol}`}
                        value={position.tickerSymbol}
                        onChange={(event) => {
                          const tickerSymbol = event.target.value;
                          patch({
                            positions: account.positions.map((entry) =>
                              entry.bucket === position.bucket &&
                              entry.tickerSymbol === position.tickerSymbol
                                ? { ...entry, tickerSymbol }
                                : entry,
                            ),
                          });
                        }}
                      >
                        {choices.map((ticker) => (
                          <option key={ticker.symbol} value={ticker.symbol}>
                            {ticker.symbol}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`position-shares-${account.id}-${position.bucket}-${position.tickerSymbol}`}>
                        Shares
                      </label>
                      <ShareInput
                        id={`position-shares-${account.id}-${position.bucket}-${position.tickerSymbol}`}
                        sharesMicros={position.sharesMicros}
                        onChange={(sharesMicros) =>
                          patch({
                            positions: account.positions.map((entry) =>
                              entry.bucket === position.bucket &&
                              entry.tickerSymbol === position.tickerSymbol
                                ? { ...entry, sharesMicros }
                                : entry,
                            ),
                          })
                        }
                      />
                    </div>
                    <div className="field">
                      <span className="field-label">Price / value</span>
                      <output className="derived">
                        {position.priceCents === null
                          ? 'Ticker price not entered'
                          : `${formatCents(position.priceCents)} / ${formatCents(position.marketValueCents ?? 0)}`}
                      </output>
                    </div>
                    <button
                      type="button"
                      className="danger"
                      onClick={() =>
                        patch({
                          positions: account.positions.filter(
                            (entry) =>
                              entry.bucket !== position.bucket ||
                              entry.tickerSymbol !== position.tickerSymbol,
                          ),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                disabled={available.length === 0}
                onClick={() => {
                  const ticker =
                    available.find((candidate) => candidate.defaultBucket === sleeve.bucket) ??
                    available[0];
                  if (ticker === undefined) return;
                  patch({
                    positions: [
                      ...account.positions,
                      { bucket: sleeve.bucket, tickerSymbol: ticker.symbol, sharesMicros: 0 },
                    ],
                  });
                }}
              >
                Add actual ticker
              </button>
            </fieldset>
          );
        })}
      </section>
    </div>
  );
}

function formatShares(sharesMicros: number): string {
  return (sharesMicros / SHARES_SCALE).toFixed(6).replace(/\.?0+$/, '');
}

function ShareInput({
  id,
  sharesMicros,
  onChange,
}: {
  id: string;
  sharesMicros: number;
  onChange: (sharesMicros: number) => void;
}) {
  const [draft, setDraft] = useState(formatShares(sharesMicros));

  useEffect(() => {
    setDraft(formatShares(sharesMicros));
  }, [sharesMicros]);

  function commit() {
    const parsed = parseSharesMicros(draft);
    if (parsed === null) {
      setDraft(formatShares(sharesMicros));
      return;
    }
    onChange(parsed);
    setDraft(formatShares(parsed));
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      aria-invalid={parseSharesMicros(draft) === null}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
    />
  );
}

function parseSharesMicros(value: string): number | null {
  const match = /^(?:(\d+)(?:\.(\d{0,6}))?|\.(\d{1,6}))$/.exec(value.trim());
  if (match === null) return null;

  const whole = match[1] ?? '0';
  const fractional = (match[2] ?? match[3] ?? '').padEnd(6, '0');
  const sharesMicros = BigInt(whole) * BigInt(SHARES_SCALE) + BigInt(fractional || '0');
  return sharesMicros <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(sharesMicros) : null;
}
