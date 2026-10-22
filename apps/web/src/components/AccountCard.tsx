import { addCents } from '@ai4rig/engine';
import { Fragment, useState } from 'react';

import { formatCents, formatCentsWhole } from '../domain/money.js';
import {
  allocatedCents,
  fillFromPlan,
  modelChoices,
  modelsById,
  sleeveHoldings,
  unallocatedCents,
} from '../domain/breakdown.js';
import { formatBps } from '../domain/percent.js';
import { proposedPositions, type ProposedPosition } from '../domain/proposal.js';
import type { AccountFee } from '../domain/worksheet.js';
import { ACCOUNT_TYPE_LABELS, BUCKET_LABELS, TAX_FUNNEL_LABELS } from '../domain/lifeStage.js';
import { ACCOUNT_TYPES, BUCKETS, DEFAULT_TAX_FUNNEL, SLEEVE_MODES, TAX_FUNNELS } from '../domain/types.js';
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
  /** This account's advisory fee (US-19), held as cash in its Now. */
  fee: AccountFee | undefined;
  /** What the plan still needs in each bucket across all accounts (US-22). */
  leftToPlace: Readonly<Record<BucketType, number>>;
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
 * One account, following RIG's flow: type the balance, decide how much of it
 * goes in Now, Soon, and Later, then for each either pick a model or list the
 * symbols yourself (US-23), and the app works out the dollar amounts.
 */
export function AccountCard({
  account,
  fee,
  leftToPlace,
  models,
  tickers,
  onChange,
  onRemove,
  onSaveAsModel,
  onAddTicker,
}: Props) {
  const byId = modelsById(models);
  const allocated = allocatedCents(account);
  const unallocated = unallocatedCents(account);
  const proposed = proposedPositions(account, models, tickers);
  const nowCents = account.sleeves.find((s) => s.bucket === 'NOW')?.amountCents ?? 0;
  const issues = [
    ...(unallocated > 0 ? [`${formatCentsWhole(unallocated)} not in a bucket`] : []),
    ...(unallocated < 0 ? [`${formatCentsWhole(-unallocated)} more than the balance`] : []),
    ...(fee !== undefined && nowCents < fee.feeCents
      ? [`Now is ${formatCentsWhole(fee.feeCents - nowCents)} short of the advisory fee`]
      : []),
  ];

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
                    {sleeve.bucket === 'NOW' && fee !== undefined && fee.feeCents > 0 && (
                      <p className="field-hint">
                        Includes {formatCentsWhole(fee.feeCents)} advisory fee ({formatBps(fee.rateBps)})
                      </p>
                    )}
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
                    {sleeve.amountCents > 0 && holdings.length === 0 && (
                      <p className="field-hint">
                        {sleeve.mode === 'MANUAL'
                          ? 'Weights must reach 100% to place this money.'
                          : 'Choose a model to place this money.'}
                      </p>
                    )}
                  </td>
                </tr>

                {sleeve.mode === 'MANUAL' && (
                  <tr className="sleeve-manual">
                    <td colSpan={3}>
                      <p className="muted">
                        Your own symbols for this {label} money. You can save it short of 100% and
                        finish later.
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
            <th scope="row">Placed</th>
            <td colSpan={2}>
              {/* Everything this account still needs, in one line. */}
              <div className="account-status">
                <span>
                  {formatCents(allocated)} of {formatCents(account.balanceCents)}
                </span>
                {issues.map((issue) => (
                  <span key={issue} className="text-warn">
                    {issue}
                  </span>
                ))}
                {unallocated > 0 && (
                  <button
                    type="button"
                    title="Adds what the plan still needs to Now, then Soon, then Later, up to this balance"
                    disabled={BUCKETS.every((b) => leftToPlace[b] <= 0)}
                    onClick={() => onChange(fillFromPlan(account, leftToPlace))}
                  >
                    Fill from the plan
                  </button>
                )}
              </div>
            </td>
          </tr>
        </tfoot>
      </table>

      <AccountHoldings positions={proposed} />
    </div>
  );
}

/**
 * US-21: what this account should hold. Each bucket's dollars split across its
 * model or symbols, then turned into whole shares at the ticker's price, with
 * what does not buy a whole share left as cash.
 */
function AccountHoldings({ positions }: { positions: readonly ProposedPosition[] }) {
  if (positions.length === 0) {
    return <p className="muted">Holdings appear here once a bucket has money and a model or symbols.</p>;
  }

  const cash = addCents(...positions.map((p) => p.cashCents ?? 0));
  const unpriced = [...new Set(positions.filter((p) => p.priceCents === null).map((p) => p.tickerSymbol))];
  return (
    <>
      <table className="holdings">
        <caption>Holdings: shares to buy</caption>
        <thead>
          <tr>
            <th scope="col">Bucket</th>
            <th scope="col">Symbol</th>
            <th scope="col" className="amount">
              Dollars
            </th>
            <th scope="col" className="amount">
              Price
            </th>
            <th scope="col" className="amount">
              Shares
            </th>
            <th scope="col" className="amount">
              Left as cash
            </th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={`${p.bucket}:${p.tickerSymbol}`}>
              <td>{BUCKET_LABELS[p.bucket]}</td>
              <th scope="row">
                <code>{p.tickerSymbol}</code>
              </th>
              <td className="amount">{formatCents(p.amountCents)}</td>
              {p.priceCents === null ? (
                <>
                  <td className="amount muted">No price</td>
                  <td className="amount muted">—</td>
                  <td className="amount muted">—</td>
                </>
              ) : (
                <>
                  <td className="amount">{formatCents(p.priceCents)}</td>
                  <td className="amount">
                    <strong>{(p.shares ?? 0).toLocaleString('en-US')}</strong>
                  </td>
                  <td className="amount">{formatCents(p.cashCents ?? 0)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
        {cash > 0 && (
          <tfoot>
            <tr>
              <th scope="row" colSpan={5}>
                Cash left over in this account
              </th>
              <td className="amount">{formatCents(cash)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      {unpriced.length > 0 && (
        <p className="text-warn">
          No price yet for {unpriced.join(', ')}. Add {unpriced.length === 1 ? 'it' : 'them'} on the
          Tickers screen to work out shares.
        </p>
      )}
    </>
  );
}
