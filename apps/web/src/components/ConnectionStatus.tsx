import { useEffect, useState } from 'react';

import { api, ApiError, type Health } from '../api.js';

type State =
  | { kind: 'checking' }
  | { kind: 'ok'; health: Health }
  | { kind: 'down'; message: string };

/**
 * One line at the bottom of every screen: can the front end reach the API, and
 * which database is the API reading? The first thing to look at when a screen
 * is empty and you expected data. Checks once on load.
 */
export function ConnectionStatus() {
  const [state, setState] = useState<State>({ kind: 'checking' });

  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((health) => {
        if (!cancelled) setState({ kind: 'ok', health });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ kind: 'down', message: error instanceof ApiError ? error.message : String(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'checking') return <span className="muted">Checking the API…</span>;

  if (state.kind === 'down') {
    return (
      <span className="status status-down" role="status">
        API unreachable. {state.message}
      </span>
    );
  }

  const { health } = state;
  return (
    <span className="status status-ok" role="status" title={`API at ${api.baseUrl}`}>
      Connected · {health.databasePath} · {health.migrationsApplied} migration
      {health.migrationsApplied === 1 ? '' : 's'} applied
    </span>
  );
}
