#!/usr/bin/env node
// @ts-check
/**
 * npm run desktop:build   (also the first step of desktop:start and desktop:dist)
 *
 * Prepares apps/desktop/stage: everything the installed app contains, and
 * nothing else. electron-builder packages this folder as it is.
 *
 *   main.mjs             Electron's main process, with the API, the database
 *                        code, and their dependencies bundled in
 *   web/                 the built front end, served by the API
 *   db/migrations/       every migration, run on each start
 *   db/reference-seed/   placeholder tickers and models, loaded once into a
 *                        new database (never the sample client cases)
 *   package.json         name, version, entry point, runtime dependencies
 *   node_modules/        the two packages that cannot be bundled
 *
 * The version comes from apps/desktop/package.json.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(desktopDir, '../..');
const stage = join(desktopDir, 'stage');
const isWindows = process.platform === 'win32';

/**
 * Not bundled: better-sqlite3 is native code (it ships a prebuilt binary for
 * every platform, so nothing is compiled), and electron-updater reads its own
 * files at run time.
 */
const RUNTIME_DEPENDENCIES = ['better-sqlite3', 'electron-updater'];

/** Reference data every new install starts with. 0003 is sample cases and stays out. */
const REFERENCE_SEEDS = ['0001_placeholder_tickers.sql', '0002_placeholder_models.sql'];

/** @param {string} command @param {string[]} args @param {import('node:child_process').SpawnSyncOptions} [options] */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: isWindows, ...options });
  if (result.status !== 0) throw new Error(`"${command} ${args.join(' ')}" failed`);
}

/** @param {string} file */
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** The installed version of a dependency, wherever npm put it. */
function installedVersion(name) {
  for (const dir of [join(desktopDir, 'node_modules', name), join(repoRoot, 'node_modules', name)]) {
    if (existsSync(join(dir, 'package.json'))) return readJson(join(dir, 'package.json')).version;
  }
  throw new Error(`${name} is not installed. Run "npm install" from the repo root.`);
}

const desktop = readJson(join(desktopDir, 'package.json'));
const step = (message) => console.log(`\n▸ ${message}`);

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

step('Building the front end for the desktop app');
run('npm', ['run', 'build', '--workspace', 'apps/web'], {
  cwd: repoRoot,
  // Talk to the address the page was loaded from: the API serves it.
  env: { ...process.env, VITE_API_SAME_ORIGIN: 'true' },
});
cpSync(join(repoRoot, 'apps/web/dist'), join(stage, 'web'), { recursive: true });

step('Bundling the main process and the API');
await build({
  entryPoints: [join(desktopDir, 'src/main.ts')],
  outfile: join(stage, 'main.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['electron', ...RUNTIME_DEPENDENCIES],
  // Express and friends are CommonJS and expect require, __dirname, and
  // __filename, which an ES module does not have.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "import { dirname as __pathDirname } from 'node:path';",
      'const require = __createRequire(import.meta.url);',
      'const __filename = __fileURLToPath(import.meta.url);',
      'const __dirname = __pathDirname(__filename);',
    ].join('\n'),
  },
  sourcemap: 'linked',
  legalComments: 'none',
  logLevel: 'warning',
});

step('Copying migrations and reference data');
cpSync(join(repoRoot, 'packages/db/migrations'), join(stage, 'db/migrations'), {
  recursive: true,
  filter: (source) => !source.endsWith('.md'),
});
mkdirSync(join(stage, 'db/reference-seed'), { recursive: true });
for (const file of REFERENCE_SEEDS) {
  cpSync(join(repoRoot, 'packages/db/seed', file), join(stage, 'db/reference-seed', file));
}

step('Installing runtime dependencies');
writeFileSync(
  join(stage, 'package.json'),
  `${JSON.stringify(
    {
      name: 'ai4rig',
      productName: desktop.productName,
      version: desktop.version,
      description: 'Bucket planning for Railroad Investment Group',
      author: desktop.author,
      license: 'UNLICENSED',
      private: true,
      type: 'module',
      main: 'main.mjs',
      dependencies: Object.fromEntries(RUNTIME_DEPENDENCIES.map((name) => [name, installedVersion(name)])),
    },
    null,
    2,
  )}\n`,
);
// Exact versions, matching what the repo was tested with, and no install
// scripts: neither package needs one.
run('npm', ['install', '--omit=dev', '--no-package-lock', '--no-audit', '--no-fund', '--ignore-scripts', '--workspaces=false'], {
  cwd: stage,
});

console.log(`\n✓ Staged ${desktop.productName} ${desktop.version} in ${stage}`);
