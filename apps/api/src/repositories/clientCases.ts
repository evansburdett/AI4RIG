/**
 * Client cases in and out of SQLite.
 *
 * This is the only file that knows how a ClientCase is spread across tables
 * (client_cases, people, accounts, account_sleeves, planned_expenses,
 * gap_entries).
 * Routes call these functions and deal only in ClientCase objects.
 *
 * Saving replaces the case's child rows wholesale inside one transaction:
 * delete them, insert what was sent. A case is small (a handful of accounts
 * and worksheet lines) and is always edited as a whole on the profile screen,
 * so this is simpler and harder to get wrong than diffing rows. The cost is
 * that child ids change on every save; see the note in @ai4rig/shared.
 */

import type { Db } from '@ai4rig/db';
import {
  BUCKETS,
  type Account,
  type BucketSleeve,
  type ClientCase,
  type ClientSummary,
  type GapEntry,
  type Person,
  type PlannedExpense,
} from '@ai4rig/shared';

import { HttpError } from '../errors.js';
import type { ClientCaseInput } from '../validation.js';

/** First number handed out on an empty database. */
const FIRST_CLIENT_NUMBER = 1001;

type ExpenseKind = 'NOW_PLANNED' | 'SOON_MISCELLANEOUS';
type GapKind = 'SOCIAL_SECURITY_BRIDGE' | 'HEALTHCARE_GAP' | 'FORCED_WITHDRAWAL';

interface CaseRow {
  id: number;
  client_number: string;
  plan_number: number;
  initials: string;
  money_cycle_phase: ClientCase['moneyCyclePhase'];
  life_stage: ClientCase['lifeStage'];
  tax_bracket_pct: number | null;
  cash_on_hand_cents: number;
  spare_tire_cents: number;
  monthly_income_draw_cents: number;
  income_draw_months: number;
  bank_reserve_cents: number;
  annual_income_gap_cents: number;
  income_gap_years: number;
  conservative_reserve_cents: number;
  updated_at: string;
}

interface PersonRow {
  role: Person['role'];
  birth_year: number | null;
  health_concern: Person['healthConcern'];
  life_expectancy_age: number | null;
}

interface AccountRow {
  id: number;
  account_type: Account['accountType'];
  tax_funnel: Account['taxFunnel'];
  masked_number: string;
  balance_cents: number;
}

interface SleeveRow {
  account_id: number;
  bucket: BucketSleeve['bucket'];
  amount_cents: number;
  model_id: number | null;
}

interface ExpenseRow {
  id: number;
  kind: ExpenseKind;
  label: string;
  cost_cents: number;
}

