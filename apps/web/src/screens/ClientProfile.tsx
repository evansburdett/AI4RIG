import { useMemo } from 'react';

import { BucketBar } from '../components/BucketBar.js';
import { Callout } from '../components/Callout.js';
import { DerivedField, NumberField, SelectField, TextField } from '../components/Fields.js';
import { MoneyInput } from '../components/MoneyInput.js';
import {
  ACCOUNT_TYPE_LABELS,
  HEALTH_CONCERN_LABELS,
  LIFE_STAGE_LABELS,
  MONEY_CYCLE_LABELS,
  ageFromBirthYear,
  householdPlanYears,
} from '../domain/lifeStage.js';
import { formatCents, formatCentsWhole } from '../domain/money.js';
import {
  ACCOUNT_TYPES,
  BUCKETS,
  HEALTH_CONCERNS,
  LIFE_STAGES,
  MONEY_CYCLE_PHASES,
} from '../domain/types.js';
import type {
  Account,
  Cents,
  ClientCase,
  GapEntry,
  Holding,
  PlannedExpense,
  Ticker,
} from '../domain/types.js';
import { computePlanTotals } from '../domain/worksheet.js';

interface Props {
  clientCase: ClientCase;
  tickers: readonly Ticker[];
  onChange: (next: ClientCase) => void;
  today: Date;
}

/**
 * US-01 — Client Profile Intake.
 *
 * The sponsor was explicit that this screen comes first and that everything
 * else flows from it, so its layout follows their two worksheets rather than
 * inventing an order. Top to bottom: the household, then the accounts and what
 * is in them, then the Now / Soon / Later questions, with the resulting buckets
 * recomputed as the advisor types.
 *
 * Nothing here is saved automatically. The advisor edits a working copy held by
 * the parent and presses Save, because a form that writes on every keystroke
 * makes a half-typed number look like a decision.
 */
