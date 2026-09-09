import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Db } from './database.js';
import { seedDir } from './paths.js';

export interface SeedResult {
  loaded: string[];
}

/**
 * Load every .sql file in packages/db/seed, in filename order, as one
 * transaction.
 *
 * Seed data is development sample data only. It contains no real client
 * information and no personally identifying information of any kind — clients
 * are identified by a generated client number. See
 * docs/decisions/0006-no-pii-anywhere.md.
 */
export function runSeeds(db: Db, dir: string = seedDir()): SeedResult {
  if (!existsSync(dir)) return { loaded: [] };

  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  if (files.length === 0) return { loaded: [] };

  const load = db.transaction(() => {
    for (const filename of files) {
      db.exec(readFileSync(join(dir, filename), 'utf8'));
    }
  });
  load();

  return { loaded: files };
}
