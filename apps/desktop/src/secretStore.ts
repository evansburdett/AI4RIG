/**
 * The desktop app's OpenAI key (US-28): a small file in the user's own
 * app-data folder, encrypted with the operating system's credential store
 * (Keychain on macOS, DPAPI on Windows) through Electron's safeStorage.
 *
 * The encryption is passed in rather than imported, so this file has no
 * Electron dependency and can be tested in plain Node. If the operating
 * system offers no encryption, the key is written readable only by this
 * user, and the file says which it is.
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import type { SecretStore } from '@ai4rig/api/secrets';

export interface Encryption {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(encrypted: Buffer): string;
}

const ENCRYPTED = Buffer.from('ai4rig-enc:');
const PLAIN = Buffer.from('ai4rig-plain:');

function startsWith(data: Buffer, prefix: Buffer): boolean {
  return data.subarray(0, prefix.length).equals(prefix);
}

export function fileSecretStore(file: string, encryption: Encryption): SecretStore {
  let cached: string | undefined;
  let loaded = false;

  function load(): string | undefined {
    if (!existsSync(file)) return undefined;
    const data = readFileSync(file);
    if (startsWith(data, ENCRYPTED)) return encryption.decrypt(data.subarray(ENCRYPTED.length));
    if (startsWith(data, PLAIN)) return data.subarray(PLAIN.length).toString('utf8');
    return undefined;
  }

  return {
    writable: true,
    get() {
      if (!loaded) {
        try {
          cached = load();
        } catch {
          // Unreadable (say, copied from another computer, whose keychain
          // cannot decrypt it): treat it as no key so it can be entered again.
          cached = undefined;
        }
        loaded = true;
      }
      return cached;
    },
    set(value) {
      if (value === null) {
        rmSync(file, { force: true });
      } else {
        const body = encryption.isAvailable()
          ? Buffer.concat([ENCRYPTED, encryption.encrypt(value)])
          : Buffer.concat([PLAIN, Buffer.from(value, 'utf8')]);
        writeFileSync(file, body, { mode: 0o600 });
      }
      cached = value ?? undefined;
      loaded = true;
    },
  };
}