export function ClientProfile({ clientCase, tickers, onChange, today }: Props) {
  const totals = useMemo(() => computePlanTotals(clientCase), [clientCase]);
  const planYears = householdPlanYears(clientCase.people, today);

  const accountBalances = clientCase.accounts.map((account) => ({
    account,
    balanceCents: account.holdings.reduce<Cents>((sum, h) => sum + h.marketValueCents, 0),
  }));

  function patch(changes: Partial<ClientCase>) {
    onChange({ ...clientCase, ...changes });
  }

  function patchAccount(id: string, changes: Partial<Account>) {
    patch({
      accounts: clientCase.accounts.map((a) => (a.id === id ? { ...a, ...changes } : a)),
    });
  }

  function patchHolding(accountId: string, holdingId: string, changes: Partial<Holding>) {
    const account = clientCase.accounts.find((a) => a.id === accountId);
    if (!account) return;
    patchAccount(accountId, {
      holdings: account.holdings.map((h) => (h.id === holdingId ? { ...h, ...changes } : h)),
    });
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h2>Client profile</h2>
        <p className="muted">
          Case {clientCase.clientNumber} · plan {clientCase.planNumber} · last saved{' '}
          {new Date(clientCase.updatedAt).toLocaleString()}
        </p>
      </header>

      {/* ── Household ───────────────────────────────────────────────────── */}
      <section className="card">
        <h3>Household</h3>
        <p className="muted">
          Year of birth only, never a full date. Age drives bucket weighting, so we need it; a date
          of birth is a direct identifier and the schema has no room for one.
        </p>

        <div className="grid two">
          {clientCase.people.map((person, index) => {
            const age = ageFromBirthYear(person.birthYear, today);
            return (
              <fieldset key={person.role}>
                <legend>{person.role === 'CLIENT' ? 'Client' : 'Spouse'}</legend>

                <NumberField
                  label="Year of birth"
                  value={person.birthYear}
                  min={1900}
                  max={today.getFullYear()}
                  onChange={(birthYear) =>
                    patch({
                      people: clientCase.people.map((p, i) =>
                        i === index ? { ...p, birthYear } : p,
                      ),
                    })
                  }
                />

                <DerivedField
                  label="Age"
                  value={age === null ? '—' : String(age)}
                  hint="Calculated from the year of birth, so the record cannot go stale."
                />

                <SelectField
                  label="Health concerns"
                  value={person.healthConcern}
                  options={HEALTH_CONCERNS}
                  labels={HEALTH_CONCERN_LABELS}
                  onChange={(healthConcern) =>
                    patch({
                      people: clientCase.people.map((p, i) =>
                        i === index ? { ...p, healthConcern } : p,
                      ),
                    })
                  }
                />

                <NumberField
                  label="Life expectancy age"
                  value={person.lifeExpectancyAge}
                  min={0}
                  max={130}
                  hint="Entered by the advisor for now. The worksheet wants this estimated from age and health; that estimator does not exist yet."
                  onChange={(lifeExpectancyAge) =>
                    patch({
                      people: clientCase.people.map((p, i) =>
                        i === index ? { ...p, lifeExpectancyAge } : p,
                      ),
                    })
                  }
                />
              </fieldset>
            );
          })}
        </div>

        <div className="grid three">
          <DerivedField
            label="Years the plan must cover"
            value={planYears === null ? '—' : `${planYears} years`}
            hint="The longer of the two horizons — the plan has to outlast both."
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
        </div>

        <TextField
          label="Initials (display only)"
          value={clientCase.initials}
          hint="A label to help you find the case in the switcher. Never used as a key — initials collide."
          onChange={(initials) => patch({ initials })}
        />
      </section>

      {/* ── Accounts and holdings ───────────────────────────────────────── */}
      <section className="card">
        <h3>Accounts and holdings</h3>
        <p className="muted">
          Account numbers are masked to the last four, the way RIG already masks them in the
          workbook. Each holding carries the bucket the advisor chose, which starts as the ticker&rsquo;s
          default and moves only when you move it.
        </p>

        {accountBalances.map(({ account, balanceCents }) => (
          <div className="account" key={account.id}>
            <div className="account-head">
              <SelectField
                label="Account type"
                value={account.accountType}
                options={ACCOUNT_TYPES}
                labels={ACCOUNT_TYPE_LABELS}
                onChange={(accountType) => patchAccount(account.id, { accountType })}
              />
              <TextField
                label="Masked number"
                value={account.maskedNumber}
                placeholder="••••1234"
                onChange={(maskedNumber) => patchAccount(account.id, { maskedNumber })}
              />
              <DerivedField label="Account balance" value={formatCents(balanceCents)} />
            </div>

            <table className="holdings">
              <thead>
                <tr>
                  <th scope="col">Symbol</th>
                  <th scope="col">Asset class</th>
                  <th scope="col">Market value</th>
                  <th scope="col">Bucket</th>
                </tr>
              </thead>
              <tbody>
                {account.holdings.map((holding) => {
                  const ticker = tickers.find((t) => t.symbol === holding.tickerSymbol);
                  const overridden =
                    ticker !== undefined && ticker.defaultBucket !== holding.assignedBucket;

                  return (
                    <tr key={holding.id}>
                      <th scope="row">
                        <code>{holding.tickerSymbol}</code>
                        {ticker === undefined && (
                          <span className="tag tag-warn" title="Not in the approved universe">
                            unknown
                          </span>
                        )}
                      </th>
                      <td className="muted">
                        {ticker === undefined ? '—' : ticker.assetClass.replace(/_/g, ' ').toLowerCase()}
                      </td>
                      <td>
                        <MoneyInput
                          label={`${holding.tickerSymbol} market value`}
                          valueCents={holding.marketValueCents}
                          onChange={(marketValueCents) =>
                            patchHolding(account.id, holding.id, { marketValueCents })
                          }
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`${holding.tickerSymbol} bucket`}
                          value={holding.assignedBucket}
                          onChange={(event) =>
                            patchHolding(account.id, holding.id, {
                              assignedBucket: event.target.value as Holding['assignedBucket'],
                            })
                          }
                        >
                          {BUCKETS.map((bucket) => (
                            <option key={bucket} value={bucket}>
                              {bucket}
                            </option>
                          ))}
                        </select>
                        {overridden && (
                          <span className="tag" title={`Default is ${ticker.defaultBucket}`}>
                            override
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        <Callout tone="info" title="Adding and removing accounts is not wired up yet">
          The rows above edit in place so the rest of the screen has real numbers to work from.
          Creating a case, adding an account, and adding a holding all write to the database, which
          is US-04&rsquo;s work; this screen picks them up when those endpoints exist.
        </Callout>
      </section>

      {/* ── Fees and cash ───────────────────────────────────────────────── */}
      <section className="card">
        <h3>Fees and cash</h3>
        <div className="grid three">
          <DerivedField
            label="Total account balances"
            value={formatCents(totals.investableAssetsCents)}
            hint="The sum of every holding across every account."
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
          The worksheet calculates the advisory fee from account balance tiers and then multiplies
          it by total balances to get the cash needed to cover it. RIG has not given us the tier
          table, so both rows are left out rather than filled with a rate we made up.
        </Callout>
      </section>

      {/* ── Now bucket ──────────────────────────────────────────────────── */}
      <section className="card">
        <h3>Now bucket</h3>
        <p className="muted">Money spent in the next twelve months.</p>

        <div className="grid three">
          <MoneyInput
            label="Income draw per month"
            valueCents={clientCase.nowInputs.monthlyIncomeDrawCents}
            onChange={(monthlyIncomeDrawCents) =>
              patch({ nowInputs: { ...clientCase.nowInputs, monthlyIncomeDrawCents } })
            }
          />
          <NumberField
            label="Number of months"
            value={clientCase.nowInputs.incomeDrawMonths}
            min={0}
            max={12}
            onChange={(months) =>
              patch({
                nowInputs: { ...clientCase.nowInputs, incomeDrawMonths: months ?? 0 },
              })
            }
          />
          <MoneyInput
            label="Cash the client wants in the bank"
            valueCents={clientCase.nowInputs.bankReserveCents}
            hint="The worksheet calls this the magic number."
            onChange={(bankReserveCents) =>
              patch({ nowInputs: { ...clientCase.nowInputs, bankReserveCents } })
            }
          />
        </div>

        <ExpenseRows
          title="Large upcoming planned expenses"
          expenses={clientCase.nowInputs.plannedExpenses}
          onChange={(plannedExpenses) =>
            patch({ nowInputs: { ...clientCase.nowInputs, plannedExpenses } })
          }
        />

        <WorksheetLines worksheet={totals.now} />
      </section>

      {/* ── Soon bucket ─────────────────────────────────────────────────── */}
      <section className="card">
        <h3>Soon bucket</h3>
        <p className="muted">
          Seven questions from the sponsor&rsquo;s worksheet. Each one answered in dollars; the total is
          what has to be held conservatively.
        </p>

        <div className="grid three">
          <MoneyInput
            label="Annual income gap"
            valueCents={clientCase.soonInputs.annualIncomeGapCents}
            onChange={(annualIncomeGapCents) =>
              patch({ soonInputs: { ...clientCase.soonInputs, annualIncomeGapCents } })
            }
          />
          <NumberField
            label="Years of gap to cover"
            value={clientCase.soonInputs.incomeGapYears}
            min={0}
            hint="The workbook says 5 years in the label and multiplies by 10. Confirm with RIG."
            onChange={(years) =>
              patch({ soonInputs: { ...clientCase.soonInputs, incomeGapYears: years ?? 0 } })
            }
          />
          <MoneyInput
            label="Money to hold conservatively"
            valueCents={clientCase.soonInputs.conservativeReserveCents}
            onChange={(conservativeReserveCents) =>
              patch({ soonInputs: { ...clientCase.soonInputs, conservativeReserveCents } })
            }
          />
        </div>

        <GapRows
          title="Social Security bridge (delayed optimization)"
          entries={clientCase.soonInputs.socialSecurityBridges}
          onChange={(socialSecurityBridges) =>
            patch({ soonInputs: { ...clientCase.soonInputs, socialSecurityBridges } })
          }
        />

        <GapRows
          title="Additional healthcare gap"
          entries={clientCase.soonInputs.healthcareGaps}
          onChange={(healthcareGaps) =>
            patch({ soonInputs: { ...clientCase.soonInputs, healthcareGaps } })
          }
        />

        <GapRows
          title="Forced withdrawals from qualified accounts"
          entries={clientCase.soonInputs.forcedWithdrawals}
          onChange={(forcedWithdrawals) =>
            patch({ soonInputs: { ...clientCase.soonInputs, forcedWithdrawals } })
          }
        />

        <ExpenseRows
          title="Miscellaneous costs"
          expenses={clientCase.soonInputs.miscellaneousCosts}
          onChange={(miscellaneousCosts) =>
            patch({ soonInputs: { ...clientCase.soonInputs, miscellaneousCosts } })
          }
        />

        <WorksheetLines worksheet={totals.soon} />
      </section>

      {/* ── Result ──────────────────────────────────────────────────────── */}
      <section className="card">
        <h3>Resulting plan</h3>
        <p className="muted">
          Later is the remainder: total investable assets less Now and less Soon.
        </p>

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
            The Now and Soon buckets together ask for{' '}
            {formatCentsWhole(totals.now.totalCents + totals.soon.totalCents)} against{' '}
            {formatCentsWhole(totals.investableAssetsCents)} of investable assets, which leaves
            Later at {formatCentsWhole(totals.later.totalCents)}. The figures are shown as entered
            rather than clamped to zero — this is the conversation to have with the client.
          </Callout>
        )}

        <Callout tone="blocked" title="Life-stage targets not supplied">
          These totals come from the client&rsquo;s own numbers, not from a target for{' '}
          {LIFE_STAGE_LABELS[clientCase.lifeStage]}. RIG has not written down the Now / Soon / Later
          percentages for each stage of life, so there is nothing to compare against yet. US-10 is
          blocked on it.
        </Callout>
      </section>
    </div>
  );
}

/** The arithmetic behind a bucket total, with the workbook cell each line came from. */
function WorksheetLines({ worksheet }: { worksheet: ReturnType<typeof computePlanTotals>['now'] }) {
  return (
    <table className="worksheet">
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
            <td className="muted cell">{line.cell}</td>
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
  expenses,
  onChange,
}: {
  title: string;
  expenses: readonly PlannedExpense[];
  onChange: (next: readonly PlannedExpense[]) => void;
}) {
  return (
    <fieldset className="rows">
      <legend>{title}</legend>
      {expenses.length === 0 && <p className="muted">None entered.</p>}
      {expenses.map((expense) => (
        <div className="row" key={expense.id}>
          <TextField
            label="Event"
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
        </div>
      ))}
    </fieldset>
  );
}

function GapRows({
  title,
  entries,
  onChange,
}: {
  title: string;
  entries: readonly GapEntry[];
  onChange: (next: readonly GapEntry[]) => void;
}) {
  return (
    <fieldset className="rows">
      <legend>{title}</legend>
      {entries.length === 0 && <p className="muted">None entered.</p>}
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
        </div>
      ))}
    </fieldset>
  );
}
