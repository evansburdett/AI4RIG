import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type Db } from './database.js';
import { appliedMigrationCount, appliedMigrations, runMigrations } from './migrate.js';

let workspace: string;
let migrations: string;
let db: Db;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'ai4rig-migrate-'));
  migrations = join(workspace, 'migrations');
  mkdirSync(migrations, { recursive: true });
  db = openDatabase({ path: join(workspace, 'test.db') });
});

afterEach(() => {
  db.close();
  rmSync(workspace, { recursive: true, force: true });
});

function migration(filename: string, sql: string): void {
  writeFileSync(join(migrations, filename), sql);
}

describe('runMigrations', () => {
  it('applies files in numeric order and records them', () => {
    migration('0001_create_widget.sql', 'CREATE TABLE widget (id INTEGER PRIMARY KEY);');
    migration('0002_add_widget_label.sql', 'ALTER TABLE widget ADD COLUMN label TEXT;');

    const result = runMigrations(db, migrations);

    expect(result.applied).toEqual(['0001_create_widget.sql', '0002_add_widget_label.sql']);
    expect(appliedMigrationCount(db)).toBe(2);
    expect(appliedMigrations(db).map((row) => row.filename)).toEqual(result.applied);
  });

  it('is idempotent — a second run applies nothing', () => {
    migration('0001_create_widget.sql', 'CREATE TABLE widget (id INTEGER PRIMARY KEY);');
    runMigrations(db, migrations);

    const second = runMigrations(db, migrations);

    expect(second.applied).toEqual([]);
    expect(second.alreadyApplied).toEqual(['0001_create_widget.sql']);
    expect(appliedMigrationCount(db)).toBe(1);
  });

  it('applies only the new file when one is added later', () => {
    migration('0001_create_widget.sql', 'CREATE TABLE widget (id INTEGER PRIMARY KEY);');
    runMigrations(db, migrations);

    migration('0002_add_widget_label.sql', 'ALTER TABLE widget ADD COLUMN label TEXT;');
    const result = runMigrations(db, migrations);

    expect(result.applied).toEqual(['0002_add_widget_label.sql']);
  });

  it('rolls the whole file back when a statement fails', () => {
    migration(
      '0001_broken.sql',
      'CREATE TABLE good (id INTEGER PRIMARY KEY);\nCREATE TABLE bad (id INTEGER PRIMARY KEY;',
    );

    expect(() => runMigrations(db, migrations)).toThrow();

    const tables = db
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name);

    expect(tables).not.toContain('good');
    expect(appliedMigrationCount(db)).toBe(0);
  });

  it('refuses to run when an already-applied migration has been edited', () => {
    migration('0001_create_widget.sql', 'CREATE TABLE widget (id INTEGER PRIMARY KEY);');
    runMigrations(db, migrations);

    migration('0001_create_widget.sql', 'CREATE TABLE widget (id INTEGER PRIMARY KEY, oops TEXT);');

    expect(() => runMigrations(db, migrations)).toThrow(/has changed since it was applied/);
  });

  it('ignores CRLF-vs-LF when comparing checksums', () => {
    migration('0001_create_widget.sql', 'CREATE TABLE widget (id INTEGER PRIMARY KEY);\n');
    runMigrations(db, migrations);

    migration('0001_create_widget.sql', 'CREATE TABLE widget (id INTEGER PRIMARY KEY);\r\n');

    expect(() => runMigrations(db, migrations)).not.toThrow();
  });

  it('rejects filenames that do not follow the NNNN_name.sql convention', () => {
    migration('create-widget.sql', 'CREATE TABLE widget (id INTEGER PRIMARY KEY);');

    expect(() => runMigrations(db, migrations)).toThrow(/NNNN_short_description\.sql/);
  });

  it('treats an empty migrations folder as an up-to-date database', () => {
    const result = runMigrations(db, migrations);

    expect(result.applied).toEqual([]);
    expect(appliedMigrationCount(db)).toBe(0);
  });
});
