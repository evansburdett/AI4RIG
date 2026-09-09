import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Db } from './database.js';
import { migrationsDir } from './paths.js';

/** Migration filenames look like 0001_short_description.sql */
const FILENAME_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;

export interface MigrationRecord {
  filename: string;
  checksum: string;
  applied_at: string;
}

export interface MigrateResult {
  /** Files applied by this run. */
  applied: string[];
  /** Files that were already recorded and were left alone. */
  alreadyApplied: string[];
  /** Non-fatal problems worth printing. */
  warnings: string[];
}

/**
 * Line endings are normalised before hashing so a Windows checkout produces
 * the same checksum as a macOS one even if .gitattributes is ever bypassed.
 */
function checksumOf(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

function ensureMigrationsTable(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      checksum   TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

/** Every migration recorded as applied, in the order it was applied. */
export function appliedMigrations(db: Db): MigrationRecord[] {
  ensureMigrationsTable(db);
  return db
    .prepare<[], MigrationRecord>(
      'SELECT filename, checksum, applied_at FROM schema_migrations ORDER BY filename',
    )
    .all();
}

/** How many migrations this database has had applied. Used by /api/health. */
export function appliedMigrationCount(db: Db): number {
  ensureMigrationsTable(db);
  const row = db.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM schema_migrations').get();
  return row?.count ?? 0;
}

function listMigrationFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((name) => name.endsWith('.sql'));

  const misnamed = files.filter((name) => !FILENAME_PATTERN.test(name));
  if (misnamed.length > 0) {
    throw new Error(
      `Migration files must be named NNNN_short_description.sql (lowercase, underscores). ` +
        `Rename: ${misnamed.join(', ')}`,
    );
  }

  // Zero-padded numeric prefixes mean a plain string sort is the apply order.
  return files.sort();
}

/**
 * Apply every migration that has not been applied yet, in filename order, each
 * one inside its own transaction. Running it twice is a no-op, so it is safe
 * to run on every `git pull`.
 *
 * A migration that is already on main is frozen: if the file on disk no longer
 * matches the checksum recorded when it ran, this throws instead of silently
 * leaving databases in different shapes across four laptops. Write a new
 * migration instead. See packages/db/migrations/README.md.
 */
export function runMigrations(db: Db, dir: string = migrationsDir()): MigrateResult {
  ensureMigrationsTable(db);

  const files = listMigrationFiles(dir);
  const recorded = new Map(appliedMigrations(db).map((row) => [row.filename, row]));

  const result: MigrateResult = { applied: [], alreadyApplied: [], warnings: [] };

  for (const filename of recorded.keys()) {
    if (!files.includes(filename)) {
      result.warnings.push(
        `${filename} is recorded in schema_migrations but is no longer in ${dir}. ` +
          `If it was deleted after reaching main, your database no longer matches the repo — run "npm run db:reset".`,
      );
    }
  }

  const insert = db.prepare(
    'INSERT INTO schema_migrations (filename, checksum, applied_at) VALUES (?, ?, ?)',
  );

  // Highest migration this database has already seen, used to spot two
  // branches that both claimed the same number range.
  const highestApplied = [...recorded.keys()].sort().at(-1);

  for (const filename of files) {
    const sql = readFileSync(join(dir, filename), 'utf8');
    const checksum = checksumOf(sql);
    const previous = recorded.get(filename);

    if (previous) {
      if (previous.checksum !== checksum) {
        throw new Error(
          `${filename} has changed since it was applied to this database.\n` +
            `A migration that has reached main is frozen — editing it means four laptops end up with ` +
            `four different schemas. Write a new migration that alters the table instead.\n` +
            `If you are still developing this migration locally and it has NOT been pushed, run "npm run db:reset".`,
        );
      }
      result.alreadyApplied.push(filename);
      continue;
    }

    if (highestApplied && highestApplied > filename) {
      result.warnings.push(
        `${filename} sorts before ${highestApplied}, which is already applied. Two branches probably ` +
          `claimed overlapping numbers. It will still be applied, but renumber before merging.`,
      );
    }

    // DDL is transactional in SQLite: a migration that throws halfway leaves
    // the database exactly as it was, and nothing is recorded.
    const apply = db.transaction(() => {
      db.exec(sql);
      insert.run(filename, checksum, new Date().toISOString());
    });
    apply();

    result.applied.push(filename);
  }

  return result;
}
