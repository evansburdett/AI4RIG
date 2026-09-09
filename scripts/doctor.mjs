#!/usr/bin/env node
// @ts-check
/**
 * npm run doctor
 *
 * Answers "why doesn't it work on my machine?" without anyone having to ask.
 *
 * Hard rule: this file uses only Node built-ins and must run *before*
 * `npm install` has ever happened, because "you haven't installed yet" is one
 * of the things it needs to be able to tell you. Do not add an import from
 * node_modules to this file.
 */

import { createServer } from 'node:net';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';

const GREEN = '\u001b[32m';
const RED = '\u001b[31m';
const YELLOW = '\u001b[33m';
const DIM = '\u001b[2m';
const RESET = '\u001b[0m';
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (color, text) => (useColor ? `${color}${text}${RESET}` : text);

const results = [];

function record(name, ok, detail, fix) {
  results.push({ name, ok, detail, ...(fix ? { fix } : {}) });
}

function warn(name, detail, fix) {
  results.push({ name, ok: true, warn: true, detail, ...(fix ? { fix } : {}) });
}

const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

// ---------------------------------------------------------------------------
// 1. Node version
// ---------------------------------------------------------------------------

if (!existsSync(resolve(repoRoot, '.nvmrc'))) {
  record('Node version', false, '.nvmrc is missing from the repo root', {
    both: 'git checkout .nvmrc',
  });
} else {
  const wanted = read('.nvmrc').trim().replace(/^v/, '');
  const expectedMajor = Number(wanted.split('.')[0]);
  const actual = process.versions.node;
  const actualMajor = Number(actual.split('.')[0]);

  if (actualMajor === expectedMajor) {
    const exact = actual === wanted ? '' : ` (repo pins ${wanted}; same major, fine)`;
    record('Node version', true, `v${actual}${exact}`);
  } else {
    record(
      'Node version',
      false,
      `running v${actual}, repo needs v${expectedMajor}.x (.nvmrc says ${wanted})`,
      {
        mac: `nvm install ${wanted} && nvm use ${wanted}`,
        windows: `nvm install ${wanted}; nvm use ${wanted}`,
      },
    );
  }
}

// ---------------------------------------------------------------------------
// 2. Dependencies installed
// ---------------------------------------------------------------------------

const workspaces = ['apps/api', 'apps/web', 'apps/desktop', 'packages/engine', 'packages/db'];

if (!existsSync(resolve(repoRoot, 'node_modules'))) {
  record('Dependencies', false, 'node_modules is missing - nothing is installed yet', {
    both: 'npm install',
  });
} else {
  const missingLinks = workspaces
    .filter((ws) => existsSync(resolve(repoRoot, ws, 'package.json')))
    .map((ws) => JSON.parse(read(`${ws}/package.json`)).name)
    .filter((name) => name && !existsSync(resolve(repoRoot, 'node_modules', name)));

  if (missingLinks.length > 0) {
    record('Dependencies', false, `workspace links missing: ${missingLinks.join(', ')}`, {
      both: 'npm install',
    });
  } else if (!existsSync(resolve(repoRoot, 'package-lock.json'))) {
    warn('Dependencies', 'installed, but package-lock.json is missing - versions are not pinned', {
      both: 'npm install && git add package-lock.json',
    });
  } else {
    record('Dependencies', true, 'node_modules present, workspaces linked');
  }
}

// better-sqlite3 is the one native module in the project, so when an install
// goes wrong it is almost always this. Mirror the same lookup the library
// itself does (node_modules/better-sqlite3/lib/binding.js): a shipped prebuild
// for this platform first, then a locally compiled node-gyp build.
if (existsSync(resolve(repoRoot, 'node_modules'))) {
  const sqliteDir = resolve(repoRoot, 'node_modules/better-sqlite3');
  const prebuild = resolve(sqliteDir, `prebuilds/${process.platform}-${process.arch}.node`);
  const built = ['build/Release/better_sqlite3.node', 'build/Debug/better_sqlite3.node'].map((rel) =>
    resolve(sqliteDir, rel),
  );

  if (!existsSync(sqliteDir)) {
    record('better-sqlite3', false, 'not installed', { both: 'npm install' });
  } else if (existsSync(prebuild)) {
    record('better-sqlite3', true, `prebuilt binary for ${process.platform}-${process.arch}`);
  } else if (built.some((path) => existsSync(path))) {
    record('better-sqlite3', true, 'compiled from source');
  } else {
    record(
      'better-sqlite3',
      false,
      `no native binding for ${process.platform}-${process.arch} - it must be compiled`,
      {
        mac: 'xcode-select --install ; npm rebuild better-sqlite3 --build-from-source',
        windows:
          'Install "Desktop development with C++" from the Visual Studio Build Tools installer, then: npm rebuild better-sqlite3 --build-from-source',
      },
    );
  }
}

// ---------------------------------------------------------------------------
// 3 and 4. .env exists, and has every key that .env.example lists
// ---------------------------------------------------------------------------

const keysOf = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('=')[0].trim())
    .filter(Boolean);

const envExamplePath = resolve(repoRoot, '.env.example');
const envPath = resolve(repoRoot, '.env');
const env = {};

