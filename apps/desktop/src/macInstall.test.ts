import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  bundlePath,
  cannotReplace,
  downloadVerified,
  INSTALL_SCRIPT,
  macDmgUrl,
  pickMacZip,
  signerRequirement,
} from './macInstall.js';

const FILES = [
  { url: 'AI4RIG-0.1.7-arm64-mac.zip', sha512: 'a' },
  { url: 'AI4RIG-0.1.7-mac.zip', sha512: 'b' },
  { url: 'AI4RIG-0.1.7-mac-arm64.dmg', sha512: 'c' },
];

describe('picking the update for this Mac', () => {
  it('takes the zip for Apple silicon or Intel', () => {
    expect(pickMacZip(FILES, 'arm64')?.url).toBe('AI4RIG-0.1.7-arm64-mac.zip');
    expect(pickMacZip(FILES, 'x64')?.url).toBe('AI4RIG-0.1.7-mac.zip');
    expect(pickMacZip([], 'arm64')).toBeNull();
  });

  it('falls back to the .dmg the release has for this Mac', () => {
    expect(macDmgUrl('https://example.test/releases', '0.1.7', 'arm64')).toBe(
      'https://example.test/releases/download/v0.1.7/AI4RIG-0.1.7-mac-arm64.dmg',
    );
    expect(macDmgUrl('https://example.test/releases', '0.1.7', 'x64')).toMatch(/mac-x64\.dmg$/);
  });
});

describe('where the app can replace itself', () => {
  it('finds the bundle from the executable', () => {
    expect(bundlePath('/Applications/AI4RIG.app/Contents/MacOS/AI4RIG')).toBe('/Applications/AI4RIG.app');
    expect(bundlePath('/usr/local/bin/node')).toBeNull();
  });

  it('will not replace a translocated copy, the disk image, or a folder it cannot write', () => {
    expect(cannotReplace(null)).not.toBeNull();
    expect(cannotReplace('/private/var/folders/x/AppTranslocation/y/d/AI4RIG.app')).toMatch(/temporary copy/);
    expect(cannotReplace('/Volumes/AI4RIG 0.1.7/AI4RIG.app')).toMatch(/disk image/);
    expect(cannotReplace('/System/AI4RIG.app')).toMatch(/permission/);
    const dir = mkdtempSync(join(tmpdir(), 'ai4rig-test-'));
    mkdirSync(join(dir, 'AI4RIG.app'));
    expect(cannotReplace(join(dir, 'AI4RIG.app'))).toBeNull();
  });
});

describe('downloading an update', () => {
  const body = Buffer.from('pretend this is a zip');
  const sha512 = createHash('sha512').update(body).digest('base64');
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      // GitHub answers with a redirect to where the file is stored.
      if (req.url === '/release.zip') {
        res.writeHead(302, { location: '/stored.zip' }).end();
        return;
      }
      res.writeHead(200, { 'content-length': body.length }).end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('follows the redirect and keeps a file that matches the release', async () => {
    const dest = join(mkdtempSync(join(tmpdir(), 'ai4rig-test-')), 'update.zip');
    const seen: number[] = [];
    await downloadVerified(`${base}/release.zip`, sha512, dest, (f) => seen.push(f));
    expect(readFileSync(dest)).toEqual(body);
    expect(seen.at(-1)).toBe(1);
  });

  it('refuses a file that does not match', async () => {
    const dest = join(mkdtempSync(join(tmpdir(), 'ai4rig-test-')), 'update.zip');
    await expect(downloadVerified(`${base}/release.zip`, 'wrong', dest)).rejects.toThrow(/does not match/);
  });
});

describe.skipIf(process.platform !== 'darwin')('the install script', () => {
  /** Runs the script with `open` stubbed, so nothing is launched. Returns what `open` was given. */
  function install(makeDittoFail = false, env: string[] = []) {
    const dir = mkdtempSync(join(tmpdir(), 'ai4rig-test-'));
    const target = join(dir, 'Applications', 'AI4RIG.app');
    mkdirSync(join(target, 'Contents'), { recursive: true });
    writeFileSync(join(target, 'Contents', 'version'), 'old');
    const work = join(dir, 'work');
    const newApp = join(work, 'unpacked', 'AI4RIG.app');
    mkdirSync(join(newApp, 'Contents'), { recursive: true });
    writeFileSync(join(newApp, 'Contents', 'version'), 'new');

    const bin = join(dir, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'open'), `#!/bin/bash\necho "$@" > "${join(dir, 'opened')}"\n`);
    chmodSync(join(bin, 'open'), 0o755);
    if (makeDittoFail) {
      writeFileSync(join(bin, 'ditto'), '#!/bin/bash\nexit 1\n');
      chmodSync(join(bin, 'ditto'), 0o755);
    }
    const script = join(dir, 'install.sh');
    writeFileSync(script, INSTALL_SCRIPT, { mode: 0o700 });
    // A process id that is not running, so the script does not wait.
    const result = spawnSync('/bin/bash', [script, '999999', newApp, target, work, ...env], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
    });
    return { result, target, work, opened: readFileSync(join(dir, 'opened'), 'utf8').trim() };
  }

  it('swaps the new app in, reopens it, and tidies up', () => {
    const { result, target, work, opened } = install();
    expect(result.status).toBe(0);
    expect(readFileSync(join(target, 'Contents', 'version'), 'utf8')).toBe('new');
    expect(opened).toBe(target);
    expect(existsSync(work)).toBe(false);
  });

  it('reopens a trial run with its own settings', () => {
    const { opened, target } = install(false, ['AI4RIG_DATA_DIR=/tmp/trial data']);
    expect(opened).toBe(`--env AI4RIG_DATA_DIR=/tmp/trial data ${target}`);
  });

  it('takes the signer only from a certificate, not an ad-hoc signature', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ai4rig-test-'));
    const tool = join(dir, 'tool');
    writeFileSync(tool, '#!/bin/bash\necho hi\n', { mode: 0o755 });
    spawnSync('/usr/bin/codesign', ['--sign', '-', tool]);
    expect(await signerRequirement(tool)).toBeNull();
    expect(await signerRequirement(join(dir, 'missing'))).toBeNull();
    // An Apple-signed tool has a certificate in its requirement.
    expect(await signerRequirement('/usr/bin/true')).toBe('identifier "com.apple.true" and anchor apple');
  });

  it('puts the old app back if the copy fails', () => {
    const { target, opened } = install(true);
    expect(readFileSync(join(target, 'Contents', 'version'), 'utf8')).toBe('old');
    expect(opened).toBe(target);
  });
});
