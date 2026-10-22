import { loadRootEnv } from '@ai4rig/db';

loadRootEnv();

export interface ApiConfig {
  /** Address to bind. 127.0.0.1 in development; 0.0.0.0 for host mode at RIG. */
  host: string;
  port: number;
  /** Browser origins allowed to call this API. */
  webOrigins: string[];
  nodeEnv: string;
  /**
   * US-28. Optional: without a key the life expectancy estimate answers 503
   * and the advisor types the age in. Read from this machine's .env only.
   */
  openAiApiKey?: string | undefined;
  openAiModel?: string;
  /** The installed app's version, shown in the footer. Unset in development. */
  appVersion?: string;
}

/** Used when OPENAI_MODEL is not set. Check it is still offered when RIG's key arrives. */
export const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${name} must be a port number between 1 and 65535 (got "${raw}")`);
  }
  return parsed;
}

/**
 * The bind address is configuration, never a literal in the code.
 *
 * In development it is 127.0.0.1: loopback only, so nothing else on a coffee
 * shop network can reach your API. At RIG the host machine sets
 * API_HOST=0.0.0.0 so advisor workstations on the office LAN can connect. Same
 * build, different .env — that is the whole point of
 * docs/decisions/0003-electron-is-packaging.md.
 */
export function loadConfig(): ApiConfig {
  return {
    host: process.env.API_HOST?.trim() || '127.0.0.1',
    port: intFromEnv('API_PORT', 3001),
    webOrigins: (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    openAiApiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
    openAiModel: process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
  };
}
