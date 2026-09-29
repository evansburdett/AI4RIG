import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type Db } from './database.js';
import { runMigrations } from './migrate.js';
import { migrationsDir } from './paths.js';
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
      'person_health_concerns',
      'planned_expenses',
      'schema_migrations',
      'tickers',
    ]);
  });

  it('carry an existing health concern into its own table (US-27)', () => {
    // Build the schema as it stood before 0003, add a person the old way, then
    // let 0003 move them. This is the upgrade every teammate's database takes.
    const beforeUs27 = join(workspace, 'before-us27');
    mkdirSync(beforeUs27);
    for (const name of ['0001_original_test.sql', '0002_client_case_schema.sql']) {
      copyFileSync(join(migrationsDir(), name), join(beforeUs27, name));
    }
    runMigrations(db, beforeUs27);

    db.exec(`
      INSERT INTO client_cases (id, client_number, created_at, updated_at) VALUES (1, '1', 'x', 'x');
      INSERT INTO people (id, client_case_id, role, health_concern) VALUES (1, 1, 'CLIENT', 'HEART');
      INSERT INTO people (id, client_case_id, role, health_concern) VALUES (2, 1, 'SPOUSE', 'NONE');
    `);

    runMigrations(db);

    // HEART becomes a row; NONE becomes the absence of one.
    expect(
      db
        .prepare<[], { person_id: number; concern: string }>(
          'SELECT person_id, concern FROM person_health_concerns ORDER BY person_id',
        )
        .all(),
    ).toEqual([{ person_id: 1, concern: 'HEART' }]);

    // Both people survive the rebuild, ids and all.
    expect(
      db.prepare<[], { id: number }>('SELECT id FROM people ORDER BY id').all(),
    ).toEqual([{ id: 1 }, { id: 2 }]);
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
