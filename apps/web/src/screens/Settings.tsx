import { useEffect, useState } from 'react';

import { api } from '../api.js';
import { Callout } from '../components/Callout.js';
import type { AppSettings } from '../domain/types.js';

/**
 * Settings for this computer: the API keys behind "Estimate with AI" (US-28)
 * and live prices. A key is typed once and kept on this computer; the app only
 * ever reports whether one is set, never the key itself.
 */
export function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getSettings()
      .then((loaded) => {
        if (!cancelled) setSettings(loaded);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setLoadError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <header className="screen-header">
        <h2>Settings</h2>
        <p className="muted">Settings for this computer only.</p>
      </header>

      {loadError !== null && (
        <Callout tone="error" title="Could not load settings">
          {loadError}
        </Callout>
      )}

      <KeyCard
        id="market-data-key"
        title="Live prices"
        description={
          <>
            The Market Data API key behind &ldquo;Refresh prices&rdquo;, from the firm&rsquo;s Market
            Data dashboard. Only ticker symbols are ever sent with it. It is kept on this computer
            only.
          </>
        }
        keyName="Market Data API key"
        placeholder="Paste the key"
        envName="MARKETDATA_API_KEY"
        savedNotice="Key saved. Prices will refresh when a client is opened."
        configured={settings?.marketDataKeyConfigured}
        editable={settings?.marketDataKeyEditable}
        onSave={async (apiKey) => setSettings(await api.saveMarketDataKey(apiKey))}
      />

      <KeyCard
        id="openai-key"
        title="AI life expectancy"
        description={
          <>
            The OpenAI API key behind &ldquo;Estimate with AI&rdquo; on the profile. It is kept on this
            computer only.
          </>
        }
        keyName="OpenAI API key"
        placeholder="sk-…"
        envName="OPENAI_API_KEY"
        savedNotice={'Key saved. "Estimate with AI" is ready to use.'}
        configured={settings?.openAiKeyConfigured}
        editable={settings?.openAiKeyEditable}
        detail={settings === null ? undefined : `Model: ${settings.openAiModel}`}
        onSave={async (apiKey) => setSettings(await api.saveOpenAiKey(apiKey))}
      />
    </div>
  );
}

function KeyCard({
  id,
  title,
  description,
  keyName,
  placeholder,
  envName,
  savedNotice,
  configured,
  editable,
  detail,
  onSave,
}: {
  id: string;
  title: string;
  description: React.ReactNode;
  keyName: string;
  placeholder: string;
  envName: string;
  savedNotice: string;
  /** Undefined while the settings load. */
  configured: boolean | undefined;
  editable: boolean | undefined;
  detail?: string | undefined;
  onSave: (apiKey: string | null) => Promise<void>;
}) {
  const [keyText, setKeyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function saveKey(apiKey: string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await onSave(apiKey);
      setKeyText('');
      setNotice(apiKey === null ? 'Key removed.' : savedNotice);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h3>{title}</h3>
      <p className="muted">{description}</p>

      {configured === undefined ? (
        <p className="empty">Loading…</p>
      ) : (
        <>
          <p>
            {configured ? <strong>A key is set.</strong> : <span className="text-warn">No key yet.</span>}{' '}
            {detail !== undefined && <span className="muted">{detail}</span>}
          </p>

          {editable === true ? (
            <>
              <div className="field">
                <label htmlFor={id}>{configured ? 'Replace the key' : keyName}</label>
                <input
                  id={id}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={placeholder}
                  value={keyText}
                  onChange={(event) => setKeyText(event.target.value)}
                />
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="primary"
                  disabled={busy || keyText.trim() === ''}
                  onClick={() => void saveKey(keyText.trim())}
                >
                  {busy ? 'Saving…' : 'Save key'}
                </button>
                {configured && (
                  <button type="button" className="danger" disabled={busy} onClick={() => void saveKey(null)}>
                    Remove key
                  </button>
                )}
                {notice !== null && <span className="muted">{notice}</span>}
              </div>
              {error !== null && <p className="field-error">{error}</p>}
            </>
          ) : (
            <p className="muted">
              On this development machine the key comes from <code>{envName}</code> in <code>.env</code>.
              Change it there and restart the API.
            </p>
          )}
        </>
      )}
    </section>
  );
}
