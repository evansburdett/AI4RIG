/**
 * Says why the Mac is about to ask for a password (RIG, 11/17).
 *
 * The keys saved in Settings are encrypted with a key macOS keeps in the
 * Keychain. Without a paid Apple Developer ID, macOS sees each new version of
 * the app as a different app, so after an update it asks for the login
 * password before the new version can use that key. Nothing in that prompt
 * says why, so just before it the app explains, once per version.
 *
 * It is only needed when an earlier version has used the Keychain: a first
 * install creates the Keychain item itself and is never asked. Each version
 * that gets through records itself in a small file, so the next one knows.
 *
 * No Electron imports, so this can be tested in plain Node.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import type { Encryption } from './secretStore.js';

export interface KeychainNoticeOptions {
  /** Where this version is recorded once it has used the Keychain. */
  readonly markerFile: string;
  readonly version: string;
  /** The saved key files: one that exists means an earlier version used the Keychain. */
  readonly keyFiles: readonly string[];
  /** Shows the explanation and returns once it is dismissed. */
  readonly explain: () => void;
}

function readMarker(file: string): string | null {
  try {
    return readFileSync(file, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

/** Whether the Mac is likely to ask, so the explanation should come first. */
export function keychainWillAsk(marker: string | null, version: string, keyFileExists: boolean): boolean {
  if (marker === version) return false;
  // A version before 0.1.7 left no marker, but its saved key means it used the Keychain.
  return marker !== null || keyFileExists;
}

/** The encryption, with the explanation shown before its first use in this version. */
export function withKeychainNotice(encryption: Encryption, options: KeychainNoticeOptions): Encryption {
  let done = false;

  function around<T>(use: () => T): T {
    if (done) return use();
    const marker = readMarker(options.markerFile);
    if (keychainWillAsk(marker, options.version, options.keyFiles.some((f) => existsSync(f)))) options.explain();
    // If the password is refused this throws, nothing is recorded, and the next start explains again.
    const result = use();
    done = true;
    if (marker !== options.version) {
      try {
        writeFileSync(options.markerFile, `${options.version}\n`);
      } catch {
        // Only costs an extra explanation next time.
      }
    }
    return result;
  }

  return {
    // On a Mac, checking fetches the Keychain key too, so it can be what asks.
    isAvailable: () => around(() => encryption.isAvailable()),
    encrypt: (plain) => around(() => encryption.encrypt(plain)),
    decrypt: (encrypted) => around(() => encryption.decrypt(encrypted)),
  };
}
