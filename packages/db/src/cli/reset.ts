import { rmSync } from 'node:fs';

import { openDatabase } from '../database.js';
import { runMigrations } from '../migrate.js';
import { runSeeds } from '../seed.js';
import { resolveDatabasePath } from '../paths.js';
import { loadRootEnv } from '../env.js';

/**
 * Delete this machine's database file and build it again from migrations and
 * seed data. Local databases are disposable — nobody's work lives in one. When
 * something is confusing, resetting is the cheap first move.
 */
loadRootEnv();

const file = resolveDatabasePath();

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run db:reset with NODE_ENV=production. This deletes the database file.');
  process.exit(1);
}

// -wal and -shm are WAL sidecar files; leaving them behind confuses SQLite.
for (const path of [file, `${file}-wal`, `${file}-shm`, `${file}-journal`]) {
  rmSync(path, { force: true });
}
console.log(`deleted  ${file}`);

const db = openDatabase();
try {
  const migrated = runMigrations(db);
  for (const warning of migrated.warnings) console.warn(`warning: ${warning}`);
  for (const filename of migrated.applied) console.log(`applied  ${filename}`);

  const seeded = runSeeds(db);
  for (const filename of seeded.loaded) console.log(`loaded   ${filename}`);

  console.log(
    `rebuilt  ${file}\n         ${migrated.applied.length} migration(s), ${seeded.loaded.length} seed file(s)`,
  );
} catch (error) {
  console.error(`\nReset failed.\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  db.close();
}
