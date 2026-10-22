/**
 * Where the OpenAI key (US-28) comes from. The API never reads a key from
 * anywhere else, so the same routes work whichever one is plugged in:
 *
 *   - development: OPENAI_API_KEY in the repo's .env, read-only here
 *   - the desktop app: a file in the user's own app-data folder, encrypted
 *     with the operating system's keychain, set from the Settings screen
 *     (apps/desktop/src/secretStore.ts)
 *
 * The key itself is never sent back to the browser.
 */
export interface SecretStore {
  /** The key, or undefined when none is set. */
  get(): string | undefined;
  /** Save a key, or remove it with null. Throws when `writable` is false. */
  set(value: string | null): void;
  /** False when the key comes from somewhere the app cannot change, like .env. */
  readonly writable: boolean;
}

/** A key fixed at startup, from the environment. */
export function envSecretStore(value: string | undefined): SecretStore {
  const key = value?.trim() || undefined;
  return {
    get: () => key,
    set: () => {
      throw new Error('This key comes from .env and cannot be changed from the app.');
    },
    writable: false,
  };
}

/** Held in memory only. For tests. */
export function memorySecretStore(initial?: string): SecretStore {
  let key = initial;
  return {
    get: () => key,
    set: (value) => {
      key = value ?? undefined;
    },
    writable: true,
  };
}