interface GapRow {
  id: number;
  kind: GapKind;
  label: string;
  annual_amount_cents: number;
  years: number;
  multiplier: number;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function listClientSummaries(db: Db): ClientSummary[] {
  return db
    .prepare<[], { client_number: string; initials: string; life_stage: ClientSummary['lifeStage']; updated_at: string }>(
      `SELECT client_number, initials, life_stage, updated_at
       FROM client_cases
       ORDER BY client_number`,
    )
    .all()
    .map((row) => ({
      clientNumber: row.client_number,
      initials: row.initials,
      lifeStage: row.life_stage,
      updatedAt: row.updated_at,
    }));
}

export function getClientCase(db: Db, clientNumber: string): ClientCase | null {
  const row = db
    .prepare<[string], CaseRow>('SELECT * FROM client_cases WHERE client_number = ?')
    .get(clientNumber);
  if (row === undefined) return null;

  const people = db
    .prepare<[number], PersonRow>(
      `SELECT role, birth_year, health_concern, life_expectancy_age
       FROM people WHERE client_case_id = ? ORDER BY role`,
    )
    .all(row.id)
    .map(
      (p): Person => ({
        role: p.role,
        birthYear: p.birth_year,
        healthConcern: p.health_concern,
        lifeExpectancyAge: p.life_expectancy_age,
      }),
    );

  const sleeveRows = db
    .prepare<[number], SleeveRow>(
      `SELECT s.account_id, s.bucket, s.amount_cents, s.model_id
       FROM account_sleeves s JOIN accounts a ON a.id = s.account_id
       WHERE a.client_case_id = ?`,
    )
    .all(row.id);

  const accounts = db
    .prepare<[number], AccountRow>(
      `SELECT id, account_type, tax_funnel, masked_number, balance_cents
       FROM accounts WHERE client_case_id = ? ORDER BY position, id`,
    )
    .all(row.id)
    .map(
      (a): Account => ({
        id: String(a.id),
        accountType: a.account_type,
        taxFunnel: a.tax_funnel,
        maskedNumber: a.masked_number,
        balanceCents: a.balance_cents,
        // Always Now, Soon, Later, even if a row is somehow missing.
        sleeves: BUCKETS.map((bucket): BucketSleeve => {
          const sleeve = sleeveRows.find((s) => s.account_id === a.id && s.bucket === bucket);
          return {
            bucket,
            amountCents: sleeve?.amount_cents ?? 0,
            modelId: sleeve?.model_id == null ? null : String(sleeve.model_id),
          };
        }),
      }),
    );

  const expenses = db
    .prepare<[number], ExpenseRow>(
      `SELECT id, kind, label, cost_cents
       FROM planned_expenses WHERE client_case_id = ? ORDER BY position, id`,
    )
    .all(row.id);

  const gaps = db
    .prepare<[number], GapRow>(
      `SELECT id, kind, label, annual_amount_cents, years, multiplier
       FROM gap_entries WHERE client_case_id = ? ORDER BY position, id`,
    )
    .all(row.id);

  const expensesOf = (kind: ExpenseKind): PlannedExpense[] =>
    expenses
      .filter((e) => e.kind === kind)
      .map((e) => ({ id: String(e.id), label: e.label, costCents: e.cost_cents }));

  const gapsOf = (kind: GapKind): GapEntry[] =>
    gaps
      .filter((g) => g.kind === kind)
      .map((g) => ({
        id: String(g.id),
        label: g.label,
        annualAmountCents: g.annual_amount_cents,
        years: g.years,
        multiplier: g.multiplier,
      }));

  return {
    clientNumber: row.client_number,
    initials: row.initials,
    planNumber: row.plan_number,
    people,
    moneyCyclePhase: row.money_cycle_phase,
    lifeStage: row.life_stage,
    taxBracketPct: row.tax_bracket_pct,
    accounts,
    cashOnHandCents: row.cash_on_hand_cents,
    spareTireCents: row.spare_tire_cents,
    nowInputs: {
      monthlyIncomeDrawCents: row.monthly_income_draw_cents,
      incomeDrawMonths: row.income_draw_months,
      bankReserveCents: row.bank_reserve_cents,
      plannedExpenses: expensesOf('NOW_PLANNED'),
    },
    soonInputs: {
      annualIncomeGapCents: row.annual_income_gap_cents,
      incomeGapYears: row.income_gap_years,
      socialSecurityBridges: gapsOf('SOCIAL_SECURITY_BRIDGE'),
      healthcareGaps: gapsOf('HEALTHCARE_GAP'),
      miscellaneousCosts: expensesOf('SOON_MISCELLANEOUS'),
      forcedWithdrawals: gapsOf('FORCED_WITHDRAWAL'),
      conservativeReserveCents: row.conservative_reserve_cents,
    },
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * The next unused client number (US-02). Numbers are handed out by the server,
 * never typed by the advisor, so two advisors on the LAN cannot pick the same
 * one. Non-numeric numbers, if anyone ever adds one by hand, are skipped.
 */
function nextClientNumber(db: Db): string {
  const row = db
    .prepare<[], { highest: number | null }>(
      `SELECT MAX(CAST(client_number AS INTEGER)) AS highest
       FROM client_cases
       WHERE client_number NOT GLOB '*[^0-9]*'`,
    )
    .get();
  const highest = row?.highest ?? null;
  return String(highest === null ? FIRST_CLIENT_NUMBER : Math.max(highest + 1, FIRST_CLIENT_NUMBER));
}

/** A blank case: client and spouse with nothing filled in, one empty account. */
export function createClientCase(db: Db, now: Date = new Date()): ClientCase {
  const create = db.transaction((): string => {
    const clientNumber = nextClientNumber(db);
    const timestamp = now.toISOString();

    const { lastInsertRowid } = db
      .prepare(
        'INSERT INTO client_cases (client_number, created_at, updated_at) VALUES (?, ?, ?)',
      )
      .run(clientNumber, timestamp, timestamp);
    const caseId = Number(lastInsertRowid);

    const addPerson = db.prepare('INSERT INTO people (client_case_id, role) VALUES (?, ?)');
    addPerson.run(caseId, 'CLIENT');
    addPerson.run(caseId, 'SPOUSE');

    const account = db
      .prepare("INSERT INTO accounts (client_case_id, position, account_type) VALUES (?, 0, 'SINGLE')")
      .run(caseId);
    const addSleeve = db.prepare('INSERT INTO account_sleeves (account_id, bucket) VALUES (?, ?)');
    for (const bucket of BUCKETS) addSleeve.run(Number(account.lastInsertRowid), bucket);

    return clientNumber;
  });

  const created = getClientCase(db, create());
  if (created === null) throw new Error('Created a client case and then could not read it back');
  return created;
}

/**
 * A sleeve can only follow a model that exists and is for the same bucket:
 * Now money in a Later model is almost certainly a mis-click.
 */
function checkSleeveModels(db: Db, input: ClientCaseInput): void {
  const modelBucket = db.prepare<[number], { bucket: string; name: string }>(
    'SELECT bucket, name FROM model_portfolios WHERE id = ?',
  );
  input.accounts.forEach((account, index) => {
    for (const sleeve of account.sleeves) {
      if (sleeve.modelId === null) continue;
      const model = modelBucket.get(Number(sleeve.modelId));
      if (model === undefined) {
        throw new HttpError(400, `Account ${index + 1}: model ${sleeve.modelId} no longer exists`);
      }
      if (model.bucket !== sleeve.bucket) {
        throw new HttpError(
          400,
          `Account ${index + 1}: "${model.name}" is a ${model.bucket} model, not ${sleeve.bucket}`,
        );
      }
    }
  });
}

/**
 * Overwrite a case with `input`. Returns null if no case has that number.
 * Everything happens in one transaction: a failure leaves the case as it was.
 */
export function saveClientCase(
  db: Db,
  input: ClientCaseInput,
  now: Date = new Date(),
): ClientCase | null {
  const save = db.transaction((): boolean => {
    const existing = db
      .prepare<[string], { id: number }>('SELECT id FROM client_cases WHERE client_number = ?')
      .get(input.clientNumber);
    if (existing === undefined) return false;
    const caseId = existing.id;

    checkSleeveModels(db, input);

    db.prepare(
      `UPDATE client_cases SET
         plan_number = @planNumber,
         initials = @initials,
         money_cycle_phase = @moneyCyclePhase,
         life_stage = @lifeStage,
         tax_bracket_pct = @taxBracketPct,
         cash_on_hand_cents = @cashOnHandCents,
         spare_tire_cents = @spareTireCents,
         monthly_income_draw_cents = @monthlyIncomeDrawCents,
         income_draw_months = @incomeDrawMonths,
         bank_reserve_cents = @bankReserveCents,
         annual_income_gap_cents = @annualIncomeGapCents,
         income_gap_years = @incomeGapYears,
         conservative_reserve_cents = @conservativeReserveCents,
         updated_at = @updatedAt
       WHERE id = @caseId`,
    ).run({
      caseId,
      planNumber: input.planNumber,
      initials: input.initials,
      moneyCyclePhase: input.moneyCyclePhase,
      lifeStage: input.lifeStage,
      taxBracketPct: input.taxBracketPct,
      cashOnHandCents: input.cashOnHandCents,
      spareTireCents: input.spareTireCents,
      monthlyIncomeDrawCents: input.nowInputs.monthlyIncomeDrawCents,
      incomeDrawMonths: input.nowInputs.incomeDrawMonths,
      bankReserveCents: input.nowInputs.bankReserveCents,
      annualIncomeGapCents: input.soonInputs.annualIncomeGapCents,
      incomeGapYears: input.soonInputs.incomeGapYears,
      conservativeReserveCents: input.soonInputs.conservativeReserveCents,
      updatedAt: now.toISOString(),
    });

    // Children: clear and rewrite. Sleeves go with their accounts (cascade).
    for (const table of ['people', 'accounts', 'planned_expenses', 'gap_entries']) {
      db.prepare(`DELETE FROM ${table} WHERE client_case_id = ?`).run(caseId);
    }

    const addPerson = db.prepare(
      `INSERT INTO people (client_case_id, role, birth_year, health_concern, life_expectancy_age)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const person of input.people) {
      addPerson.run(caseId, person.role, person.birthYear, person.healthConcern, person.lifeExpectancyAge);
    }

    const addAccount = db.prepare(
      `INSERT INTO accounts (client_case_id, position, account_type, tax_funnel, masked_number, balance_cents)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const addSleeve = db.prepare(
      'INSERT INTO account_sleeves (account_id, bucket, amount_cents, model_id) VALUES (?, ?, ?, ?)',
    );
    input.accounts.forEach((account, position) => {
      const { lastInsertRowid } = addAccount.run(
        caseId,
        position,
        account.accountType,
        account.taxFunnel,
        account.maskedNumber,
        account.balanceCents,
      );
      for (const sleeve of account.sleeves) {
        addSleeve.run(
          Number(lastInsertRowid),
          sleeve.bucket,
          sleeve.amountCents,
          sleeve.modelId === null ? null : Number(sleeve.modelId),
        );
      }
    });

    const addExpense = db.prepare(
      `INSERT INTO planned_expenses (client_case_id, kind, position, label, cost_cents)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const writeExpenses = (kind: ExpenseKind, expenses: readonly { label: string; costCents: number }[]) =>
      expenses.forEach((e, position) => addExpense.run(caseId, kind, position, e.label, e.costCents));
    writeExpenses('NOW_PLANNED', input.nowInputs.plannedExpenses);
    writeExpenses('SOON_MISCELLANEOUS', input.soonInputs.miscellaneousCosts);

    const addGap = db.prepare(
      `INSERT INTO gap_entries (client_case_id, kind, position, label, annual_amount_cents, years, multiplier)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const writeGaps = (
      kind: GapKind,
      entries: readonly { label: string; annualAmountCents: number; years: number; multiplier: number }[],
    ) =>
      entries.forEach((g, position) =>
        addGap.run(caseId, kind, position, g.label, g.annualAmountCents, g.years, g.multiplier),
      );
    writeGaps('SOCIAL_SECURITY_BRIDGE', input.soonInputs.socialSecurityBridges);
    writeGaps('HEALTHCARE_GAP', input.soonInputs.healthcareGaps);
    writeGaps('FORCED_WITHDRAWAL', input.soonInputs.forcedWithdrawals);

    return true;
  });

  return save() ? getClientCase(db, input.clientNumber) : null;
}

/** True if a case was deleted. Its people, accounts, sleeves, and lines go with it. */
export function deleteClientCase(db: Db, clientNumber: string): boolean {
  return db.prepare('DELETE FROM client_cases WHERE client_number = ?').run(clientNumber).changes > 0;
}
