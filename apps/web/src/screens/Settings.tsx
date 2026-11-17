import { useEffect, useState } from 'react';

import { api } from '../api.js';
import { Callout } from '../components/Callout.js';
import { CaseTransfer } from '../components/CaseTransfer.js';
import { bpsToPercentInput, parsePercentToBps } from '../domain/percent.js';
import type { AlertThresholds, AppSettings } from '../domain/types.js';

interface Props {
  /** The alert thresholds changed, so the open case's alerts can follow. */
  onThresholdsChange: (thresholds: AlertThresholds) => void;
  /** Cases came in from another computer. */
  onCasesImported: () => Promise<void>;
}

/**
 * Settings for this computer: the API keys behind "Estimate with AI" (US-28)
 * and live prices. A key is typed once and kept on this computer; the app only
 * ever reports whether one is set, never the key itself.
 */
export function Settings({ onThresholdsChange, onCasesImported }: Props) {
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

      {settings !== null && (
        <ThresholdsCard
          thresholds={settings.thresholds}
          onSave={async (thresholds) => {
            const saved = await api.saveThresholds(thresholds);
            setSettings(saved);
            onThresholdsChange(saved.thresholds);
          }}
        />
      )}

      <CaseTransfer onImported={onCasesImported} />

      <KeyCard
        id="market-data-key"
        title="Live prices"
        description={
          <>
            Used by Refresh prices. Kept on this computer only.
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
            Used by Estimate with AI. Kept on this computer only.
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

/** RIG (11/2): when an account's cash or its model calls for a rebalance. */
function ThresholdsCard({
  thresholds,
  onSave,
}: {
  thresholds: AlertThresholds;
  onSave: (thresholds: AlertThresholds) => Promise<void>;
}) {
  const [cashText, setCashText] = useState(bpsToPercentInput(thresholds.cashExcessBps));
  const [driftText, setDriftText] = useState(bpsToPercentInput(thresholds.driftBps));
  const [greenText, setGreenText] = useState(bpsToPercentInput(thresholds.guardrailGreenMaxBps));
  const [redText, setRedText] = useState(bpsToPercentInput(thresholds.guardrailRedMinBps));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cash = parsePercentToBps(cashText);
  const drift = parsePercentToBps(driftText);
  const green = parsePercentToBps(greenText);
  const red = parsePercentToBps(redText);
  const guardrailsValid = green !== null && red !== null && green < red;
  const valid = cash !== null && drift !== null && drift > 0 && guardrailsValid;

  async function save() {
    if (cash === null || drift === null || green === null || red === null) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await onSave({ cashExcessBps: cash, driftBps: drift, guardrailGreenMaxBps: green, guardrailRedMinBps: red });
      setNotice('Saved. Account alerts and new reports use these now.');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h3>Alerts</h3>
      <p className="muted">When an account&rsquo;s cash or model needs a rebalance.</p>
      <div className="grid two">
        <div className="field">
          <label htmlFor="cash-threshold">Extra cash before a rebalance (% of the account)</label>
          <input
            id="cash-threshold"
            type="text"
            inputMode="decimal"
            value={cashText}
            aria-invalid={cash === null}
            onChange={(event) => setCashText(event.target.value)}
          />
          <p className="field-hint">Default 5%.</p>
        </div>
        <div className="field">
          <label htmlFor="drift-threshold">Drift before a fund is flagged (percentage points)</label>
          <input
            id="drift-threshold"
            type="text"
            inputMode="decimal"
            value={driftText}
            aria-invalid={drift === null || drift === 0}
            onChange={(event) => setDriftText(event.target.value)}
          />
          <p className="field-hint">Default 1.</p>
        </div>
      </div>
      <h4>Report spending guardrails</h4>
      <p className="muted">
        A year&rsquo;s withdrawals as a share of total assets, as in RIG&rsquo;s Bucket Deliverable. Saved reports keep
        the limits they were made with.
      </p>
      <div className="grid two">
        <div className="field">
          <label htmlFor="guardrail-green">Green up to (%)</label>
          <input
            id="guardrail-green"
            type="text"
            inputMode="decimal"
            value={greenText}
            aria-invalid={!guardrailsValid}
            onChange={(event) => setGreenText(event.target.value)}
          />
          <p className="field-hint">Default 3.5%. Above this is yellow.</p>
        </div>
        <div className="field">
          <label htmlFor="guardrail-red">Red from (%)</label>
          <input
            id="guardrail-red"
            type="text"
            inputMode="decimal"
            value={redText}
            aria-invalid={!guardrailsValid}
            onChange={(event) => setRedText(event.target.value)}
          />
          <p className="field-hint">Default 7%. Has to be above the green limit.</p>
        </div>
      </div>
      <div className="button-row">
        <button type="button" className="primary" disabled={!valid || busy} onClick={() => void save()}>
          {busy ? 'Saving\u2026' : 'Save'}
        </button>
        {notice !== null && <span className="muted">{notice}</span>}
      </div>
      {error !== null && <p className="field-error">{error}</p>}
    </section>
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