if (!existsSync(envExamplePath)) {
  record('.env.example', false, 'missing from the repo root', { both: 'git checkout .env.example' });
} else if (!existsSync(envPath)) {
  record('.env file', false, '.env does not exist', {
    mac: 'cp .env.example .env',
    windows: 'Copy-Item .env.example .env',
  });
} else {
  record('.env file', true, '.env exists');

  for (const line of read('.env').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index > 0) env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }

  const expected = keysOf(read('.env.example'));
  const missing = expected.filter((key) => !(key in env));
  const blank = expected.filter((key) => key in env && env[key] === '');

  if (missing.length > 0) {
    record('.env keys', false, `missing: ${missing.join(', ')}`, {
      mac: `printf '%s\\n' ${missing.map((k) => `'${k}=...'`).join(' ')} >> .env     # copy the values from .env.example`,
      windows: `Add-Content .env @(${missing.map((k) => `'${k}=...'`).join(', ')})     # copy the values from .env.example`,
    });
  } else if (blank.length > 0) {
    warn('.env keys', `present but empty: ${blank.join(', ')}`, {
      both: 'give each one a value, copying from .env.example',
    });
  } else {
    record('.env keys', true, `all ${expected.length} keys from .env.example are set`);
  }
}

// ---------------------------------------------------------------------------
// 5. Database file
// ---------------------------------------------------------------------------

const configuredDbPath = env.DATABASE_PATH || './data/ai4rig.db';
const dbPath = isAbsolute(configuredDbPath) ? configuredDbPath : resolve(repoRoot, configuredDbPath);
const dbDisplay = relative(repoRoot, dbPath) || dbPath;

if (!existsSync(dbPath)) {
  record('Database file', false, `${dbDisplay} does not exist`, { both: 'npm run db:reset' });
} else if (statSync(dbPath).size === 0) {
  record('Database file', false, `${dbDisplay} exists but is empty (0 bytes)`, {
    both: 'npm run db:reset',
  });
} else {
  record('Database file', true, `${dbDisplay} (${(statSync(dbPath).size / 1024).toFixed(0)} KB)`);
}

// ---------------------------------------------------------------------------
// 6. Ports
// ---------------------------------------------------------------------------

const apiPort = Number(env.API_PORT || 3001);
const apiHost = env.API_HOST || '127.0.0.1';

/** Resolves to null if the port is free, or an error code string if it is not. */
function probePort(port, host) {
  return new Promise((done) => {
    const server = createServer();
    server.once('error', (error) => done(error.code ?? 'EUNKNOWN'));
    server.once('listening', () => server.close(() => done(null)));
    server.listen(port, host);
  });
}

const portFix = (port) => ({
  mac: `lsof -nP -iTCP:${port} -sTCP:LISTEN     # then: kill <PID>`,
  windows: `Get-NetTCPConnection -LocalPort ${port} -State Listen | Select-Object OwningProcess     # then: Stop-Process -Id <PID>`,
});

for (const [label, port, host] of [
  [`Port ${apiPort} (API)`, apiPort, apiHost === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1'],
  ['Port 5173 (web)', 5173, '127.0.0.1'],
]) {
  const code = await probePort(port, host);

  if (code === null) {
    record(label, true, 'free');
  } else if (code === 'EADDRINUSE') {
    warn(label, 'in use - fine if that is your own dev server, a problem otherwise', portFix(port));
  } else if (code === 'EACCES') {
    record(label, false, `permission denied binding ${host}:${port}`, {
      mac: 'choose a port above 1024 in .env',
      windows:
        'choose a port above 1024 in .env, or check: netsh interface ipv4 show excludedportrange protocol=tcp',
    });
  } else {
    record(label, false, `could not bind ${host}:${port} (${code})`, portFix(port));
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const width = Math.max(...results.map((r) => r.name.length));

console.log(`\nAI4RIG doctor  ${paint(DIM, `${process.platform} - node ${process.versions.node}`)}\n`);

for (const result of results) {
  const tag = result.warn
    ? paint(YELLOW, 'WARN')
    : result.ok
      ? paint(GREEN, 'PASS')
      : paint(RED, 'FAIL');
  console.log(`  ${tag}  ${result.name.padEnd(width)}  ${result.detail}`);
}

const failures = results.filter((r) => !r.ok);
const warnings = results.filter((r) => r.warn);
const needFix = [...failures, ...warnings].filter((r) => r.fix);

if (needFix.length > 0) {
  console.log(
    `\n${'-'.repeat(Math.min(width + 40, 78))}\nFix${needFix.length === 1 ? '' : 'es'}, in order:\n`,
  );

  for (const result of needFix) {
    console.log(`  ${result.name} - ${result.detail}`);
    if (result.fix.both) {
      console.log(`    ${paint(DIM, 'macOS and PowerShell:')} ${result.fix.both}`);
    } else {
      // Print the current platform's command first so nobody copies the wrong
      // line, but always print both so the docs match on either machine.
      const order = isWindows
        ? [
            ['PowerShell', result.fix.windows],
            ['macOS', result.fix.mac],
          ]
        : [
            ['macOS', result.fix.mac],
            ['PowerShell', result.fix.windows],
          ];
      for (const [platform, command] of order) {
        console.log(`    ${paint(DIM, `${platform}:`)} ${command}`);
      }
    }
    console.log();
  }
}

if (failures.length === 0) {
  const suffix =
    warnings.length > 0 ? ` (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : '';
  console.log(`${paint(GREEN, 'Everything checks out.')}${suffix} Run "npm run dev".\n`);
} else {
  console.log(
    `${paint(RED, `${failures.length} check${failures.length === 1 ? '' : 's'} failed.`)} ` +
      'Work through the fixes above, then run "npm run doctor" again.\n',
  );
  process.exitCode = 1;
}
