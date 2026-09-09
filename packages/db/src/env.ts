import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config } from 'dotenv';

import { findRepoRoot } from './paths.js';

let loaded = false;

/**
 * Load the single repo-root .env. There is one .env for the whole monorepo, so
 * the API, the db scripts, and Vite all read the same values and cannot drift
 * apart. Values already present in the real environment win, which is what
 * lets CI and `NODE_ENV=test` override without editing files.
 */
export function loadRootEnv(): void {
  if (loaded) return;
  loaded = true;

  const envFile = resolve(findRepoRoot(), '.env');
  if (existsSync(envFile)) {
    config({ path: envFile, quiet: true });
  }
  // No .env is not fatal here — `npm run doctor` is what tells you to make one.
}
