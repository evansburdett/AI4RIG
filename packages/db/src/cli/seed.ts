import { openDatabase } from '../database.js';
import { runSeeds } from '../seed.js';
import { seedDir } from '../paths.js';
import { loadRootEnv } from '../env.js';

loadRootEnv();

const db = openDatabase();
try {
  const result = runSeeds(db);

  if (result.loaded.length === 0) {
    console.log(`no seed files in ${seedDir()} yet — nothing to load`);
  } else {
    for (const filename of result.loaded) console.log(`loaded   ${filename}`);
    console.log(`${result.loaded.length} seed file(s) loaded`);
  }
} catch (error) {
  console.error(`\nSeeding failed.\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  db.close();
}
