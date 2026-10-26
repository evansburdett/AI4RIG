/**
 * Client cases in and out of SQLite.
 *
 * This is the only file that knows how a ClientCase is spread across tables
 * (client_cases, people, accounts, account_lines,
 * proposal_positions, planned_expenses, gap_entries).
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
  HEALTH_CONCERNS,
  type Account,
  type ClientCase,
  type ClientSummary,
  type GapEntry,
  type Gender,
  type HealthConcern,
  type LifeExpectancySource,
  type Person,
  type PlannedExpense,
  type ProposalShare,
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
  proposal_locked_at: string | null;
  updated_at: string;
}

interface PersonRow {
  id: number;
  role: Person['role'];
  birth_year: number | null;
  gender: Gender | null;
  health_concern_other: string;
  life_expectancy_age: number | null;
  life_expectancy_source: LifeExpectancySource | null;
}

interface AccountRow {
  id: number;
  account_type: Account['accountType'];
  tax_funnel: Account['taxFunnel'];
  masked_number: string;
  balance_cents: number;
  model_id: number | null;
}

interface LineRow {
  account_id: number;
  ticker_symbol: string;
  amount_cents: number;
}

interface ProposalRow {
  account_id: number;
  bucket: ProposalShare['bucket'];
  ticker_symbol: string;
  shares: number;
  price_cents: number;
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

  const personRows = db
    .prepare<[number], PersonRow>(
      `SELECT id, role, birth_year, gender, health_concern_other, life_expectancy_age,
              life_expectancy_source
       FROM people WHERE client_case_id = ? ORDER BY role`,
    )
    .all(row.id);

  const concernRows = db
    .prepare<[number], { person_id: number; concern: HealthConcern }>(
      `SELECT c.person_id, c.concern
       FROM person_health_concerns c
       JOIN people p ON p.id = c.person_id
       WHERE p.client_case_id = ?`,
    )
    .all(row.id);

  const people = personRows.map(
    (p): Person => ({
      role: p.role,
      birthYear: p.birth_year,
      gender: p.gender,
      // Filtering HEALTH_CONCERNS rather than mapping the rows keeps the order
      // the same every read, whatever order the advisor ticked them in.
      healthConcerns: HEALTH_CONCERNS.filter((concern) =>
        concernRows.some((c) => c.person_id === p.id && c.concern === concern),
      ),
      healthConcernOther: p.health_concern_other,
      lifeExpectancyAge: p.life_expectancy_age,
      lifeExpectancySource: p.life_expectancy_source,
    }),
  );

  const lineRows = db
    .prepare<[number], LineRow>(
      `SELECT l.account_id, l.ticker_symbol, l.amount_cents
       FROM account_lines l JOIN accounts a ON a.id = l.account_id
       WHERE a.client_case_id = ?
       ORDER BY l.position, l.ticker_symbol`,
    )
    .all(row.id);

  const proposalRows = db
    .prepare<[number], ProposalRow>(
      `SELECT p.account_id, p.bucket, p.ticker_symbol, p.shares, p.price_cents
       FROM proposal_positions p JOIN accounts a ON a.id = p.account_id
       WHERE a.client_case_id = ?
       ORDER BY CASE p.bucket WHEN 'NOW' THEN 0 WHEN 'SOON' THEN 1 ELSE 2 END, p.ticker_symbol`,
    )
    .all(row.id);

  const accounts = db
    .prepare<[number], AccountRow>(
      `SELECT id, account_type, tax_funnel, masked_number, balance_cents, model_id
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
        modelId: a.model_id === null ? null : String(a.model_id),
        lines: lineRows
          .filter((l) => l.account_id === a.id)
          .map((l) => ({ tickerSymbol: l.ticker_symbol, amountCents: l.amount_cents })),
        proposalShares: proposalRows
          .filter((p) => p.account_id === a.id)
          .map((p) => ({
            bucket: p.bucket,
            tickerSymbol: p.ticker_symbol,
            shares: p.shares,
            priceCents: p.price_cents,
          })),
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
    proposalLockedAt: row.proposal_locked_at,
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

    db.prepare("INSERT INTO accounts (client_case_id, position, account_type) VALUES (?, 0, 'SINGLE')").run(caseId);

    return clientNumber;
  });

  const created = getClientCase(db, create());
  if (created === null) throw new Error('Created a client case and then could not read it back');
  return created;
}

/** An account can only follow a model that still exists. */
function checkAccountModels(db: Db, input: ClientCaseInput): void {
  const model = db.prepare<[number], { id: number }>('SELECT id FROM model_portfolios WHERE id = ?');
  input.accounts.forEach((account, index) => {
    if (account.modelId !== null && model.get(Number(account.modelId)) === undefined) {
      throw new HttpError(400, `Account ${index + 1}: model ${account.modelId} no longer exists`);
    }
  });
}

