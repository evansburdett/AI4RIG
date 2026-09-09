import { openDatabase } from '../database.js';
import { runMigrations } from '../migrate.js';
import { resolveDatabasePath } from '../paths.js';
import { loadRootEnv } from '../env.js';

loadRootEnv();

const db = openDatabase();
try {
  const result = runMigrations(db);

  console.log(`database: ${resolveDatabasePath()}`);
  for (const warning of result.warnings) console.warn(`warning: ${warning}`);

  if (result.applied.length === 0) {
    console.log(`up to date (${result.alreadyApplied.length} migration(s) already applied)`);
  } else {
    for (const filename of result.applied) console.log(`applied  ${filename}`);
    console.log(`${result.applied.length} migration(s) applied, ${result.alreadyApplied.length} already up to date`);
  }
} catch (error) {
  console.error(`\nMigration failed.\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  db.close();
}
