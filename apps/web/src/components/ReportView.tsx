import logoUrl from '../assets/rig-logo.png';
import { formatDateTime } from '../domain/dates.js';
import { formatCentsWhole } from '../domain/money.js';
import { guardrailLevels, guardrailLight, percentText, type GuardrailLevel } from '../domain/report.js';
import { DEFAULT_THRESHOLDS, type ReportSnapshot } from '../domain/types.js';

interface Props {
  snapshot: ReportSnapshot;
  createdAt: string;
  /** Typed for this printout only; never saved (ADR 0006). */
  clientName: string;
}

function money(cents: number): string {
  return `${cents < 0 ? '−' : ''}${formatCentsWhole(Math.abs(cents))}`;
}

/**
 * The bucket report as the client sees it, laid out and worded like RIG's
 * Bucket Deliverable: the three buckets side by side with what each is for,
 * then the spending guardrails and RIG's three levels. Also what prints when
 * it is saved as a PDF.
 */
export function ReportView({ snapshot, createdAt, clientName }: Props) {
  const { guardrails } = snapshot;
  // Reports from 0.1.6 have no limits of their own; RIG's stood then.
  const greenMaxBps = guardrails.greenMaxBps ?? DEFAULT_THRESHOLDS.guardrailGreenMaxBps;
  const redMinBps = guardrails.redMinBps ?? DEFAULT_THRESHOLDS.guardrailRedMinBps;
  const light = guardrailLight(guardrails.totalWithdrawalsCents, snapshot.totalCents, greenMaxBps, redMinBps);
  const levels = guardrailLevels(greenMaxBps, redMinBps);
  const name = clientName.trim();

  return (
    <article className="report">
      <img className="report-logo" src={logoUrl} alt="Railroad Investment Group" />
      <header className="report-head">
        <div>
          <h2>{name !== '' ? name : `Client ${snapshot.clientNumber}${snapshot.initials !== '' ? ` (${snapshot.initials})` : ''}`}</h2>
          <p className="muted">
            {snapshot.lifeStageLabel}
            {snapshot.planYears !== null ? ` · plan covers ${snapshot.planYears} years` : ''}
          </p>
        </div>
        <div className="report-total">
          <span className="muted">Total Assets</span>
          <strong>{formatCentsWhole(snapshot.totalCents)}</strong>
          <span className="muted">As of {formatDateTime(createdAt)}</span>
        </div>
      </header>

      <div className="report-buckets">
        {snapshot.buckets.map((bucket) => (
          <section key={bucket.bucket} className={`report-bucket report-bucket-${bucket.bucket.toLowerCase()}`}>
            <h3>{bucket.title}</h3>
            <p className="report-bucket-amount">{formatCentsWhole(bucket.actualCents)}</p>
            <p className="report-bucket-subtitle">{bucket.subtitle}</p>
            <ul>
              {bucket.lines.map((line) => (
                <li key={line.label}>{line.label}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="report-lower">
        <section>
          <h3>Spending Guardrails</h3>
          <table>
            <tbody>
              <tr>
                <th scope="row">YTD Spending Budget from Investments:</th>
                <td className="amount">{money(guardrails.budgetCents)}</td>
              </tr>
              <tr>
                <th scope="row">Total Withdrawals</th>
                <td className="amount">{money(guardrails.totalWithdrawalsCents)}</td>
              </tr>
              {guardrails.withdrawals.map((w) => (
                <tr key={w.label}>
                  <th scope="row" className="report-indent">
                    {w.label.endsWith(':') ? w.label : `${w.label}:`}
                  </th>
                  <td className="amount">{money(w.amountCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={light === null ? undefined : `guardrail-${light.toLowerCase()}`}>
                <th scope="row">Amount Remaining:</th>
                <td className="amount">{money(guardrails.remainingCents)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section>
          <h3>By account</h3>
          <table>
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col" className="amount">
                  Now
                </th>
                <th scope="col" className="amount">
                  Soon
                </th>
                <th scope="col" className="amount">
                  Later
                </th>
              </tr>
            </thead>
            <tbody>
              {snapshot.accounts.map((a, i) => (
                <tr key={`${a.label}-${i}`}>
                  <th scope="row">{a.label}</th>
                  <td className="amount">{formatCentsWhole(a.nowCents)}</td>
                  <td className="amount">{formatCentsWhole(a.soonCents)}</td>
                  <td className="amount">{formatCentsWhole(a.laterCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {light !== null && (
            <GuardrailGauge
              rateBps={Math.round((guardrails.totalWithdrawalsCents * 10_000) / snapshot.totalCents)}
              greenMaxBps={greenMaxBps}
              redMinBps={redMinBps}
              level={levels.find((l) => l.light === light)!}
            />
          )}
        </section>
      </div>
    </article>
  );
}

/**
 * Where this year's withdrawals sit against RIG's limits: a three-color bar
 * with a marker, then RIG's words for the level it lands in (D31).
 */
function GuardrailGauge({
  rateBps,
  greenMaxBps,
  redMinBps,
  level,
}: {
  rateBps: number;
  greenMaxBps: number;
  redMinBps: number;
  level: GuardrailLevel;
}) {
  // Each color gets a third of the bar; the marker sits in proportion within its third. Red runs to twice its limit.
  const third = 100 / 3;
  const within = (from: number, to: number) => Math.min(Math.max((rateBps - from) / (to - from), 0), 1);
  const position =
    rateBps <= greenMaxBps
      ? within(0, greenMaxBps) * third
      : rateBps < redMinBps
        ? third + within(greenMaxBps, redMinBps) * third
        : 2 * third + within(redMinBps, redMinBps * 2) * third;

  return (
    <div className={`guardrail-gauge guardrail-${level.light.toLowerCase()}`}>
      <p className="guardrail-rate">
        Withdrawals are <strong>{percentText(rateBps)}</strong> of total assets
      </p>
      <div className="guardrail-bar" aria-hidden="true">
        <span className="guardrail-segment green">{percentText(greenMaxBps)} or less</span>
        <span className="guardrail-segment yellow">
          {percentText(greenMaxBps)} to {percentText(redMinBps)}
        </span>
        <span className="guardrail-segment red">{percentText(redMinBps)} or more</span>
        <span className="guardrail-marker" style={{ left: `${position}%` }} />
      </div>
      <div className="guardrail-level">
        <strong>
          <span aria-hidden="true">{level.icon}</span> {level.heading}
        </strong>
        <p>
          {level.plan}: {level.explanation}
        </p>
      </div>
    </div>
  );
}
