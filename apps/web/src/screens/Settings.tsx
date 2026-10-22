import { useEffect, useState } from 'react';

import { api } from '../api.js';
import { Callout } from '../components/Callout.js';
import type { AppSettings } from '../domain/types.js';

/**
 * Settings for this computer. Today that is the OpenAI key behind "Estimate
 * with AI" (US-28). The key is typed once and kept on this computer; the app
 * only ever reports whether one is set, never the key itself.
 */
export function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keyText, setKeyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  async function saveKey(apiKey: string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setSettings(await api.saveOpenAiKey(apiKey));
      setKeyText('');
      setNotice(apiKey === null ? 'Key removed.' : 'Key saved. "Estimate with AI" is ready to use.');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

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

      <section className="card">
        <h3>AI life expectancy</h3>
        <p className="muted">
          The OpenAI API key behind &ldquo;Estimate with AI&rdquo; on the profile. It is kept on
          this computer only.
        </p>

        {settings === null ? (
          <p className="empty">Loading…</p>
        ) : (
          <>
            <p>
              {settings.openAiKeyConfigured ? (
                <strong>A key is set.</strong>
              ) : (
                <span className="text-warn">No key yet.</span>
              )}{' '}
              <span className="muted">Model: {settings.openAiModel}</span>
            </p>

            {settings.openAiKeyEditable ? (
              <>
                <div className="field">
                  <label htmlFor="openai-key">
                    {settings.openAiKeyConfigured ? 'Replace the key' : 'OpenAI API key'}
                  </label>
                  <input
                    id="openai-key"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="sk-…"
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
                  {settings.openAiKeyConfigured && (
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
                On this development machine the key comes from <code>OPENAI_API_KEY</code> in{' '}
                <code>.env</code>. Change it there and restart the API.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
