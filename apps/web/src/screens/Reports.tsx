import { useEffect, useMemo, useState } from 'react';

import { api } from '../api.js';
import { Callout } from '../components/Callout.js';
import { CellInput } from '../components/CellInput.js';
import { ReportView } from '../components/ReportView.js';
import { cashTargetsByAccount, feesByAccount, modelsById } from '../domain/breakdown.js';
import { formatDateTime } from '../domain/dates.js';
import { centsToInput, parseCents } from '../domain/money.js';
import { bpsToPercentInput, parsePercentToBps } from '../domain/percent.js';
import { buildReport, defaultGuardrails, reportReadiness, type GuardrailInputs } from '../domain/report.js';
import type { AdvisoryFeeTier, ClientCase, ClientReport, ModelPortfolio, Ticker } from '../domain/types.js';
import { accountAdvisoryFees } from '../domain/worksheet.js';

interface Props {
  clientCase: ClientCase;
  tickers: readonly Ticker[];
  feeTiers: readonly AdvisoryFeeTier[];
  models: readonly ModelPortfolio[];
  /** False while the case has unsaved edits: a report is of the saved case. */
  saved: boolean;
  today: Date;
}

/**
 * Bucket reports (RIG, 11/2). Generating one needs the accounts and plan
 * filled in and saved. Each report is kept as it was, newest first, so the
 * advisor can bring last quarter's to this quarter's review. Download PDF
 * prints the report alone; the client's name is typed for that printout and
 * never stored.
 */
export function Reports({ clientCase, tickers, feeTiers, models, saved, today }: Props) {
  const [reports, setReports] = useState<ClientReport[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [guardrails, setGuardrails] = useState<GuardrailInputs>(() => defaultGuardrails(clientCase));
  const [clientName, setClientName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fees = useMemo(
    () => cashTargetsByAccount(clientCase, feesByAccount(accountAdvisoryFees(clientCase, feeTiers)), modelsById(models)),
    [clientCase, feeTiers, models],
  );
  const readiness = reportReadiness(clientCase, tickers, fees, saved);
  const ready = readiness.every((item) => item.ok);

  useEffect(() => {
    let cancelled = false;
    setReports(null);
    setGuardrails(defaultGuardrails(clientCase));
    api
      .listReports(clientCase.clientNumber)
      .then((list) => {
        if (cancelled) return;
        setReports(list);
        setSelectedId(list[0]?.id ?? null);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      cancelled = true;
    };
    // A different case, not every edit to this one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientCase.clientNumber]);

  const selected = reports?.find((r) => r.id === selectedId) ?? null;

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const snapshot = buildReport(clientCase, tickers, feeTiers, fees, guardrails, today);
      const created = await api.addReport(clientCase.clientNumber, snapshot);
      setReports((current) => [created, ...(current ?? [])]);
      setSelectedId(created.id);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove(report: ClientReport) {
    if (!window.confirm(`Delete the report from ${formatDateTime(report.createdAt)}? This cannot be undone.`)) return;
    try {
      await api.deleteReport(clientCase.clientNumber, report.id);
      const rest = (reports ?? []).filter((r) => r.id !== report.id);
      setReports(rest);
      if (selectedId === report.id) setSelectedId(rest[0]?.id ?? null);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function setWithdrawal(index: number, amountCents: number) {
    setGuardrails({
      ...guardrails,
      withdrawals: guardrails.withdrawals.map((w, i) => (i === index ? { ...w, amountCents } : w)),
    });
  }

  return (
    <div>
      <header className="screen-header no-print">
        <h2>Bucket report</h2>
        <p className="muted">
          Case {clientCase.clientNumber}
        </p>
      </header>

      {error !== null && (
        <Callout tone="error" title="That did not go through">
          {error}
        </Callout>
      )}

      <section className="card no-print">
        <h3>New report</h3>
        <ul className="readiness">
          {readiness.map((item) => (
            <li key={item.label} className={item.ok ? 'ok' : 'missing'}>
              <span aria-hidden="true">{item.ok ? '✓' : '✗'}</span> {item.label}
            </li>
          ))}
        </ul>

        <h4>Spending guardrails</h4>
        <p className="muted">
          Periodic withdrawals and QCDs / RMDs come from the plan. Enter the rest for this year.
        </p>
        <table className="guardrail-inputs">
          <tbody>
            <tr>
              <th scope="row">Yearly spending budget</th>
              <td className="amount">
                <CellInput
                  label="Yearly spending budget, percent of total assets"
                  text={bpsToPercentInput(guardrails.budgetBps)}
                  parse={parsePercentToBps}
                  onChange={(budgetBps) => setGuardrails({ ...guardrails, budgetBps })}
                  suffix="%"
                />
              </td>
            </tr>
            {guardrails.withdrawals.map((w, index) => (
              <tr key={w.label}>
                <th scope="row">{w.label}</th>
                <td className="amount">
                  <CellInput
                    label={w.label}
                    text={centsToInput(w.amountCents)}
                    parse={(text) => {
                      const cents = parseCents(text);
                      return cents === null || cents < 0 ? null : cents;
                    }}
                    onChange={(cents) => setWithdrawal(index, cents)}
                    prefix="$"
                    money
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="button-row">
          <button type="button" className="primary" disabled={!ready || busy} onClick={() => void generate()}>
            {busy ? 'Generating…' : 'Generate report'}
          </button>
          {!ready && <span className="muted">Finish the items marked ✗ first.</span>}
        </div>
      </section>

      <section className="card no-print">
        <h3>Saved reports</h3>
        {reports === null ? (
          <p className="empty">Loading…</p>
        ) : reports.length === 0 ? (
          <p className="empty">No reports yet for this case.</p>
        ) : (
          <ul className="report-list">
            {reports.map((report) => (
              <li key={report.id} className={report.id === selectedId ? 'selected' : undefined}>
                <button type="button" className="link" onClick={() => setSelectedId(report.id)}>
                  {formatDateTime(report.createdAt)}
                </button>
                <button type="button" className="link danger-link" onClick={() => void remove(report)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected !== null && (
        <>
          <div className="card no-print report-actions">
            <div className="field">
              <label htmlFor="report-client-name">Client name for this printout</label>
              <input
                id="report-client-name"
                type="text"
                autoComplete="off"
                placeholder="Not saved"
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
              />
            </div>
            <button type="button" className="primary" onClick={() => window.print()}>
              Download PDF
            </button>
            <span className="muted">Choose Save as PDF in the print window. The name is not saved.</span>
          </div>
          <ReportView snapshot={selected.snapshot} createdAt={selected.createdAt} clientName={clientName} />
        </>
      )}
    </div>
  );
}
