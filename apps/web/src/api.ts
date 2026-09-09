/**
 * The one module that knows where the API is.
 *
 * Everything else imports `api` from here. No component, hook, or test builds
 * a URL of its own — that is what makes host mode at RIG a change to .env
 * instead of a change to the code, and ESLint fails the build if a literal
 * `localhost` or `:3001` shows up anywhere else under apps/web/src.
 */

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

/** GET a JSON endpoint. `path` starts with a slash, e.g. "/api/health". */
export async function get<T>(path: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`);
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

export interface Health {
  status: string;
  databasePath: string;
  migrationsApplied: number;
  apiHost: string;
  apiPort: number;
  nodeEnv: string;
  time: string;
}

export const api = {
  baseUrl,
  health: () => get<Health>('/api/health'),
};
