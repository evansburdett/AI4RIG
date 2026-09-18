import { useCallback, useEffect, useMemo, useState } from 'react';

import { api, ApiError } from './api.js';
import { Callout } from './components/Callout.js';
import { ClientSwitcher } from './components/ClientSwitcher.js';
import type { BucketDefinition, ClientCase, ClientSummary, Ticker } from './domain/types.js';
import { hrefFor, useRoute, type Screen } from './routing.js';
import { AssetClassBreakdown } from './screens/AssetClassBreakdown.js';
import { BucketAssignments } from './screens/BucketAssignments.js';
import { ClientProfile } from './screens/ClientProfile.js';

/**
 * Shell: reference data, the open case, and which screen is showing.
 *
 * The active client lives in the URL, so switching is a route change and the
 * back button retraces the advisor's path through their book.
 */
export function App() {
  const [route, navigate] = useRoute();

  const [clients, setClients] = useState<readonly ClientSummary[]>([]);
  const [tickers, setTickers] = useState<readonly Ticker[]>([]);
  const [definitions, setDefinitions] = useState<readonly BucketDefinition[]>([]);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  /** Where to return from the ticker screen, which belongs to no client. */
  const [lastClientNumber, setLastClientNumber] = useState<string | null>(null);

  const [draft, setDraft] = useState<ClientCase | null>(null);
  const [saved, setSaved] = useState<ClientCase | null>(null);
  const [caseError, setCaseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([api.listClients(), api.listTickers(), api.listBucketDefinitions()])
      .then(([clientList, tickerList, definitionList]) => {
        if (cancelled) return;
        setClients(clientList);
        setTickers(tickerList);
        setDefinitions(definitionList);
      })
      .catch((error: unknown) => {
        if (!cancelled) setReferenceError(describeError(error));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (route.clientNumber !== null) setLastClientNumber(route.clientNumber);
  }, [route.clientNumber]);

  // Land where the advisor last was, or on the first client.
  useEffect(() => {
    if (route.clientNumber !== null || route.screen === 'tickers') return;
    const target = lastClientNumber ?? clients[0]?.clientNumber;
    if (target !== undefined) navigate({ screen: 'profile', clientNumber: target });
  }, [clients, lastClientNumber, route.clientNumber, route.screen, navigate]);

  useEffect(() => {
    const clientNumber = route.clientNumber;
    if (clientNumber === null) return;

    let cancelled = false;
    setCaseError(null);

    api
      .getClient(clientNumber)
      .then((clientCase) => {
        if (cancelled) return;
        setSaved(clientCase);
        setDraft(clientCase);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setDraft(null);
        setSaved(null);
        setCaseError(describeError(error));
      });

    return () => {
      cancelled = true;
    };
  }, [route.clientNumber]);

  const dirty = draft !== null && saved !== null && draft !== saved;
  const activeClientNumber = route.clientNumber ?? lastClientNumber;

  const selectClient = useCallback(
    (clientNumber: string) => {
      // Stay on the screen the advisor is reading.
      const screen: Screen = route.screen === 'tickers' ? 'profile' : route.screen;
      navigate({ screen, clientNumber });
    },
    [navigate, route.screen],
  );

  const save = useCallback(async () => {
    if (draft === null) return;
    setBusy(true);
    try {
      const result = await api.saveClient(draft);
      setSaved(result);
      setDraft(result);
      setClients((current) =>
        current.map((c) =>
          c.clientNumber === result.clientNumber ? toSummary(result) : c,
        ),
      );
    } catch (error: unknown) {
      setCaseError(describeError(error));
    } finally {
      setBusy(false);
    }
  }, [draft]);

  const createClient = useCallback(async () => {
    if (dirty && !window.confirm('Discard unsaved changes to the open case?')) return;
    setBusy(true);
    try {
      const created = await api.createClient();
      setClients((current) =>
        [...current, toSummary(created)].sort((a, b) =>
          a.clientNumber.localeCompare(b.clientNumber),
        ),
      );
      navigate({ screen: 'profile', clientNumber: created.clientNumber });
    } catch (error: unknown) {
      setCaseError(describeError(error));
    } finally {
      setBusy(false);
    }
  }, [dirty, navigate]);

  const deleteClient = useCallback(async () => {
    if (activeClientNumber === null) return;
    const confirmed = window.confirm(
      `Delete case ${activeClientNumber}? This cannot be undone.`,
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      await api.deleteClient(activeClientNumber);
      const remaining = clients.filter((c) => c.clientNumber !== activeClientNumber);
      setClients(remaining);
      setDraft(null);
      setSaved(null);
      setLastClientNumber(null);
      const next = remaining[0]?.clientNumber;
      navigate(
        next === undefined
          ? { screen: 'profile', clientNumber: null }
          : { screen: 'profile', clientNumber: next },
      );
    } catch (error: unknown) {
      setCaseError(describeError(error));
    } finally {
      setBusy(false);
    }
  }, [activeClientNumber, clients, navigate]);

  const saveTicker = useCallback(async (ticker: Ticker) => {
    const result = await api.saveTicker(ticker);
    setTickers((current) => current.map((t) => (t.symbol === result.symbol ? result : t)));
  }, []);

  const saveDefinition = useCallback(async (definition: BucketDefinition) => {
    const result = await api.saveBucketDefinition(definition);
    setDefinitions((current) => current.map((d) => (d.bucket === result.bucket ? result : d)));
  }, []);

  const today = useMemo(() => new Date(), []);

  return (
    <div>
      <header className="app-header">
        <div className="brand">
          <h1>AI4RIG</h1>
          <span className="muted">Railroad Investment Group</span>
        </div>

        <ClientSwitcher
          clients={clients}
          activeClientNumber={activeClientNumber}
          onSelect={selectClient}
          disabled={busy}
        />

        <button type="button" onClick={() => void createClient()} disabled={busy}>
          New client
        </button>

        <nav aria-label="Screens">
          <a
            href={hrefFor({ screen: 'profile', clientNumber: activeClientNumber })}
            aria-current={route.screen === 'profile' ? 'page' : undefined}
          >
            Profile
          </a>
          <a
            href={hrefFor({ screen: 'breakdown', clientNumber: activeClientNumber })}
            aria-current={route.screen === 'breakdown' ? 'page' : undefined}
          >
            Breakdown
          </a>
          <a
            href={hrefFor({ screen: 'tickers', clientNumber: null })}
            aria-current={route.screen === 'tickers' ? 'page' : undefined}
          >
            Tickers
          </a>
        </nav>

        {route.screen !== 'tickers' && (
          <div className="save-bar">
            {dirty && <span className="muted">Unsaved changes</span>}
            <button
              type="button"
              className="primary"
              disabled={!dirty || busy}
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : 'Save case'}
            </button>
            <button
              type="button"
              className="danger"
              disabled={busy || activeClientNumber === null}
              onClick={() => void deleteClient()}
            >
              Delete
            </button>
          </div>
        )}
      </header>

      {api.usingFixtures && (
        <p className="fixture-banner">
          Fixture mode — sample data, not the API. Changes are lost on reload. Set{' '}
          <code>VITE_USE_FIXTURES=false</code> once the endpoints exist.
        </p>
      )}

      <main>
        {referenceError !== null && (
          <Callout tone="warning" title="Could not load reference data">
            {referenceError}
          </Callout>
        )}

        {route.screen === 'tickers' ? (
          <BucketAssignments
            tickers={tickers}
            definitions={definitions}
            onSaveTicker={saveTicker}
            onSaveDefinition={saveDefinition}
          />
        ) : caseError !== null ? (
          <Callout tone="warning" title="Could not open this case">
            {caseError}
          </Callout>
        ) : clients.length === 0 && draft === null ? (
          <p className="empty">No client cases. Use “New client” to create one.</p>
        ) : draft === null ? (
          <p className="empty">Loading…</p>
        ) : route.screen === 'breakdown' ? (
          <AssetClassBreakdown clientCase={draft} tickers={tickers} />
        ) : (
          <ClientProfile clientCase={draft} tickers={tickers} onChange={setDraft} today={today} />
        )}
      </main>
    </div>
  );
}

function toSummary(c: ClientCase): ClientSummary {
  return {
    clientNumber: c.clientNumber,
    initials: c.initials,
    lifeStage: c.lifeStage,
    updatedAt: c.updatedAt,
  };
}

function describeError(error: unknown): string {
  return error instanceof ApiError ? error.message : String(error);
}
