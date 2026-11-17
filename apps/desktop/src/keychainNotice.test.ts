import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { keychainWillAsk, withKeychainNotice } from './keychainNotice.js';

describe('keychainWillAsk', () => {
  it('explains after an update, not on a first install or a second start', () => {
    expect(keychainWillAsk('0.1.7', '0.1.8', true)).toBe(true);
    expect(keychainWillAsk('0.1.8', '0.1.8', true)).toBe(false);
    // No earlier version used the Keychain: this one creates the item, and is not asked.
    expect(keychainWillAsk(null, '0.1.7', false)).toBe(false);
    // 0.1.6 and before left no marker, but a saved key means they used it.
    expect(keychainWillAsk(null, '0.1.7', true)).toBe(true);
  });
});

describe('withKeychainNotice', () => {
  function setup(marker: string | null, keySaved: boolean) {
    const dir = mkdtempSync(join(tmpdir(), 'ai4rig-test-'));
    const markerFile = join(dir, 'keychain-version');
    const keyFile = join(dir, 'market-data-key');
    if (marker !== null) writeFileSync(markerFile, marker);
    if (keySaved) writeFileSync(keyFile, 'ai4rig-enc:...');
    const events: string[] = [];
    let refuse = false;
    const encryption = withKeychainNotice(
      {
        isAvailable: () => true,
        encrypt: (plain) => Buffer.from(plain),
        decrypt: (data) => {
          events.push('keychain');
          if (refuse) throw new Error('denied');
          return data.toString();
        },
      },
      { markerFile, version: '0.1.8', keyFiles: [keyFile], explain: () => events.push('explained') },
    );
    return { encryption, events, markerFile, refuse: (r: boolean) => (refuse = r) };
  }

  it('explains once, before the Keychain, then records the version', () => {
    const { encryption, events, markerFile } = setup('0.1.7', true);
    encryption.decrypt(Buffer.from('a'));
    encryption.decrypt(Buffer.from('b'));
    expect(events).toEqual(['explained', 'keychain', 'keychain']);
    expect(readFileSync(markerFile, 'utf8').trim()).toBe('0.1.8');
  });

  it('says nothing on a first install, but records it for the next update', () => {
    const { encryption, events, markerFile } = setup(null, false);
    encryption.encrypt('key');
    expect(events).toEqual([]);
    expect(existsSync(markerFile)).toBe(true);
  });

  it('explains again next time if the password was refused', () => {
    const { encryption, events, markerFile, refuse } = setup('0.1.7', true);
    refuse(true);
    expect(() => encryption.decrypt(Buffer.from('a'))).toThrow('denied');
    expect(readFileSync(markerFile, 'utf8').trim()).toBe('0.1.7');
    refuse(false);
    encryption.decrypt(Buffer.from('a'));
    expect(events).toEqual(['explained', 'keychain', 'explained', 'keychain']);
  });
});
