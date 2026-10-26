import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fileSecretStore, type Encryption } from './secretStore.js';

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'ai4rig-secret-'));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

/** Stands in for safeStorage: reverses the bytes, so "encrypted" is visibly different. */
const reversing: Encryption = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(plain, 'utf8').reverse(),
  decrypt: (encrypted) => Buffer.from(encrypted).reverse().toString('utf8'),
};

const KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz';

describe('fileSecretStore', () => {
  it('keeps the key encrypted on disk and reads it back in a new session', () => {
    const file = join(workspace, 'openai-key');
    fileSecretStore(file, reversing).set(KEY);

    expect(readFileSync(file).toString('utf8')).not.toContain(KEY);
    expect(fileSecretStore(file, reversing).get()).toBe(KEY);
  });

  it('removes the file when the key is removed', () => {
    const file = join(workspace, 'openai-key');
    const store = fileSecretStore(file, reversing);
    store.set(KEY);
    store.set(null);
    expect(store.get()).toBeUndefined();
    expect(fileSecretStore(file, reversing).get()).toBeUndefined();
  });

  it('falls back to a file only this user can read when there is no encryption', () => {
    const file = join(workspace, 'openai-key');
    fileSecretStore(file, { ...reversing, isAvailable: () => false }).set(KEY);
    expect(fileSecretStore(file, reversing).get()).toBe(KEY);
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o077).toBe(0);
  });

  it('treats a key it cannot decrypt as no key, so it can be entered again', () => {
    const file = join(workspace, 'openai-key');
    fileSecretStore(file, reversing).set(KEY);
    const otherComputer: Encryption = {
      ...reversing,
      decrypt: () => {
        throw new Error('cannot decrypt');
      },
    };
    expect(fileSecretStore(file, otherComputer).get()).toBeUndefined();
  });
});
