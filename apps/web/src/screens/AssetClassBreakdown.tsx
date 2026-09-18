import { useMemo } from 'react';

import { BucketBar } from '../components/BucketBar.js';
import { Callout } from '../components/Callout.js';
import { bucketsByAccount, computeBreakdown, computeDrift } from '../domain/breakdown.js';
import {
  ACCOUNT_TYPE_LABELS,
  ASSET_CLASS_LABELS,
  BUCKET_LABELS,
  LIFE_STAGE_LABELS,
} from '../domain/lifeStage.js';
import { formatCents, formatCentsWhole, formatPercent } from '../domain/money.js';
import type { ClientCase, Ticker } from '../domain/types.js';
import type { Slice } from '../domain/breakdown.js';
import { computePlanTotals, targetAllocation } from '../domain/worksheet.js';

interface Props {
  clientCase: ClientCase;
  tickers: readonly Ticker[];
}

/**
 * US-11 — asset class distribution, overall and per bucket. The per-bucket view
 * is the useful one: equity concentration inside Soon is a problem the overall
 * figure hides.
 */
export function AssetClassBreakdown({ clientCase, tickers }: Props) {
  const breakdown = useMemo(() => computeBreakdown(clientCase, tickers), [clientCase, tickers]);
  const totals = useMemo(() => computePlanTotals(clientCase), [clientCase]);
  const target = useMemo(() => targetAllocation(clientCase, totals), [clientCase, totals]);
  const drift = useMemo(() => computeDrift(target, breakdown), [target, breakdown]);
  const perAccount = useMemo(() => bucketsByAccount(clientCase), [clientCase]);

  return (
    <div>
      <header className="screen-header">
        <h2>Asset class breakdown</h2>
        <p className="muted">
          Case {clientCase.clientNumber} · {LIFE_STAGE_LABELS[clientCase.lifeStage]} ·{' '}
          {formatCents(breakdown.totalCents)} across {clientCase.accounts.length} accounts
        </p>
      </header>

      {breakdown.unknownSymbols.length > 0 && (
        <Callout tone="warning" title="Symbols missing from the approved universe">
          <p>
            {breakdown.unknownSymbols.map((s) => (
              <code key={s}>{s}</code>
            ))}{' '}
            held but not in the ticker list, so they have no asset class. The value still counts
            toward the totals. Usually a typo or a gap in the master list.
          </p>
        </Callout>
      )}

      <section className="card">
        <h3>Whole portfolio</h3>
        <SliceTable slices={breakdown.byAssetClass} totalCents={breakdown.totalCents} />
      </section>

      <section className="card">
        <h3>Target against actual</h3>
        <p className="muted">
          Target is what the worksheet says this client needs in each bucket. Actual is where the
          holdings are assigned today.
        </p>

        <BucketBar
          totalCents={breakdown.totalCents}
          segments={breakdown.byBucket.map((b) => ({ bucket: b.bucket, valueCents: b.valueCents }))}
        />

        <table>
          <thead>
            <tr>
              <th scope="col">Bucket</th>
              <th scope="col" className="amount">
                Target
              </th>
              <th scope="col" className="amount">
                Target %
              </th>
              <th scope="col" className="amount">
                Actual
              </th>
              <th scope="col" className="amount">
                Actual %
              </th>
              <th scope="col" className="amount">
                Difference
              </th>
            </tr>
          </thead>
          <tbody>
            {drift.map((row) => (
              <tr key={row.bucket}>
                <th scope="row">
                  <span
                    className={`swatch bucket-${row.bucket.toLowerCase()}`}
                    aria-hidden="true"
                  />{' '}
                  {BUCKET_LABELS[row.bucket]}
                </th>
                <td className="amount">{formatCentsWhole(row.targetCents)}</td>
                <td className="amount">{formatPercent(row.targetPct)}</td>
                <td className="amount">{formatCentsWhole(row.actualCents)}</td>
                <td className="amount">{formatPercent(row.actualPct)}</td>
                <td className="amount">
                  {row.deltaCents === 0 ? (
                    <span className="muted">on target</span>
                  ) : (
                    `${row.deltaCents > 0 ? '+' : '\u2212'}${formatCentsWhole(Math.abs(row.deltaCents))}`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="field-hint">
          Target percentages are derived from this client&rsquo;s worksheet inputs, per RIG&rsquo;s
          answer that they are &ldquo;calculated using the inputs we provided on the attached
          spreadsheet.&rdquo;
        </p>
      </section>

      <section className="card">
        <h3>Buckets by account</h3>
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
              <th scope="col" className="amount">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {perAccount.map((account) => (
              <tr key={account.accountId}>
                <th scope="row">
                  {ACCOUNT_TYPE_LABELS[account.accountType]}
                  {account.maskedNumber === '' ? '' : ` ····${account.maskedNumber}`}
                </th>
                <td className="amount">{formatCentsWhole(account.nowCents)}</td>
                <td className="amount">{formatCentsWhole(account.soonCents)}</td>
                <td className="amount">{formatCentsWhole(account.laterCents)}</td>
                <td className="amount">{formatCentsWhole(account.totalCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">All accounts</th>
              <td className="amount">
                {formatCentsWhole(perAccount.reduce((t, a) => t + a.nowCents, 0))}
              </td>
              <td className="amount">
                {formatCentsWhole(perAccount.reduce((t, a) => t + a.soonCents, 0))}
              </td>
              <td className="amount">
                {formatCentsWhole(perAccount.reduce((t, a) => t + a.laterCents, 0))}
              </td>
              <td className="amount">
                {formatCentsWhole(perAccount.reduce((t, a) => t + a.totalCents, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {breakdown.byBucket.map((composition) => (
        <section className="card" key={composition.bucket}>
          <h3>
            <span className={`swatch bucket-${composition.bucket.toLowerCase()}`} aria-hidden="true" />
            {BUCKET_LABELS[composition.bucket]} bucket
          </h3>
          <p className="muted">
            {formatCents(composition.valueCents)} — {formatPercent(composition.pctOfPortfolio)} of
            the portfolio
          </p>

          {composition.slices.length === 0 ? (
            <p className="muted">Nothing classified in this bucket.</p>
          ) : (
            <SliceTable slices={composition.slices} totalCents={composition.valueCents} />
          )}
        </section>
      ))}

    </div>
  );
}

function SliceTable({ slices, totalCents }: { slices: readonly Slice[]; totalCents: number }) {
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">Asset class</th>
          <th scope="col">Value</th>
          <th scope="col">Share</th>
          <th scope="col">
            <span className="visually-hidden">Proportion</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {slices.map((slice) => (
          <tr key={slice.assetClass}>
            <th scope="row">{ASSET_CLASS_LABELS[slice.assetClass]}</th>
            <td className="amount">{formatCents(slice.valueCents)}</td>
            <td className="amount">{formatPercent(slice.pct)}</td>
            <td className="meter-cell">
              <div className="meter">
                <div className="meter-fill" style={{ width: `${slice.pct}%` }} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">Total</th>
          <td className="amount">{formatCents(totalCents)}</td>
          <td className="amount">100.0%</td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}
