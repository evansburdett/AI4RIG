#!/usr/bin/env node
// @ts-check
/**
 * npm run desktop:smoke
 *
 * Starts the packaged app that `desktop:dist` just built (release/), against
 * a throwaway data folder, and checks that it really works: the API answers,
 * the front end is served, migrations ran, the tickers loaded,
 * and a case can be created. Then it quits the app and checks that the
 * database closed cleanly. CI runs this on Windows and macOS after every
 * build; run it locally before handing an installer to anyone.
 *
 * With MARKETDATA_TEST_KEY set it also saves that key the way Settings does and
 * prices real funds through the packaged app. The key only ever sits in the
 * throwaway data folder, encrypted, and is removed with it.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const releaseDir = resolve(dirname(fileURLToPath(import.meta.url)), '../release');

/** The unpacked app electron-builder left next to the installers. */
function findExecutable() {
  const candidates =
    process.platform === 'win32'
      ? [join(releaseDir, 'win-unpacked/AI4RIG.exe')]
      : process.platform === 'darwin'
        ? [
            join(releaseDir, `mac-${process.arch}/AI4RIG.app/Contents/MacOS/AI4RIG`),
            join(releaseDir, 'mac/AI4RIG.app/Contents/MacOS/AI4RIG'),
            join(releaseDir, 'mac-arm64/AI4RIG.app/Contents/MacOS/AI4RIG'),
          ]
        : [join(releaseDir, 'linux-unpacked/ai4rig')];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined) {
    throw new Error(`No packaged app in ${releaseDir}. Run "npm run desktop:dist" first.`);
  }
  return found;
}

/** @param {boolean} ok @param {string} message */
function check(ok, message) {
  if (!ok) throw new Error(`Smoke test failed: ${message}`);
  console.log(`  ✓ ${message}`);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const executable = findExecutable();
const dataDir = mkdtempSync(join(tmpdir(), 'ai4rig-smoke-'));
const logFile = join(dataDir, 'logs/main.log');
const readLog = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8') : '');

console.log(`Starting ${executable}\n  data in ${dataDir}`);
const app = spawn(executable, [], {
  env: { ...process.env, AI4RIG_DATA_DIR: dataDir },
  stdio: 'ignore',
});

let exitCode = 0;
try {
  let url;
  for (let waited = 0; url === undefined && waited < 60_000; waited += 500) {
    url = /serving on (http:\/\/127\.0\.0\.1:\d+)/.exec(readLog())?.[1];
    if (url === undefined) await sleep(500);
  }
  check(url !== undefined, 'the app started and is serving');

  const health = await (await fetch(`${url}/api/health`)).json();
  check(health.status === 'ok', `the API answers (version ${health.appVersion})`);
  check(health.migrationsApplied > 0, `${health.migrationsApplied} migrations ran`);

  const page = await (await fetch(`${url}/`)).text();
  check(page.includes('<title>AI4RIG</title>'), 'the front end is served');

  const tickers = await (await fetch(`${url}/api/tickers`)).json();
  check(Array.isArray(tickers) && tickers.length > 0, `${tickers.length} tickers loaded`);

  const created = await (await fetch(`${url}/api/clients`, { method: 'POST' })).json();
  check(typeof created.clientNumber === 'string', `a case can be created (${created.clientNumber})`);

  const refresh = (symbols) =>
    fetch(`${url}/api/prices/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols }),
    });
  const noKey = await refresh(['FXAIX']);
  check(noKey.status === 503, 'without a key, a price refresh says to add one');

  const testKey = process.env.MARKETDATA_TEST_KEY;
  if (testKey) {
    const saved = await fetch(`${url}/api/settings/market-data-key`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: testKey }),
    });
    const savedText = await saved.text();
    check(saved.ok && JSON.parse(savedText).marketDataKeyConfigured === true, 'a Market Data key can be saved');
    check(!savedText.includes(testKey), 'the key is not sent back');
    check(!readFileSync(join(dataDir, 'market-data-key')).includes(testKey), 'the key is not readable on disk');

    const priced = await refresh(['FXAIX', 'CGDV', 'CASH']);
    const result = await priced.json();
    check(priced.ok, `prices came back${priced.ok ? '' : `: ${result.error}`}`);
    check(result.updated.includes('FXAIX') && result.updated.includes('CGDV'), 'a mutual fund and an ETF were priced');
    const fxaix = result.tickers.find((t) => t.symbol === 'FXAIX');
    check(fxaix.priceMicros > 0, `FXAIX is $${fxaix.priceMicros / 1_000_000} as of ${fxaix.priceAsOf}`);
  }
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  console.error(`\nApp log:\n${readLog() || '(empty)'}`);
  exitCode = 1;
} finally {
  app.kill('SIGTERM');
  for (let waited = 0; app.exitCode === null && app.signalCode === null && waited < 15_000; waited += 250) {
    await sleep(250);
  }
  if (exitCode === 0) {
    try {
      check(app.exitCode !== null || app.signalCode !== null, 'the app quit when asked');
      // Windows ends the process without a quit event, so the clean-shutdown
      // line is only expected where the app gets to run its quit handler.
      if (process.platform !== 'win32') check(readLog().includes(' stopped'), 'the database closed cleanly');
    } catch (error) {
      console.error(`\n${error instanceof Error ? error.message : String(error)}`);
      exitCode = 1;
    }
  }
  if (app.exitCode === null && app.signalCode === null) app.kill('SIGKILL');
  await sleep(500);
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}

process.exit(exitCode);
