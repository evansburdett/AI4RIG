import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

import { loadRootEnv } from './env.js';
import { resolveDatabasePath } from './paths.js';

export type Db = Database.Database;

export interface OpenOptions {
  /** Override DATABASE_PATH. Tests pass a temp file here. */
  path?: string;
  /** Open without allowing writes. */
  readonly?: boolean;
}

/**
 * Open the SQLite database, creating the containing folder if needed.
 *
 * The pragmas below are deliberate:
 *  - foreign_keys is OFF by default in SQLite. We want constraint violations
 *    to fail loudly in development, not silently on the advisor's machine.
 *  - WAL lets a reader and a writer work at the same time, which is what host
 *    mode at RIG needs.
 */
export function openDatabase(options: OpenOptions = {}): Db {
  loadRootEnv();

  const file = options.path ?? resolveDatabasePath();
  mkdirSync(dirname(file), { recursive: true });

  const db = new Database(file, options.readonly ? { readonly: true } : {});

  if (!options.readonly) {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  return db;
}
