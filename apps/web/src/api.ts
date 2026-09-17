/**
 * The one module that knows where the API is.
 *
 * Everything else imports `api` from here. No component, hook, or test builds
 * a URL of its own — that is what makes host mode at RIG a change to .env
 * instead of a change to the code, and ESLint fails the build if a literal
 * `localhost` or `:3001` shows up anywhere else under apps/web/src.
 *
 * It is also the only module that reads `import.meta.env`, which is why the
 * fixture switch below lives here rather than next to the screens that use it.
 *
 * ── Fixture mode ────────────────────────────────────────────────────────────
 * The client, ticker, and plan endpoints do not exist yet; they are US-01,
 * US-04, and US-06, owned by other people on the team. Until they land,
 * `VITE_USE_FIXTURES=true` serves the same typed shapes out of an in-memory
 * store so the screens can be built and reviewed against something real.
 *
 * The HTTP call each function will make is written directly above its fixture
 * branch and is the thing to delete the branch in favour of. Every path and
 * method here is a proposal to the people building the API, not a fact — if
 * they land a different shape, this file is where it gets reconciled.
 */

import { SAMPLE_CASES } from './fixtures/clients.js';
import { DEFAULT_BUCKET_DEFINITIONS, PLACEHOLDER_TICKERS } from './fixtures/tickers.js';
import { ALLOCATION_TARGETS_PENDING } from './domain/lifeStage.js';
import type {
  AllocationTarget,
  BucketDefinition,
  ClientCase,
  ClientSummary,
  Ticker,
} from './domain/types.js';

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

if (!baseUrl) {
  throw new Error(
    'VITE_API_BASE_URL is not set. Copy .env.example to .env (or run "npm run setup"), ' +
      'then restart the dev server — Vite only reads .env at startup.',
  );
}

/**
 * Defaults to on. A teammate who pulls this branch without updating their .env
 * should get working screens, not a wall of 404s from routes nobody has written.
 */
const useFixtures = (import.meta.env.VITE_USE_FIXTURES ?? 'true') !== 'false';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, init);
  } catch {
    // fetch only rejects when the request never reached a server at all.
    throw new ApiError(
      `Could not reach the API at ${baseUrl}. Is it running? Try "npm run dev" from the repo root.`,
      0,
    );
  }

  if (!response.ok) {
    throw new ApiError(`${path} responded ${response.status} ${response.statusText}`, response.status);
  }

  return (await response.json()) as T;
}

/** GET a JSON endpoint. `path` starts with a slash, e.g. "/api/health". */
export async function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

export interface Health {
  status: string;
  databasePath: string;
  migrationsApplied: number;
  apiHost: string;
  apiPort: number;
  nodeEnv: string;
  time: string;
}

// ── Fixture store ───────────────────────────────────────────────────────────
// Module-level so an edit survives navigating between screens, which is what
// makes the ticker editor (US-08) reviewable. It does not survive a page
// reload, and it is not supposed to — persistence is US-04's job.

const caseStore = new Map(SAMPLE_CASES.map((c) => [c.clientNumber, c]));
let tickerStore: Ticker[] = [...PLACEHOLDER_TICKERS];
let bucketDefinitionStore: BucketDefinition[] = [...DEFAULT_BUCKET_DEFINITIONS];

/** Stand in for network latency so loading states are exercised, not skipped. */
function settle<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 120));
}

export const api = {
  baseUrl,
  usingFixtures: useFixtures,

  health: () => get<Health>('/api/health'),

  /** US-03 — the switcher only needs the summary, not every holding. */
  listClients: async (): Promise<ClientSummary[]> => {
    if (useFixtures) {
      return settle(
        [...caseStore.values()]
          .map(({ clientNumber, initials, lifeStage, updatedAt }) => ({
            clientNumber,
            initials,
            lifeStage,
            updatedAt,
          }))
          .sort((a, b) => a.clientNumber.localeCompare(b.clientNumber)),
      );
    }
    return get<ClientSummary[]>('/api/clients');
  },

  /** US-01 / US-04 — the whole case. */
  getClient: async (clientNumber: string): Promise<ClientCase> => {
    if (useFixtures) {
      const found = caseStore.get(clientNumber);
      if (!found) throw new ApiError(`No client case numbered ${clientNumber}`, 404);
      return settle(found);
    }
    return get<ClientCase>(`/api/clients/${encodeURIComponent(clientNumber)}`);
  },

  saveClient: async (clientCase: ClientCase): Promise<ClientCase> => {
    if (useFixtures) {
      const saved = { ...clientCase, updatedAt: new Date().toISOString() };
      caseStore.set(saved.clientNumber, saved);
      return settle(saved);
    }
    return request<ClientCase>(`/api/clients/${encodeURIComponent(clientCase.clientNumber)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clientCase),
    });
  },

  /** US-06 — RIG's approved investment universe. */
  listTickers: async (): Promise<Ticker[]> => {
    if (useFixtures) return settle([...tickerStore]);
    return get<Ticker[]>('/api/tickers');
  },

  /** US-08 — an administrator moves a ticker to a different default bucket. */
  saveTicker: async (ticker: Ticker): Promise<Ticker> => {
    if (useFixtures) {
      tickerStore = tickerStore.map((t) => (t.symbol === ticker.symbol ? ticker : t));
      return settle(ticker);
    }
    return request<Ticker>(`/api/tickers/${encodeURIComponent(ticker.symbol)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticker),
    });
  },

  /** US-08 — bucket definitions are editable too, so the model can be reworded. */
  listBucketDefinitions: async (): Promise<BucketDefinition[]> => {
    if (useFixtures) return settle([...bucketDefinitionStore]);
    return get<BucketDefinition[]>('/api/bucket-definitions');
  },

  saveBucketDefinition: async (definition: BucketDefinition): Promise<BucketDefinition> => {
    if (useFixtures) {
      bucketDefinitionStore = bucketDefinitionStore.map((d) =>
        d.bucket === definition.bucket ? definition : d,
      );
      return settle(definition);
    }
    return request<BucketDefinition>(`/api/bucket-definitions/${definition.bucket}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(definition),
    });
  },

  /**
   * US-10 — returns all six stages with null percentages until RIG supplies
   * them. The endpoint is expected to return the same nulls, not to 404, so the
   * UI can show the gap rather than an error.
   */
  listAllocationTargets: async (): Promise<AllocationTarget[]> => {
    if (useFixtures) return settle([...ALLOCATION_TARGETS_PENDING]);
    return get<AllocationTarget[]>('/api/allocation-targets');
  },
};
