import { useMemo } from 'react';

import { AccountCard } from '../components/AccountCard.js';
import { BucketBar } from '../components/BucketBar.js';
import { Callout } from '../components/Callout.js';
import { DerivedField, NumberField, SelectField, TextField } from '../components/Fields.js';
import { MoneyInput } from '../components/MoneyInput.js';
import { bucketsByAccount } from '../domain/breakdown.js';
import { newAccount, newExpense, newGapEntry } from '../domain/factory.js';
import {
  HEALTH_CONCERN_LABELS,
  LIFE_STAGE_LABELS,
  MONEY_CYCLE_LABELS,
  ageFromBirthYear,
  householdPlanYears,
} from '../domain/lifeStage.js';
import { formatCents, formatCentsWhole, formatPercent } from '../domain/money.js';
import { HEALTH_CONCERNS, LIFE_STAGES, MONEY_CYCLE_PHASES, TAX_BRACKETS } from '../domain/types.js';
import type {
  AllocationTarget,
  ClientCase,
  GapEntry,
  ModelPortfolio,
  PlannedExpense,
} from '../domain/types.js';
import {
  computePlanTotals,
  targetAllocation,
  type BucketWorksheet,
} from '../domain/worksheet.js';

interface Props {
  clientCase: ClientCase;
  models: readonly ModelPortfolio[];
  onChange: (next: ClientCase) => void;
  today: Date;
}

/**
 * US-01 — client profile intake.
 *
 * Ordered to follow RIG's two worksheets: household, accounts and buckets,
 * fees and cash, then the Now and Soon questions with the buckets recomputed as
 * the advisor types. Edits go to a working copy held by the parent; nothing is
 * written until Save.
 */
