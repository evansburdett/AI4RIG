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
      'accounts',
      'bucket_definitions',
      'client_cases',
      'gap_entries',
      'holdings',
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

  it('reject a holding in a bucket that does not exist', () => {
    runMigrations(db);
    db.exec(`
      INSERT INTO client_cases (id, client_number, created_at, updated_at) VALUES (1, '1', 'x', 'x');
      INSERT INTO accounts (id, client_case_id, account_type) VALUES (1, 1, 'IRA');
    `);

    expect(() =>
      db.exec(
        "INSERT INTO holdings (account_id, ticker_symbol, assigned_bucket) VALUES (1, 'VTI', 'SOMEDAY')",
      ),
    ).toThrow(/CHECK constraint/);
  });

  it('delete a case together with everything under it', () => {
    runMigrations(db);
    runSeeds(db);

    db.prepare('DELETE FROM client_cases WHERE client_number = ?').run('1042');

    const orphans = db
      .prepare<[], { count: number }>(
        'SELECT COUNT(*) AS count FROM holdings h JOIN accounts a ON a.id = h.account_id WHERE a.client_case_id = 9001',
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

    const cases = db.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM client_cases').get();
    const holdings = db.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM holdings').get();
    expect(cases?.count).toBe(2);
    expect(holdings?.count).toBe(13);
  });

  it('passes the foreign key check', () => {
    runMigrations(db);
    runSeeds(db);

    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
});
