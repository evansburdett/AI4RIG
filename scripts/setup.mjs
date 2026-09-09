#!/usr/bin/env node
// @ts-check
/**
 * npm run setup
 *
 * One command for a fresh clone: make a .env, install, build the database,
 * then run doctor to confirm. Safe to run again any time.
 *
 * Like doctor.mjs, this uses only Node built-ins, because it is what runs
 * before anything is installed.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function step(message) {
  console.log(`\n=== ${message}`);
}

function run(args) {
  const result = spawnSync(npm, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    // .cmd files on Windows need a shell; POSIX does not, and not using one
    // there keeps arguments from being re-parsed.
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    console.error(`\nsetup stopped: "npm ${args.join(' ')}" exited with ${result.status ?? 'a signal'}.`);
    process.exit(result.status ?? 1);
  }
}

// --- Node version ----------------------------------------------------------
// Check before installing, because a wrong major means better-sqlite3 gets
// built against the wrong ABI and the failure looks unrelated later.

const wanted = readFileSync(resolve(repoRoot, '.nvmrc'), 'utf8').trim().replace(/^v/, '');
const wantedMajor = wanted.split('.')[0];
const actualMajor = process.versions.node.split('.')[0];

if (wantedMajor !== actualMajor) {
  console.error(
    `\nThis repo runs on Node ${wantedMajor} (.nvmrc pins ${wanted}); you are on ${process.versions.node}.\n\n` +
      `  macOS:      nvm install ${wanted} && nvm use ${wanted}\n` +
      `  PowerShell: nvm install ${wanted}; nvm use ${wanted}\n\n` +
      'Then run "npm run setup" again.\n',
  );
  process.exit(1);
}

// --- .env ------------------------------------------------------------------

step('Environment file');

const envPath = resolve(repoRoot, '.env');
if (existsSync(envPath)) {
  console.log('.env already exists - leaving it alone');
} else {
  copyFileSync(resolve(repoRoot, '.env.example'), envPath);
  console.log('created .env from .env.example');
}

// --- Dependencies ----------------------------------------------------------

step('Installing dependencies (npm install)');
run(['install']);

// --- Database --------------------------------------------------------------

step('Building your local database (npm run db:reset)');
run(['run', 'db:reset']);

// --- Verify ----------------------------------------------------------------

step('Checking the result (npm run doctor)');
run(['run', 'doctor']);

console.log('\nSetup finished. Start everything with:\n\n  npm run dev\n');