export function ClientProfile({ clientCase, models, onChange, today }: Props) {
  const totals = useMemo(() => computePlanTotals(clientCase), [clientCase]);
  const target = useMemo(() => targetAllocation(clientCase, totals), [clientCase, totals]);
  const planYears = householdPlanYears(clientCase.people, today);
  const { nowInputs, soonInputs } = clientCase;

  function patch(changes: Partial<ClientCase>) {
    onChange({ ...clientCase, ...changes });
  }

  return (
    <div>
      <header className="screen-header">
        <h2>Client profile</h2>
        <p className="muted">
          Case {clientCase.clientNumber} · plan {clientCase.planNumber} · last saved{' '}
          {new Date(clientCase.updatedAt).toLocaleString()}
        </p>
      </header>

      <section className="card">
        <h3>Household</h3>
        <p className="muted">Year of birth only. Age is derived from it.</p>

        <div className="grid two">
          {clientCase.people.map((person, index) => {
            const age = ageFromBirthYear(person.birthYear, today);
            const updatePerson = (changes: Partial<(typeof clientCase.people)[number]>) =>
              patch({
                people: clientCase.people.map((p, i) => (i === index ? { ...p, ...changes } : p)),
              });

            return (
              <fieldset key={person.role}>
                <legend>{person.role === 'CLIENT' ? 'Client' : 'Spouse'}</legend>

                <NumberField
                  label="Year of birth"
                  value={person.birthYear}
                  min={1900}
                  max={today.getFullYear()}
                  onChange={(birthYear) => updatePerson({ birthYear })}
                />
                <DerivedField label="Age" value={age === null ? '—' : String(age)} />
                <SelectField
                  label="Health concerns"
                  value={person.healthConcern}
                  options={HEALTH_CONCERNS}
                  labels={HEALTH_CONCERN_LABELS}
                  onChange={(healthConcern) => updatePerson({ healthConcern })}
                />
                <NumberField
                  label="Life expectancy age"
                  value={person.lifeExpectancyAge}
                  min={0}
                  max={130}
                  hint="Entered by the advisor. The worksheet wants this estimated from age and health."
                  onChange={(lifeExpectancyAge) => updatePerson({ lifeExpectancyAge })}
                />
              </fieldset>
            );
          })}
        </div>

        <div className="grid three">
          <DerivedField
            label="Years the plan must cover"
            value={planYears === null ? '—' : `${planYears} years`}
          />
          <SelectField
            label="Money cycle phase"
            value={clientCase.moneyCyclePhase}
            options={MONEY_CYCLE_PHASES}
            labels={MONEY_CYCLE_LABELS}
            onChange={(moneyCyclePhase) => patch({ moneyCyclePhase })}
          />
          <SelectField
            label="Stage of life"
            value={clientCase.lifeStage}
            options={LIFE_STAGES}
            labels={LIFE_STAGE_LABELS}
            onChange={(lifeStage) => patch({ lifeStage })}
          />
          <SelectField
            label="Tax bracket"
            value={clientCase.taxBracketPct === null ? '' : String(clientCase.taxBracketPct)}
            options={TAX_BRACKET_OPTIONS}
            labels={TAX_BRACKET_LABELS}
            hint="Federal marginal rate."
            onChange={(value) => patch({ taxBracketPct: value === '' ? null : Number(value) })}
          />
          <TextField
            label="Initials"
            value={clientCase.initials}
            hint="Display label only."
            onChange={(initials) => patch({ initials })}
          />
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Accounts and buckets</h3>
          <button
            type="button"
            onClick={() => patch({ accounts: [...clientCase.accounts, newAccount()] })}
          >
            Add account
          </button>
        </div>
        <p className="muted">
          Enter each account&rsquo;s balance, split it across Now, Soon, and Later, and pick a
          model for each. The positions are worked out from the model.
        </p>

        {clientCase.accounts.length === 0 && (
          <p className="empty">No accounts yet. Add one to start.</p>
        )}

        {clientCase.accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            models={models}
            onChange={(next) =>
              patch({ accounts: clientCase.accounts.map((a) => (a.id === account.id ? next : a)) })
            }
            onRemove={() => patch({ accounts: clientCase.accounts.filter((a) => a.id !== account.id) })}
          />
        ))}

        <BucketTotals clientCase={clientCase} target={target} />
      </section>

      <section className="card">
        <h3>Fees and cash</h3>
        <div className="grid three">
          <DerivedField
            label="Total account balances"
            value={formatCents(totals.investableAssetsCents)}
          />
          <MoneyInput
            label="Cash on hand at bank"
            valueCents={clientCase.cashOnHandCents}
            onChange={(cashOnHandCents) => patch({ cashOnHandCents })}
          />
          <MoneyInput
            label="Extra spare tire"
            valueCents={clientCase.spareTireCents}
            onChange={(spareTireCents) => patch({ spareTireCents })}
          />
        </div>

        <Callout tone="blocked" title="Advisory fee tiers not supplied">
          The worksheet derives the fee from account balance tiers. RIG has not sent the tier table,
          so the fee and the cash needed to cover it are left out.
        </Callout>
      </section>

      <section className="card">
        <h3>Now bucket</h3>
        <div className="grid three">
          <MoneyInput
            label="Income draw per month"
            valueCents={nowInputs.monthlyIncomeDrawCents}
            onChange={(monthlyIncomeDrawCents) =>
              patch({ nowInputs: { ...nowInputs, monthlyIncomeDrawCents } })
            }
          />
          <NumberField
            label="Number of months"
            value={nowInputs.incomeDrawMonths}
            min={0}
            max={12}
            onChange={(months) => patch({ nowInputs: { ...nowInputs, incomeDrawMonths: months ?? 0 } })}
          />
          <MoneyInput
            label="Cash the client wants in the bank"
            valueCents={nowInputs.bankReserveCents}
            onChange={(bankReserveCents) => patch({ nowInputs: { ...nowInputs, bankReserveCents } })}
          />
        </div>

        <ExpenseRows
          title="Large upcoming planned expenses"
          addLabel="Add expense"
          expenses={nowInputs.plannedExpenses}
          onChange={(plannedExpenses) => patch({ nowInputs: { ...nowInputs, plannedExpenses } })}
        />

        <WorksheetLines worksheet={totals.now} />
      </section>

      <section className="card">
        <h3>Soon bucket</h3>
        <div className="grid three">
          <MoneyInput
            label="Annual income gap"
            valueCents={soonInputs.annualIncomeGapCents}
            onChange={(annualIncomeGapCents) =>
              patch({ soonInputs: { ...soonInputs, annualIncomeGapCents } })
            }
          />
          <NumberField
            label="Years of gap to cover"
            value={soonInputs.incomeGapYears}
            min={0}
            onChange={(years) => patch({ soonInputs: { ...soonInputs, incomeGapYears: years ?? 0 } })}
          />
          <MoneyInput
            label="Money to hold conservatively"
            valueCents={soonInputs.conservativeReserveCents}
            onChange={(conservativeReserveCents) =>
              patch({ soonInputs: { ...soonInputs, conservativeReserveCents } })
            }
          />
        </div>

        <GapRows
          title="Social Security bridge"
          addLabel="Add bridge"
          entries={soonInputs.socialSecurityBridges}
          onChange={(socialSecurityBridges) =>
            patch({ soonInputs: { ...soonInputs, socialSecurityBridges } })
          }
        />
        <GapRows
          title="Additional healthcare gap"
          addLabel="Add gap"
          entries={soonInputs.healthcareGaps}
          onChange={(healthcareGaps) => patch({ soonInputs: { ...soonInputs, healthcareGaps } })}
        />
        <GapRows
          title="Forced withdrawals from qualified accounts"
          addLabel="Add withdrawal"
          multiplier={1.15}
          entries={soonInputs.forcedWithdrawals}
          onChange={(forcedWithdrawals) =>
            patch({ soonInputs: { ...soonInputs, forcedWithdrawals } })
          }
        />
        <ExpenseRows
          title="Miscellaneous costs"
          addLabel="Add cost"
          expenses={soonInputs.miscellaneousCosts}
          onChange={(miscellaneousCosts) =>
            patch({ soonInputs: { ...soonInputs, miscellaneousCosts } })
          }
        />

        <WorksheetLines worksheet={totals.soon} />
      </section>

      <section className="card">
        <h3>Resulting plan</h3>
        <p className="muted">Later is total investable assets less Now and less Soon.</p>

        <BucketBar
          totalCents={totals.investableAssetsCents}
          segments={[
            { bucket: 'NOW', valueCents: totals.now.totalCents },
            { bucket: 'SOON', valueCents: totals.soon.totalCents },
            { bucket: 'LATER', valueCents: totals.later.totalCents },
          ]}
        />

        {totals.isOverfunded && (
          <Callout tone="warning" title="Now and Soon exceed the portfolio">
            They ask for {formatCentsWhole(totals.now.totalCents + totals.soon.totalCents)} against{' '}
            {formatCentsWhole(totals.investableAssetsCents)} of investable assets, leaving Later at{' '}
            {formatCentsWhole(totals.later.totalCents)}.
          </Callout>
        )}

        <table>
          <thead>
            <tr>
              <th scope="col">Stage of life</th>
              <th scope="col" className="amount">
                Now %
              </th>
              <th scope="col" className="amount">
                Soon %
              </th>
              <th scope="col" className="amount">
                Later %
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{LIFE_STAGE_LABELS[target.lifeStage]}</th>
              <td className="amount">{formatPercent(target.nowPct)}</td>
              <td className="amount">{formatPercent(target.soonPct)}</td>
              <td className="amount">{formatPercent(target.laterPct)}</td>
            </tr>
          </tbody>
        </table>

        <p className="field-hint">
          Derived from this client&rsquo;s worksheet inputs, not from a table keyed by life stage.
          Stage of life shows up in which inputs are non-zero: an accumulator with no income gap and
          no Social Security bridge gets a small Soon bucket without anything having to weight it.
        </p>
      </section>
    </div>
  );
}

