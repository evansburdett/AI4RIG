/**
 * Installing an update on a Mac from inside the app (RIG, 11/17).
 *
 * The usual route, Squirrel.Mac, needs a paid Apple Developer ID. Without
 * one, updating meant a GitHub page of a dozen files, a drag to
 * Applications that fails while the app is open, and an "Open Anyway" in
 * Privacy & Security. Instead the app does it itself:
 *
 *   1. downloads the zip for this Mac (Apple silicon or Intel) from the
 *      release, and checks it against the SHA-512 the release lists;
 *   2. unpacks it next to the download;
 *   3. quits, and a small script waits for it to close, swaps the new app in
 *      where the old one was (keeping the old one until the new one is in
 *      place), and opens it.
 *
 * A file the app downloads itself carries no quarantine flag, so macOS opens
 * the new version without asking again. If the app is ever signed with a
 * certificate (a paid Developer ID), an update has to be signed with the same
 * one before it is put in. Where the app cannot replace itself
 * (it is running from the disk image, say, or from a folder it cannot write
 * to), the caller opens the right .dmg in the browser instead.
 *
 * No Electron imports here, so this can be tested in plain Node.
 */

import { spawn, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, constants, createWriteStream, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** A file a release lists in latest-mac.yml. */
export interface ReleaseFile {
  readonly url: string;
  readonly sha512: string;
  readonly size?: number;
}

/**
 * The zip for this Mac. electron-builder names them AI4RIG-<v>-arm64-mac.zip
 * (Apple silicon) and AI4RIG-<v>-mac.zip (Intel).
 */
export function pickMacZip(files: readonly ReleaseFile[], arch: string): ReleaseFile | null {
  const zips = files.filter((f) => f.url.endsWith('.zip'));
  const match = arch === 'arm64' ? zips.find((f) => f.url.includes('arm64')) : zips.find((f) => !f.url.includes('arm64'));
  return match ?? null;
}

/** The .dmg to fall back to in the browser, named as electron-builder.yml names it. */
export function macDmgUrl(releasesUrl: string, version: string, arch: string): string {
  const a = arch === 'arm64' ? 'arm64' : 'x64';
  return `${releasesUrl}/download/v${version}/AI4RIG-${version}-mac-${a}.dmg`;
}

/** The .app bundle the running app is, from its executable: AI4RIG.app/Contents/MacOS/AI4RIG. */
export function bundlePath(execPath: string): string | null {
  const bundle = dirname(dirname(dirname(execPath)));
  return bundle.endsWith('.app') ? bundle : null;
}

/**
 * Why the app cannot replace itself where it is, or null when it can. macOS
 * runs an app opened straight from Downloads or a disk image from a
 * read-only copy ("App Translocation"), which cannot be replaced.
 */
export function cannotReplace(bundle: string | null): string | null {
  if (bundle === null) return 'not running from an app bundle';
  if (bundle.includes('/AppTranslocation/')) return 'running from a temporary copy macOS made';
  if (bundle.startsWith('/Volumes/')) return 'running from the disk image';
  try {
    accessSync(dirname(bundle), constants.W_OK);
    accessSync(bundle, constants.W_OK);
  } catch {
    return 'no permission to replace it';
  }
  return null;
}

/** Downloads a file, checking it against the release's SHA-512 (base64). */
export async function downloadVerified(
  url: string,
  sha512: string,
  dest: string,
  onProgress: (fraction: number) => void = () => undefined,
): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || response.body === null) throw new Error(`download failed: HTTP ${response.status}`);
  const total = Number(response.headers.get('content-length') ?? 0);
  const hash = createHash('sha512');
  let received = 0;
  const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>);
  body.on('data', (chunk: Buffer) => {
    hash.update(chunk);
    received += chunk.length;
    if (total > 0) onProgress(received / total);
  });
  await pipeline(body, createWriteStream(dest));
  const actual = hash.digest('base64');
  if (actual !== sha512) throw new Error('the download does not match the release (SHA-512 differs)');
}

/**
 * Waits for the app to quit, then puts the new app where the old one was and
 * opens it. If the copy fails, the old app goes back. Any further arguments
 * are VAR=value settings to open the new app with (a trial run's data folder).
 */
export const INSTALL_SCRIPT = `#!/bin/bash
pid="$1"; new="$2"; target="$3"; work="$4"; shift 4
envs=(); for e in "$@"; do envs+=(--env "$e"); done
for _ in $(seq 1 600); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
old="$target.updating-$$"
if mv "$target" "$old"; then
  if ditto "$new" "$target"; then
    rm -rf "$old"
  else
    rm -rf "$target"; mv "$old" "$target"
  fi
fi
xattr -dr com.apple.quarantine "$target" 2>/dev/null
open "\${envs[@]}" "$target"
rm -rf "$work"
`;

export interface PreparedUpdate {
  /** The unpacked new AI4RIG.app. */
  readonly newApp: string;
  /** The folder holding the download, removed once installed. */
  readonly workDir: string;
}

/**
 * Who signed an app, as codesign's designated requirement, when it is signed
 * with a certificate. Null for an ad-hoc signature, which names only that one
 * build and so cannot vouch for the next.
 */
export async function signerRequirement(bundle: string): Promise<string | null> {
  try {
    const { stdout, stderr } = await run('/usr/bin/codesign', ['-d', '-r-', bundle]);
    const line = `${stdout}\n${stderr}`.split('\n').find((l) => l.startsWith('designated => '));
    const requirement = line?.slice('designated => '.length).trim();
    // Ad hoc, the requirement is the one build's hash ("cdhash H\"...\"").
    return requirement !== undefined && requirement !== '' && !requirement.startsWith('cdhash') ? requirement : null;
  } catch {
    return null;
  }
}

/**
 * Downloads, checks, and unpacks the update, ready to swap in. With a
 * requirement, the new app must be signed by the same certificate.
 */
export async function prepareUpdate(
  zipUrl: string,
  sha512: string,
  onProgress?: (fraction: number) => void,
  requirement: string | null = null,
): Promise<PreparedUpdate> {
  const workDir = mkdtempSync(join(tmpdir(), 'ai4rig-update-'));
  const zip = join(workDir, 'update.zip');
  await downloadVerified(zipUrl, sha512, zip, onProgress);
  const unpacked = join(workDir, 'unpacked');
  await run('/usr/bin/ditto', ['-x', '-k', zip, unpacked]);
  const newApp = join(unpacked, 'AI4RIG.app');
  if (!existsSync(newApp)) throw new Error('the download has no AI4RIG.app in it');
  // Ad-hoc signed, but the signature still proves the files arrived whole.
  await run('/usr/bin/codesign', ['--verify', '--deep', newApp]);
  if (requirement !== null) {
    await run('/usr/bin/codesign', ['--verify', '--deep', `-R=${requirement}`, newApp]).catch(() => {
      throw new Error('the download is not signed by the same certificate as this app');
    });
  }
  return { newApp, workDir };
}

/**
 * Starts the script that swaps the app once this process has quit. The caller
 * quits next. `env` is VAR=value settings to reopen the app with.
 */
export function swapOnQuit(
  prepared: PreparedUpdate,
  bundle: string,
  env: readonly string[] = [],
  pid: number = process.pid,
): void {
  const script = join(prepared.workDir, 'install.sh');
  writeFileSync(script, INSTALL_SCRIPT, { mode: 0o700 });
  spawn('/bin/bash', [script, String(pid), prepared.newApp, bundle, prepared.workDir, ...env], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}
