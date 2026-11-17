import { formatDateTime } from '../domain/dates.js';
import { formatCentsWhole } from '../domain/money.js';
import { formatBps } from '../domain/percent.js';
import type { ReportSnapshot } from '../domain/types.js';

import { Stoplight } from './Stoplight.js';

interface Props {
  snapshot: ReportSnapshot;
  createdAt: string;
  /** Typed for this printout only; never saved (ADR 0006). */
  clientName: string;
}

function signed(cents: number): string {
  if (cents === 0) return 'on target';
  return `${cents > 0 ? '+' : '−'}${formatCentsWhole(Math.abs(cents))}`;
}

/**
 * The bucket report as the client sees it, laid out like RIG's Bucket
 * Deliverable: the three buckets side by side, what each is for, and the
 * spending guardrails below. Also what prints when it is saved as a PDF.
 */
export function ReportView({ snapshot, createdAt, clientName }: Props) {
  const { guardrails } = snapshot;
  return (
    <article className="report">
      <header className="report-head">
        <div>
          <h2>Bucket plan</h2>
          <p className="muted">
            {clientName.trim() !== '' ? clientName.trim() : `Client ${snapshot.clientNumber}`}
            {snapshot.initials !== '' && clientName.trim() === '' ? ` (${snapshot.initials})` : ''} ·{' '}
            {snapshot.lifeStageLabel}
            {snapshot.planYears !== null ? ` · plan covers ${snapshot.planYears} years` : ''}
          </p>
        </div>
        <div className="report-total">
          <span className="muted">Total assets</span>
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
                <li key={line.label}>
                  <span>{line.label}</span>
                  {line.amountCents !== null && <span className="amount">{formatCentsWhole(line.amountCents)}</span>}
                </li>
              ))}
            </ul>
            <dl>
              <div>
                <dt>{bucket.bucket === 'LATER' ? 'Room in the plan' : 'Plan needs'}</dt>
                <dd>{formatCentsWhole(bucket.targetCents)}</dd>
              </div>
              <div>
                <dt>Variance</dt>
                <dd>{signed(bucket.varianceCents)}</dd>
              </div>
            </dl>
            <Stoplight light={bucket.light} message={bucket.message} compact />
          </section>
        ))}
      </div>

      <div className="report-lower">
        <section>
          <h3>Spending guardrails</h3>
          <table>
            <tbody>
              <tr>
                <th scope="row">Yearly spending budget from investments ({formatBps(guardrails.budgetBps)})</th>
                <td className="amount">{formatCentsWhole(guardrails.budgetCents)}</td>
              </tr>
              {guardrails.withdrawals.map((w) => (
                <tr key={w.label}>
                  <th scope="row" className="report-indent">
                    {w.label}
                  </th>
                  <td className="amount">{formatCentsWhole(w.amountCents)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">Total withdrawals</th>
                <td className="amount">{formatCentsWhole(guardrails.totalWithdrawalsCents)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Amount remaining</th>
                <td className={`amount${guardrails.remainingCents < 0 ? ' text-danger' : ''}`}>
                  {guardrails.remainingCents < 0 ? '−' : ''}
                  {formatCentsWhole(Math.abs(guardrails.remainingCents))}
                </td>
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
        </section>
      </div>
    </article>
  );
}
