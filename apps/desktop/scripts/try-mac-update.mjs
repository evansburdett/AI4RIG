// @ts-check
/**
 * npm run desktop:try-update   (macOS only)
 *
 * A real run of the Mac update, start to finish, without publishing anything
 * or touching the installed app or its cases:
 *
 *   1. builds this branch twice, as 0.99.0 ("installed") and 0.99.1 ("new");
 *   2. serves 0.99.1's zip and latest-mac.yml from a local server, the way
 *      GitHub Releases would;
 *   3. puts 0.99.0 in a trial Applications folder and opens it with its own
 *      data folder, reading updates from that server.
 *
 * Click Install and reopen. The script says when the app in the trial folder
 * has become 0.99.1. Save a Market Data key in Settings before updating (any
 * text will do) to see the explanation that comes before the Mac's password
 * prompt after the update (docs/DESKTOP.md).
 *
 * Ctrl-C stops the server. The trial folder is left for a look and printed at
 * the end; delete it when done.
 */

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') {
  console.error('This trial is for macOS.');
  process.exit(1);
}

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stagePackage = join(desktopDir, 'stage', 'package.json');
const OLD = '0.99.0';
const NEW = '0.99.1';
const PORT = Number(process.env.TRIAL_PORT ?? 8765);
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const work = join(tmpdir(), 'ai4rig-update-trial');

/** @param {string} cmd @param {string[]} args */
function sh(cmd, args) {
  execFileSync(cmd, args, { cwd: desktopDir, stdio: 'inherit' });
}

/** Builds the staged app at `version` with the given targets into `out`. */
function build(version, target, out) {
  const pkg = JSON.parse(readFileSync(stagePackage, 'utf8'));
  writeFileSync(stagePackage, JSON.stringify({ ...pkg, version }, null, 2));
  sh('npx', [
    'electron-builder',
    '--config',
    'electron-builder.yml',
    '--mac',
    target,
    `--${arch}`,
    '--publish',
    'never',
    `-c.directories.output=${out}`,
  ]);
}

/** The version in an .app's Info.plist. */
function bundleVersion(app) {
  try {
    return execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', join(app, 'Contents', 'Info.plist')])
      .toString()
      .trim();
  } catch {
    return null;
  }
}

console.log(`Trial folder: ${work}`);
rmSync(work, { recursive: true, force: true });
const feed = join(work, 'feed');
const apps = join(work, 'Applications');
const data = join(work, 'data');
mkdirSync(feed, { recursive: true });
mkdirSync(apps, { recursive: true });
mkdirSync(data, { recursive: true });

sh('node', ['scripts/build.mjs']);
const original = readFileSync(stagePackage, 'utf8');
try {
  // The new version, as a release would carry it: a zip and latest-mac.yml.
  build(NEW, 'zip', join(work, 'build-new'));
  const zipName = `AI4RIG-${NEW}-${arch === 'arm64' ? 'arm64-' : ''}mac.zip`;
  const zipPath = join(work, 'build-new', zipName);
  if (!existsSync(zipPath)) throw new Error(`expected ${zipPath}`);
  cpSync(zipPath, join(feed, zipName));
  const sha512 = createHash('sha512').update(readFileSync(zipPath)).digest('base64');
  const size = statSync(zipPath).size;
  writeFileSync(
    join(feed, 'latest-mac.yml'),
    [
      `version: ${NEW}`,
      'files:',
      `  - url: ${zipName}`,
      `    sha512: ${sha512}`,
      `    size: ${size}`,
      `path: ${zipName}`,
      `sha512: ${sha512}`,
      `releaseDate: '${new Date().toISOString()}'`,
      '',
    ].join('\n'),
  );

  // The installed version.
  build(OLD, 'dir', join(work, 'build-old'));
  cpSync(join(work, 'build-old', arch === 'arm64' ? 'mac-arm64' : 'mac', 'AI4RIG.app'), join(apps, 'AI4RIG.app'), {
    recursive: true,
    verbatimSymlinks: true,
  });
} finally {
  writeFileSync(stagePackage, original);
}

const server = createServer((req, res) => {
  const file = join(feed, basename(decodeURIComponent((req.url ?? '/').split('?')[0] ?? '')));
  console.log(`  server: ${req.method} ${req.url} ${existsSync(file) ? '200' : '404'}`);
  if (!existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-length': statSync(file).size });
  createReadStream(file).pipe(res);
});
server.listen(PORT, '127.0.0.1', () => {
  const app = join(apps, 'AI4RIG.app');
  console.log(`\nServing ${NEW} at http://127.0.0.1:${PORT}. Opening ${OLD} from ${app}`);
  console.log('In the app: optionally save any text as the Market Data key in Settings, then click Install and reopen.\n');
  spawn(
    '/usr/bin/open',
    ['-n', '--env', `AI4RIG_DATA_DIR=${data}`, '--env', `AI4RIG_UPDATE_FEED=http://127.0.0.1:${PORT}`, app],
    { stdio: 'inherit' },
  );
  let last = bundleVersion(app);
  setInterval(() => {
    const now = bundleVersion(app);
    if (now !== last) {
      console.log(now === null ? '  the app is being replaced…' : `  the app in the trial folder is now ${now}`);
      if (now === NEW) console.log(`\n✓ Updated to ${NEW}. Check that it reopened by itself. Ctrl-C when done.`);
      last = now;
    }
  }, 500);
});

process.on('SIGINT', () => {
  server.close();
  console.log(`\nStopped. The trial is in ${work} (logs in ${join(data, 'logs')}). Delete it when done.`);
  process.exit(0);
});
