import { Fragment, useState } from 'react';

import { formatCents, formatCentsWhole } from '../domain/money.js';
import { allocatedCents, modelChoices, modelsById, sleeveHoldings, unallocatedCents } from '../domain/breakdown.js';
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
}

const MODE_LABELS: Record<BucketSleeve['mode'], string> = {
  MODEL: 'Model',
  MANUAL: 'Manual',
};

/**
 * One account, following RIG's flow: type the balance, decide how much of it
 * goes in Now, Soon, and Later, then for each either pick a model or list the
 * symbols yourself (US-23), and the app works out the dollar amounts.
 */
export function AccountCard({
  account,
  models,
  tickers,
  onChange,
  onRemove,
  onSaveAsModel,
}: Props) {
  const byId = modelsById(models);
  const allocated = allocatedCents(account);
  const unallocated = unallocatedCents(account);

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
    onChange({ ...account, ...changes });
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
        <MoneyInput
          label="Account balance"
          valueCents={account.balanceCents}
          onChange={(balanceCents) => patch({ balanceCents })}
        />
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
            <th scope="col">Amount</th>
            <th scope="col">Follows</th>
            <th scope="col">Works out to</th>
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
                          aria-label={`${label} model`}
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
            <th scope="row">Allocated</th>
            <td colSpan={3}>
              {formatCents(allocated)} of {formatCents(account.balanceCents)}
              {unallocated > 0 && (
                <>
                  <span className="tag tag-warn">{formatCentsWhole(unallocated)} not in a bucket</span>
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      const later = account.sleeves.find((s) => s.bucket === 'LATER');
                      patchSleeve('LATER', { amountCents: (later?.amountCents ?? 0) + unallocated });
                    }}
                  >
                    Put the rest in Later
                  </button>
                </>
              )}
              {unallocated < 0 && (
                <span className="tag tag-warn">
                  Buckets are {formatCentsWhole(-unallocated)} more than the balance
                </span>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
