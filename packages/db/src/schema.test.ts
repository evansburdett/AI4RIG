import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type Db } from './database.js';
import { runMigrations } from './migrate.js';
import { runSeeds } from './seed.js';

/**
 * The real migrations and seeds, not synthetic ones. This is the check that
 * "npm run db:reset" works from an empty database on every machine, run as
 * part of "npm test" so a broken migration fails before review.
 */

let workspace: string;
let db: Db;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'ai4rig-schema-'));
  db = openDatabase({ path: join(workspace, 'test.db') });
});

afterEach(() => {
  db.close();
  rmSync(workspace, { recursive: true, force: true });
});

function tableNames(): string[] {
  return db
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => row.name);
}

describe('the repo migrations', () => {
  it('build the full schema from an empty database', () => {
    runMigrations(db);

    expect(tableNames()).toEqual([
      'account_sleeves',
      'accounts',
      'bucket_definitions',
      'client_cases',
      'gap_entries',
      'model_lines',
      'model_portfolios',
      'people',
      'planned_expenses',
      'schema_migrations',
      'tickers',
    ]);
  });

  it('ship the three bucket definitions as part of the schema', () => {
    runMigrations(db);

    const buckets = db
      .prepare<[], { bucket: string }>('SELECT bucket FROM bucket_definitions ORDER BY horizon_months')
      .all()
      .map((row) => row.bucket);

    expect(buckets).toEqual(['NOW', 'SOON', 'LATER']);
  });

  it('reject money in a bucket that does not exist', () => {
    runMigrations(db);
    db.exec(`
      INSERT INTO client_cases (id, client_number, created_at, updated_at) VALUES (1, '1', 'x', 'x');
      INSERT INTO accounts (id, client_case_id, account_type) VALUES (1, 1, 'IRA');
    `);

    expect(() =>
      db.exec("INSERT INTO account_sleeves (account_id, bucket, amount_cents) VALUES (1, 'SOMEDAY', 100)"),
    ).toThrow(/CHECK constraint/);
  });

  it('refuse to delete a ticker that a model uses', () => {
    runMigrations(db);
    runSeeds(db);

    expect(() => db.exec("DELETE FROM tickers WHERE symbol = 'VTI'")).toThrow(/FOREIGN KEY/);
    expect(() => db.exec("DELETE FROM tickers WHERE symbol = 'GLD'")).not.toThrow();
  });

  it('leave the money in place, with no model, when a model is deleted', () => {
    runMigrations(db);
    runSeeds(db);

    db.exec('DELETE FROM model_portfolios WHERE id = 9001');

    const nowSleeve = db
      .prepare<[], { amount_cents: number; model_id: number | null }>(
        "SELECT amount_cents, model_id FROM account_sleeves WHERE account_id = 9001 AND bucket = 'NOW'",
      )
      .get();
    expect(nowSleeve).toEqual({ amount_cents: 19_000_000, model_id: null });
  });

  it('delete a case together with everything under it', () => {
    runMigrations(db);
    runSeeds(db);

    db.prepare('DELETE FROM client_cases WHERE client_number = ?').run('1042');

    const orphans = db
      .prepare<[], { count: number }>(
        'SELECT COUNT(*) AS count FROM account_sleeves s JOIN accounts a ON a.id = s.account_id WHERE a.client_case_id = 9001',
      )
      .get();
    expect(orphans?.count).toBe(0);
  });
});

describe('the repo seed data', () => {
  it('loads onto a freshly migrated database, and loads again without error', () => {
    runMigrations(db);

    runSeeds(db);
    expect(() => runSeeds(db)).not.toThrow();

    const count = (table: string) =>
      db.prepare<[], { count: number }>(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count;
    expect(count('client_cases')).toBe(2);
    expect(count('account_sleeves')).toBe(15);
    expect(count('model_portfolios')).toBe(4);
  });

  it('puts case 1042 exactly on the workbook bucket totals', () => {
    runMigrations(db);
    runSeeds(db);

    const totals = db
      .prepare<[], { bucket: string; total: number }>(
        `SELECT s.bucket, SUM(s.amount_cents) AS total
         FROM account_sleeves s JOIN accounts a ON a.id = s.account_id
         WHERE a.client_case_id = 9001 GROUP BY s.bucket ORDER BY s.bucket`,
      )
      .all();
    expect(totals).toEqual([
      { bucket: 'LATER', total: 189_530_000 },
      { bucket: 'NOW', total: 19_000_000 },
      { bucket: 'SOON', total: 91_470_000 },
    ]);
  });

  it('passes the foreign key check', () => {
    runMigrations(db);
    runSeeds(db);

    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
});
