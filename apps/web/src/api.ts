/**
 * The one module that knows where the API is, and the only one that reads
 * `import.meta.env`. ESLint fails the build if a literal address or an
 * `import.meta.env` read appears anywhere else under apps/web/src.
 *
 * Every screen talks to the server through `api` below. The routes are in
 * apps/api/src/routes; the shapes are in packages/shared.
 */

import type { BucketDefinition, ClientCase, ClientSummary, Ticker } from './domain/types.js';

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

if (!baseUrl) {
  throw new Error(
    'VITE_API_BASE_URL is not set. Copy .env.example to .env (or run "npm run setup"), ' +
      'then restart the dev server — Vite only reads .env at startup.',
  );
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The API answers errors as `{ error, issues? }`. Turn that into one readable line. */
function describeFailure(path: string, response: Response, body: unknown): string {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const { error, issues } = body as { error: unknown; issues?: { path: string; message: string }[] };
    const detail = Array.isArray(issues)
      ? ` (${issues.map((i) => (i.path === '' ? i.message : `${i.path}: ${i.message}`)).join('; ')})`
      : '';
    return `${String(error)}${detail}`;
  }
  return `${path} responded ${response.status} ${response.statusText}`;
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

  // 204 No Content (a delete) has no body to parse.
  const text = await response.text();
  let body: unknown;
  try {
    body = text === '' ? undefined : JSON.parse(text);
  } catch {
    throw new ApiError(`${path} responded ${response.status} with something that is not JSON`, response.status);
  }

  if (!response.ok) {
    throw new ApiError(describeFailure(path, response, body), response.status);
  }

  return body as T;
}

export async function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
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

const clientPath = (clientNumber: string) => `/api/clients/${encodeURIComponent(clientNumber)}`;

export const api = {
  baseUrl,

  health: () => get<Health>('/api/health'),

  listClients: () => get<ClientSummary[]>('/api/clients'),

  getClient: (clientNumber: string) => get<ClientCase>(clientPath(clientNumber)),

  /** The client number is assigned by the server, not chosen by the advisor. */
  createClient: () => send<ClientCase>('/api/clients', 'POST'),

  saveClient: (clientCase: ClientCase) =>
    send<ClientCase>(clientPath(clientCase.clientNumber), 'PUT', clientCase),

  deleteClient: async (clientNumber: string): Promise<void> => {
    await send<void>(clientPath(clientNumber), 'DELETE');
  },

  listTickers: () => get<Ticker[]>('/api/tickers'),

  saveTicker: (ticker: Ticker) =>
    send<Ticker>(`/api/tickers/${encodeURIComponent(ticker.symbol)}`, 'PUT', ticker),

  listBucketDefinitions: () => get<BucketDefinition[]>('/api/bucket-definitions'),

  saveBucketDefinition: (definition: BucketDefinition) =>
    send<BucketDefinition>(`/api/bucket-definitions/${definition.bucket}`, 'PUT', definition),
};