/**
 * An account can only hold symbols in RIG's universe. The foreign key would
 * refuse an unknown one anyway, but as an opaque constraint failure; catching
 * it here makes it a 400 that names the symbol. The screen offers to add an
 * unknown symbol (US-24) before it ever gets this far.
 */
function checkAccountTickers(db: Db, input: ClientCaseInput): void {
  const known = db.prepare<[string], { symbol: string }>(
    'SELECT symbol FROM tickers WHERE symbol = ?',
  );
  input.accounts.forEach((account, index) => {
    for (const line of account.lines) {
      if (known.get(line.tickerSymbol) === undefined) {
        throw new HttpError(400, `Account ${index + 1}: ${line.tickerSymbol} is not in the ticker list`);
      }
    }
    for (const share of account.proposalShares) {
      if (known.get(share.tickerSymbol) === undefined) {
        throw new HttpError(
          400,
          `Account ${index + 1}, ${share.bucket}: locked shares of ${share.tickerSymbol}, which is not in the ticker list`,
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

    checkAccountModels(db, input);
    checkAccountTickers(db, input);

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
         proposal_locked_at = @proposalLockedAt,
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
      proposalLockedAt: input.proposalLockedAt,
      updatedAt: now.toISOString(),
    });

    // Children: clear and rewrite. Funds and locked shares go with their accounts (cascade).
    for (const table of ['people', 'accounts', 'planned_expenses', 'gap_entries']) {
      db.prepare(`DELETE FROM ${table} WHERE client_case_id = ?`).run(caseId);
    }

    const addPerson = db.prepare(
      `INSERT INTO people (
         client_case_id, role, birth_year, gender, health_concern_other,
         life_expectancy_age, life_expectancy_source
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    // Deleting the people above already cascaded their concerns away.
    const addConcern = db.prepare(
      'INSERT INTO person_health_concerns (person_id, concern) VALUES (?, ?)',
    );
    for (const person of input.people) {
      const { lastInsertRowid } = addPerson.run(
        caseId,
        person.role,
        person.birthYear,
        person.gender,
        person.healthConcernOther,
        person.lifeExpectancyAge,
        person.lifeExpectancySource,
      );
      for (const concern of person.healthConcerns) {
        addConcern.run(Number(lastInsertRowid), concern);
      }
    }

    const addAccount = db.prepare(
      `INSERT INTO accounts (client_case_id, position, account_type, tax_funnel, masked_number, balance_cents, model_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const addLine = db.prepare(
      `INSERT INTO account_lines (account_id, position, ticker_symbol, amount_cents)
       VALUES (?, ?, ?, ?)`,
    );
    // Locked shares go with their account (cascade), so they are rewritten here too.
    const addProposalShare = db.prepare(
      `INSERT INTO proposal_positions (account_id, bucket, ticker_symbol, shares, price_cents)
       VALUES (?, ?, ?, ?, ?)`,
    );
    input.accounts.forEach((account, position) => {
      const { lastInsertRowid } = addAccount.run(
        caseId,
        position,
        account.accountType,
        account.taxFunnel,
        account.maskedNumber,
        account.balanceCents,
        account.modelId === null ? null : Number(account.modelId),
      );
      const accountId = Number(lastInsertRowid);
      account.lines.forEach((line, position) =>
        addLine.run(accountId, position, line.tickerSymbol, line.amountCents),
      );
      for (const share of account.proposalShares) {
        addProposalShare.run(accountId, share.bucket, share.tickerSymbol, share.shares, share.priceCents);
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

/** True if a case was deleted. Its people, accounts, and funds go with it. */
export function deleteClientCase(db: Db, clientNumber: string): boolean {
  return db.prepare('DELETE FROM client_cases WHERE client_number = ?').run(clientNumber).changes > 0;
}
