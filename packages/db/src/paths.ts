import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Walk upward until we find the workspace root — the package.json that
 * declares `workspaces`. Every path in the project is resolved from there, so
 * a script behaves the same whether you run it from the repo root or from
 * inside a workspace folder.
 */
export function findRepoRoot(startDir = dirname(fileURLToPath(import.meta.url))): string {
  let dir = startDir;

  for (;;) {
    const candidate = resolve(dir, 'package.json');
    if (existsSync(candidate)) {
      try {
        const pkg: unknown = JSON.parse(readFileSync(candidate, 'utf8'));
        if (pkg && typeof pkg === 'object' && 'workspaces' in pkg) return dir;
      } catch {
        // Unparseable package.json on the way up: keep walking.
      }
    }

    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        'Could not find the repo root (no package.json with a "workspaces" field above ' +
          `${startDir}). Are you running this from inside the AI4RIG repo?`,
      );
    }
    dir = parent;
  }
}

/** Absolute path to packages/db/migrations. */
export function migrationsDir(): string {
  return resolve(findRepoRoot(), 'packages/db/migrations');
}

/** Absolute path to packages/db/seed. */
export function seedDir(): string {
  return resolve(findRepoRoot(), 'packages/db/seed');
}

/**
 * Absolute path to this machine's SQLite file.
 *
 * DATABASE_PATH in .env is relative to the repo root. Each developer has their
 * own file; it is gitignored and disposable (`npm run db:reset` rebuilds it).
 */
export function resolveDatabasePath(databasePath = process.env.DATABASE_PATH): string {
  const configured = databasePath?.trim() || './data/ai4rig.db';
  return isAbsolute(configured) ? configured : resolve(findRepoRoot(), configured);
}