const TAX_BRACKET_OPTIONS = ['', ...TAX_BRACKETS.map(String)] as const;
const TAX_BRACKET_LABELS: Record<string, string> = Object.fromEntries(
  TAX_BRACKET_OPTIONS.map((value) => [value, value === '' ? 'Not entered' : `${value}%`]),
);

/**
 * What the accounts add up to in each bucket against what the worksheet below
 * says the client needs there. The same comparison as the Breakdown screen,
 * kept here so the advisor sees it while splitting the accounts.
 */
function BucketTotals({ clientCase, target }: { clientCase: ClientCase; target: AllocationTarget }) {
  if (clientCase.accounts.length === 0) return null;
  const rows = bucketsByAccount(clientCase);
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((t, r) => t + pick(r), 0);
  const lines = [
    { label: 'Now', actual: sum((r) => r.nowCents), target: target.nowCents },
    { label: 'Soon', actual: sum((r) => r.soonCents), target: target.soonCents },
    { label: 'Later', actual: sum((r) => r.laterCents), target: target.laterCents },
  ];

  return (
    <table className="bucket-totals">
      <thead>
        <tr>
          <th scope="col">All accounts</th>
          <th scope="col" className="amount">
            In accounts
          </th>
          <th scope="col" className="amount">
            Worksheet says
          </th>
          <th scope="col" className="amount">
            Difference
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => {
          const delta = line.actual - line.target;
          return (
            <tr key={line.label}>
              <th scope="row">{line.label}</th>
              <td className="amount">{formatCentsWhole(line.actual)}</td>
              <td className="amount">{formatCentsWhole(line.target)}</td>
              <td className="amount">
                {delta === 0 ? (
                  <span className="muted">matches</span>
                ) : (
                  `${delta > 0 ? '+' : '\u2212'}${formatCentsWhole(Math.abs(delta))}`
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The arithmetic behind a bucket total, with the workbook cell for each line. */
function WorksheetLines({ worksheet }: { worksheet: BucketWorksheet }) {
  return (
    <table>
      <tbody>
        {worksheet.lines.map((line) => (
          <tr key={line.cell}>
            <th scope="row">
              {line.label}
              {line.note !== undefined && (
                <span className="tag tag-warn" title={line.note}>
                  check
                </span>
              )}
            </th>
            <td className="cell">{line.cell}</td>
            <td className="amount">{formatCents(line.amountCents)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">Total</th>
          <td />
          <td className="amount">{formatCents(worksheet.totalCents)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function ExpenseRows({
  title,
  addLabel,
  expenses,
  onChange,
}: {
  title: string;
  addLabel: string;
  expenses: readonly PlannedExpense[];
  onChange: (next: readonly PlannedExpense[]) => void;
}) {
  return (
    <fieldset className="rows">
      <legend>{title}</legend>
      {expenses.length === 0 && <p className="empty">None entered.</p>}
      {expenses.map((expense) => (
        <div className="row" key={expense.id}>
          <TextField
            label="Description"
            value={expense.label}
            onChange={(label) =>
              onChange(expenses.map((e) => (e.id === expense.id ? { ...e, label } : e)))
            }
          />
          <MoneyInput
            label="Cost"
            valueCents={expense.costCents}
            onChange={(costCents) =>
              onChange(expenses.map((e) => (e.id === expense.id ? { ...e, costCents } : e)))
            }
          />
          <div className="field">
            <button
              type="button"
              className="link"
              onClick={() => onChange(expenses.filter((e) => e.id !== expense.id))}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <div className="button-row">
        <button type="button" onClick={() => onChange([...expenses, newExpense()])}>
          {addLabel}
        </button>
      </div>
    </fieldset>
  );
}

function GapRows({
  title,
  addLabel,
  entries,
  onChange,
  multiplier = 1,
}: {
  title: string;
  addLabel: string;
  entries: readonly GapEntry[];
  onChange: (next: readonly GapEntry[]) => void;
  multiplier?: number;
}) {
  return (
    <fieldset className="rows">
      <legend>{title}</legend>
      {entries.length === 0 && <p className="empty">None entered.</p>}
      {entries.map((entry) => (
        <div className="row" key={entry.id}>
          <TextField
            label="Who"
            value={entry.label}
            onChange={(label) =>
              onChange(entries.map((e) => (e.id === entry.id ? { ...e, label } : e)))
            }
          />
          <MoneyInput
            label="Annual amount"
            valueCents={entry.annualAmountCents}
            onChange={(annualAmountCents) =>
              onChange(entries.map((e) => (e.id === entry.id ? { ...e, annualAmountCents } : e)))
            }
          />
          <NumberField
            label="Years"
            value={entry.years}
            min={0}
            step={0.5}
            onChange={(years) =>
              onChange(entries.map((e) => (e.id === entry.id ? { ...e, years: years ?? 0 } : e)))
            }
          />
          <div className="field">
            <button
              type="button"
              className="link"
              onClick={() => onChange(entries.filter((e) => e.id !== entry.id))}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <div className="button-row">
        <button type="button" onClick={() => onChange([...entries, newGapEntry(multiplier)])}>
          {addLabel}
        </button>
      </div>
    </fieldset>
  );
}
