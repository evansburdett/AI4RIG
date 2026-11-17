/**
 * Carrying cases from one computer to another (RIG, 11/2): each install has
 * its own database, so one advisor exports cases to a file and another imports
 * them. Importing merges. It never replaces the whole database, and a case
 * number that is already here waits for the advisor's choice.
 */

import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

import type { Db } from '@ai4rig/db';
import type { CaseTransferFile, ClientReport, ImportCasesResult, ModelPortfolio } from '@ai4rig/shared';

import { HttpError } from '../errors.js';
import { checkedClientCaseSchema, modelPortfolioSchema, type ClientCaseInput } from '../validation.js';

import { getClientCase, listClientSummaries, nextClientNumber, saveClientCase } from './clientCases.js';
import { createModel, listModels } from './models.js';
import { getTicker, listTickers, upsertTicker, type TickerInput } from './referenceData.js';
import { addReport, listReports } from './reports.js';

export function exportCases(db: Db, clientNumbers?: readonly string[], now: Date = new Date()): CaseTransferFile {
  const wanted = clientNumbers === undefined ? null : new Set(clientNumbers);
  const cases = listClientSummaries(db)
    .filter((s) => wanted === null || wanted.has(s.clientNumber))
    .map((s) => getClientCase(db, s.clientNumber))
    .filter((c) => c !== null);

  const symbols = new Set(cases.flatMap((c) => c.accounts.flatMap((a) => a.lines.map((l) => l.tickerSymbol))));
  const modelIds = new Set(cases.flatMap((c) => c.accounts.map((a) => a.modelId).filter((id) => id !== null)));
  const models = listModels(db).filter((m) => modelIds.has(m.id));
  for (const model of models) for (const line of model.lines) symbols.add(line.tickerSymbol);

  return {
    kind: 'ai4rig-cases',
    version: 1,
    exportedAt: now.toISOString(),
    cases,
    reports: Object.fromEntries(cases.map((c) => [c.clientNumber, listReports(db, c.clientNumber) ?? []])),
    tickers: listTickers(db).filter((t) => symbols.has(t.symbol)),
    models,
  };
}

function insertCase(db: Db, clientNumber: string, now: Date): void {
  const timestamp = now.toISOString();
  db.prepare('INSERT INTO client_cases (client_number, created_at, updated_at) VALUES (?, ?, ?)').run(
    clientNumber,
    timestamp,
    timestamp,
  );
}

interface ImportOptions {
  readonly file: {
    readonly cases: readonly unknown[];
    readonly reports: Readonly<Record<string, readonly unknown[]>>;
    readonly tickers: readonly TickerInput[];
    readonly models: readonly unknown[];
  };
  readonly choices: Readonly<Record<string, 'SKIP' | 'REPLACE' | 'COPY'>>;
  readonly dryRun: boolean;
}

/** Check every case in the file before anything is written. */
function readCases(cases: readonly unknown[]): ClientCaseInput[] {
  return cases.map((raw, index) => {
    const parsed = checkedClientCaseSchema.safeParse(raw);
    if (!parsed.success) {
      const number = (raw as { clientNumber?: unknown } | null)?.clientNumber;
      throw new HttpError(
        400,
        `Case ${typeof number === 'string' ? number : `#${index + 1}`} in the file could not be read: ${parsed.error.issues[0]?.message ?? 'unknown problem'}`,
      );
    }
    return parsed.data;
  });
}

/**
 * Bring the file's cases in. A dry run only reports which numbers are new and
 * which are already here. Otherwise the database is backed up first, and then
 * everything goes in one transaction: tickers this computer lacks, models it
 * lacks (matched by name), then each case as chosen.
 */
export async function importCases(db: Db, options: ImportOptions, now: Date = new Date()): Promise<ImportCasesResult> {
  const cases = readCases(options.file.cases);
  const here = new Set(listClientSummaries(db).map((s) => s.clientNumber));
  const conflicts = cases.map((c) => c.clientNumber).filter((n) => here.has(n));
  const added = cases.map((c) => c.clientNumber).filter((n) => !here.has(n));

  if (options.dryRun) {
    return { added, conflicts, replaced: [], copied: {}, skipped: [], backupPath: null };
  }

  const backupDir = join(dirname(db.name), 'backups');
  mkdirSync(backupDir, { recursive: true });
  const backupPath = join(backupDir, `ai4rig-before-import-${now.toISOString().replace(/[:.]/g, '-')}.db`);
  await db.backup(backupPath);

  const replaced: string[] = [];
  const copied: Record<string, string> = {};
  const skipped: string[] = [];

  db.transaction(() => {
    for (const ticker of options.file.tickers) {
      if (getTicker(db, ticker.symbol) === null) upsertTicker(db, ticker, now);
    }

    // The file's model ids mean nothing here; its names do.
    const localByName = new Map(listModels(db).map((m) => [m.name.toLowerCase(), m.id]));
    const modelIdMap = new Map<string, string>();
    for (const raw of options.file.models) {
      const model = raw as ModelPortfolio;
      const parsed = modelPortfolioSchema.safeParse(raw);
      if (!parsed.success || typeof model.id !== 'string') continue;
      const local = localByName.get(parsed.data.name.toLowerCase());
      modelIdMap.set(model.id, local ?? createModel(db, parsed.data, now).id);
    }

    const reportsFor = (number: string) => (options.file.reports[number] ?? []) as readonly ClientReport[];

    for (const input of cases) {
      const choice = here.has(input.clientNumber) ? (options.choices[input.clientNumber] ?? 'SKIP') : 'ADD';
      if (choice === 'SKIP') {
        skipped.push(input.clientNumber);
        continue;
      }

      const target = choice === 'COPY' ? nextClientNumber(db) : input.clientNumber;
      if (choice !== 'REPLACE') insertCase(db, target, now);
      if (choice === 'REPLACE') db.prepare('DELETE FROM client_reports WHERE client_case_id = (SELECT id FROM client_cases WHERE client_number = ?)').run(target);

      saveClientCase(
        db,
        {
          ...input,
          clientNumber: target,
          accounts: input.accounts.map((account) => ({
            ...account,
            modelId: account.modelId === null ? null : (modelIdMap.get(account.modelId) ?? null),
          })),
        },
        now,
      );
      for (const report of reportsFor(input.clientNumber)) {
        addReport(db, target, { ...report.snapshot, clientNumber: target }, report.createdAt);
      }

      if (choice === 'REPLACE') replaced.push(target);
      if (choice === 'COPY') copied[input.clientNumber] = target;
    }
  })();

  return { added, conflicts, replaced, copied, skipped, backupPath };
}
