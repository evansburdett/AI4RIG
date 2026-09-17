import { useCallback, useEffect, useMemo, useState } from 'react';

import { api, ApiError } from './api.js';
import { ClientSwitcher } from './components/ClientSwitcher.js';
import { Callout } from './components/Callout.js';
import type { BucketDefinition, ClientCase, ClientSummary, Ticker } from './domain/types.js';
import { AssetClassBreakdown } from './screens/AssetClassBreakdown.js';
import { BucketAssignments } from './screens/BucketAssignments.js';
import { ClientProfile } from './screens/ClientProfile.js';
import { hrefFor, useRoute, type Screen } from './routing.js';

/**
 * The application shell: reference data, the active client, and which screen is
 * showing.
 *
 * State lives here rather than in a store because there is very little of it —
 * a list of clients, one open case, and the ticker universe. A store would be
 * indirection around four `useState` calls. If this grows past what one file
 * can hold, that is the signal to add one.
 *
 * The active client is in the URL, not in component state, which is what makes
 * US-03 work properly: switching client re-routes, so the back button retraces
 * the advisor's path through their book and a specific client's breakdown is a
 * link they can keep.
 */
export function App() {
  const [route, navigate] = useRoute();

  const [clients, setClients] = useState<readonly ClientSummary[]>([]);
  const [tickers, setTickers] = useState<readonly Ticker[]>([]);
  const [definitions, setDefinitions] = useState<readonly BucketDefinition[]>([]);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  /** The open case, as edited. `saved` is what the server last confirmed. */
  /**
   * The client to return to from a screen that has none of its own.
   *
   * The ticker editor is firm-wide, so its route carries no client number. That
   * used to mean an advisor who checked a symbol came back to whichever client
   * sorted first, not the one they had open. Remembering the last one keeps the
   * switcher honest across a screen that does not belong to anybody.
   */
  const [lastClientNumber, setLastClientNumber] = useState<string | null>(null);

  const [draft, setDraft] = useState<ClientCase | null>(null);
  const [saved, setSaved] = useState<ClientCase | null>(null);
  const [caseError, setCaseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reference data, once.
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

  // Land somewhere useful rather than on an empty screen: where the advisor
  // last was, or the first client if this is a cold start.
  useEffect(() => {
    if (route.clientNumber !== null || route.screen === 'tickers') return;
    const target = lastClientNumber ?? clients[0]?.clientNumber;
    if (target !== undefined) navigate({ screen: 'profile', clientNumber: target });
  }, [clients, lastClientNumber, route.clientNumber, route.screen, navigate]);

  // The open case follows the URL.
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

  /** What the switcher shows, and where the Profile/Breakdown links point. */
  const activeClientNumber = route.clientNumber ?? lastClientNumber;

  const selectClient = useCallback(
    (clientNumber: string) => {
      // Keep the advisor on the screen they are reading. Someone comparing two
      // clients' breakdowns should not be dropped back to the intake form.
      const screen: Screen = route.screen === 'tickers' ? 'profile' : route.screen;
      navigate({ screen, clientNumber });
    },
    [navigate, route.screen],
  );

  const save = useCallback(async () => {
    if (draft === null) return;
    setSaving(true);
    try {
      const result = await api.saveClient(draft);
      setSaved(result);
      setDraft(result);
      setClients((current) =>
        current.map((c) =>
          c.clientNumber === result.clientNumber
            ? {
                clientNumber: result.clientNumber,
                initials: result.initials,
                lifeStage: result.lifeStage,
                updatedAt: result.updatedAt,
              }
            : c,
        ),
      );
    } catch (error: unknown) {
      setCaseError(describeError(error));
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const saveTicker = useCallback(async (ticker: Ticker) => {
    const result = await api.saveTicker(ticker);
    setTickers((current) => current.map((t) => (t.symbol === result.symbol ? result : t)));
  }, []);

  const saveDefinition = useCallback(async (definition: BucketDefinition) => {
    const result = await api.saveBucketDefinition(definition);
    setDefinitions((current) => current.map((d) => (d.bucket === result.bucket ? result : d)));
  }, []);

  // `new Date()` once per render pass rather than inside the date helpers, so a
  // screen cannot show two different "today"s and a test can pass its own.
  const today = useMemo(() => new Date(), []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1>AI4RIG</h1>
          <span className="muted">Bucket planning · Railroad Investment Group</span>
        </div>

        <ClientSwitcher
          clients={clients}
          activeClientNumber={activeClientNumber}
          onSelect={selectClient}
          disabled={saving}
        />

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
            <button type="button" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save case'}
            </button>
          </div>
        )}
      </header>

      {api.usingFixtures && (
        <p className="fixture-banner">
          Fixture mode — screens are reading sample data, not the API. Set{' '}
          <code>VITE_USE_FIXTURES=false</code> once the client and ticker endpoints exist.
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
        ) : draft === null ? (
          <p className="muted">Loading…</p>
        ) : route.screen === 'breakdown' ? (
          <AssetClassBreakdown clientCase={draft} tickers={tickers} />
        ) : (
          <ClientProfile
            clientCase={draft}
            tickers={tickers}
            onChange={setDraft}
            today={today}
          />
        )}
      </main>
    </div>
  );
}

function describeError(error: unknown): string {
  return error instanceof ApiError ? error.message : String(error);
}
