import { useEffect, useState } from 'react';

import { api, ApiError, type Health } from './api.js';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; health: Health }
  | { kind: 'error'; message: string };

/**
 * The vertical slice: the browser calls the API, the API reads SQLite, and the
 * answer comes back here. If this page shows green, the whole chain works on
 * your machine. Everything else is the team's to build.
 */
export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    api
      .health()
      .then((health) => {
        if (!cancelled) setState({ kind: 'ok', health });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          kind: 'error',
          message: error instanceof ApiError ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>AI4RIG</h1>
      <p className="subtitle">
        Bucket planning for Railroad Investment Group — Auburn Senior Design, Team 22
      </p>

      <section className="card">
        <h2>Environment check</h2>
        <p className="muted">
          GET <code>/api/health</code> via <code>{api.baseUrl}</code>
        </p>

        {state.kind === 'loading' && <p>Checking…</p>}

        {state.kind === 'error' && (
          <div className="status status-bad">
            <strong>API unreachable</strong>
            <p>{state.message}</p>
            <p className="muted">
              Run <code>npm run doctor</code> from the repo root to see what is missing.
            </p>
          </div>
        )}

        {state.kind === 'ok' && (
          <div className="status status-good">
            <strong>Front end, API, and database are connected</strong>
            <dl>
              <dt>Database file</dt>
              <dd>
                <code>{state.health.databasePath}</code>
              </dd>

              <dt>Migrations applied</dt>
              <dd>{state.health.migrationsApplied}</dd>

              <dt>API bound to</dt>
              <dd>
                <code>
                  {state.health.apiHost}:{state.health.apiPort}
                </code>
              </dd>

              <dt>NODE_ENV</dt>
              <dd>{state.health.nodeEnv}</dd>
            </dl>
          </div>
        )}
      </section>
    </main>
  );
}
