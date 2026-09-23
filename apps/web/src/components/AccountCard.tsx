import { formatCents, formatCentsWhole } from '../domain/money.js';
import { allocatedCents, modelChoices, modelsById, sleeveHoldings, unallocatedCents } from '../domain/breakdown.js';
import { ACCOUNT_TYPE_LABELS, BUCKET_LABELS, TAX_FUNNEL_LABELS } from '../domain/lifeStage.js';
import { ACCOUNT_TYPES, DEFAULT_TAX_FUNNEL, TAX_FUNNELS } from '../domain/types.js';
import type { Account, BucketSleeve, BucketType, ModelPortfolio } from '../domain/types.js';

import { SelectField, TextField } from './Fields.js';
import { MoneyInput } from './MoneyInput.js';

interface Props {
  account: Account;
  models: readonly ModelPortfolio[];
  onChange: (next: Account) => void;
  onRemove: () => void;
}

/**
 * One account, following RIG's flow: type the balance, decide how much of it
 * goes in Now, Soon, and Later, pick a model for each, and the app works out
 * the symbols and dollar amounts.
 */
export function AccountCard({ account, models, onChange, onRemove }: Props) {
  const byId = modelsById(models);
  const allocated = allocatedCents(account);
  const unallocated = unallocatedCents(account);

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
            <th scope="col">Model</th>
            <th scope="col">Works out to</th>
          </tr>
        </thead>
        <tbody>
          {account.sleeves.map((sleeve) => {
            const choices = modelChoices(models, sleeve.bucket, account.taxFunnel);
            const missing = sleeve.modelId !== null && !byId.has(sleeve.modelId);
            const holdings = sleeveHoldings(account, sleeve.bucket, byId);
            const label = BUCKET_LABELS[sleeve.bucket];

            return (
              <tr key={sleeve.bucket}>
                <th scope="row">
                  <span className={`swatch bucket-${sleeve.bucket.toLowerCase()}`} aria-hidden="true" />{' '}
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
                </td>
                <td className="works-out">
                  {holdings.length > 0 ? (
                    holdings.map((h) => (
                      <span key={h.tickerSymbol} className="position">
                        <code>{h.tickerSymbol}</code> {formatCentsWhole(h.marketValueCents)}
                      </span>
                    ))
                  ) : sleeve.amountCents > 0 ? (
                    <span className="muted">Choose a model to see positions</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
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
