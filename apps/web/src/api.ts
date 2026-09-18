/**
 * The one module that knows where the API is, and the only one that reads
 * `import.meta.env`. ESLint fails the build if a literal address or an
 * `import.meta.env` read appears anywhere else under apps/web/src.
 *
 * Fixture mode: the client and ticker endpoints do not exist yet (US-01, US-04,
 * US-06). With VITE_USE_FIXTURES=true these functions serve the same typed
 * shapes from memory. The HTTP call each one will make sits below its fixture
 * branch; the paths are a proposal to whoever builds the API, not a contract.
 */

import { newClientCase } from './domain/factory.js';
import type {
  BucketDefinition,
  ClientCase,
  ClientSummary,
  Ticker,
} from './domain/types.js';
import { SAMPLE_CASES } from './fixtures/clients.js';
import { DEFAULT_BUCKET_DEFINITIONS, PLACEHOLDER_TICKERS } from './fixtures/tickers.js';

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

if (!baseUrl) {
  throw new Error(
    'VITE_API_BASE_URL is not set. Copy .env.example to .env (or run "npm run setup"), ' +
      'then restart the dev server — Vite only reads .env at startup.',
  );
}

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

export async function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
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

// Fixture store. Survives navigation so edits are reviewable; does not survive
// a reload, because persistence is US-04.
const caseStore = new Map(SAMPLE_CASES.map((c) => [c.clientNumber, c]));
let tickerStore: Ticker[] = [...PLACEHOLDER_TICKERS];
let definitionStore: BucketDefinition[] = [...DEFAULT_BUCKET_DEFINITIONS];

/** Stands in for network latency so loading states are exercised. */
function settle<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 120));
}

function summarize(c: ClientCase): ClientSummary {
  return {
    clientNumber: c.clientNumber,
    initials: c.initials,
    lifeStage: c.lifeStage,
    updatedAt: c.updatedAt,
  };
}

/** Next unused number. The database will own this. */
function nextClientNumber(): string {
  const highest = [...caseStore.keys()].reduce((max, key) => {
    const value = Number(key);
    return Number.isFinite(value) && value > max ? value : max;
  }, 1000);
  return String(highest + 1);
}

export const api = {
  baseUrl,
  usingFixtures: useFixtures,

  health: () => get<Health>('/api/health'),

  listClients: async (): Promise<ClientSummary[]> => {
    if (useFixtures) {
      return settle(
        [...caseStore.values()]
          .map(summarize)
          .sort((a, b) => a.clientNumber.localeCompare(b.clientNumber)),
      );
    }
    return get<ClientSummary[]>('/api/clients');
  },

  getClient: async (clientNumber: string): Promise<ClientCase> => {
    if (useFixtures) {
      const found = caseStore.get(clientNumber);
      if (!found) throw new ApiError(`No client case numbered ${clientNumber}`, 404);
      return settle(found);
    }
    return get<ClientCase>(`/api/clients/${encodeURIComponent(clientNumber)}`);
  },

  /** The client number is assigned by the server, not chosen by the advisor. */
  createClient: async (): Promise<ClientCase> => {
    if (useFixtures) {
      const created = newClientCase(nextClientNumber());
      caseStore.set(created.clientNumber, created);
      return settle(created);
    }
    return send<ClientCase>('/api/clients', 'POST');
  },

  saveClient: async (clientCase: ClientCase): Promise<ClientCase> => {
    if (useFixtures) {
      const saved = { ...clientCase, updatedAt: new Date().toISOString() };
      caseStore.set(saved.clientNumber, saved);
      return settle(saved);
    }
    return send<ClientCase>(
      `/api/clients/${encodeURIComponent(clientCase.clientNumber)}`,
      'PUT',
      clientCase,
    );
  },

  deleteClient: async (clientNumber: string): Promise<void> => {
    if (useFixtures) {
      caseStore.delete(clientNumber);
      return settle(undefined);
    }
    await send<void>(`/api/clients/${encodeURIComponent(clientNumber)}`, 'DELETE');
  },

  listTickers: async (): Promise<Ticker[]> => {
    if (useFixtures) return settle([...tickerStore]);
    return get<Ticker[]>('/api/tickers');
  },

  saveTicker: async (ticker: Ticker): Promise<Ticker> => {
    if (useFixtures) {
      tickerStore = tickerStore.map((t) => (t.symbol === ticker.symbol ? ticker : t));
      return settle(ticker);
    }
    return send<Ticker>(`/api/tickers/${encodeURIComponent(ticker.symbol)}`, 'PUT', ticker);
  },

  listBucketDefinitions: async (): Promise<BucketDefinition[]> => {
    if (useFixtures) return settle([...definitionStore]);
    return get<BucketDefinition[]>('/api/bucket-definitions');
  },

  saveBucketDefinition: async (definition: BucketDefinition): Promise<BucketDefinition> => {
    if (useFixtures) {
      definitionStore = definitionStore.map((d) =>
        d.bucket === definition.bucket ? definition : d,
      );
      return settle(definition);
    }
    return send<BucketDefinition>(
      `/api/bucket-definitions/${definition.bucket}`,
      'PUT',
      definition,
    );
  },
};
