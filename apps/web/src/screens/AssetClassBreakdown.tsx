import { useMemo } from 'react';

import { BucketBar } from '../components/BucketBar.js';
import { Callout } from '../components/Callout.js';
import {
  bucketsByAccount,
  computeBreakdown,
  computeDrift,
  holdingsInBucket,
} from '../domain/breakdown.js';
import {
  ACCOUNT_TYPE_LABELS,
  ASSET_CLASS_LABELS,
  BUCKET_LABELS,
  LIFE_STAGE_LABELS,
  TAX_FUNNEL_LABELS,
} from '../domain/lifeStage.js';
import { formatCents, formatCentsWhole, formatPercent } from '../domain/money.js';
import type { ClientCase, ModelPortfolio, Ticker } from '../domain/types.js';
import type { Slice } from '../domain/breakdown.js';
import { computePlanTotals, targetAllocation } from '../domain/worksheet.js';

interface Props {
  clientCase: ClientCase;
  tickers: readonly Ticker[];
  models: readonly ModelPortfolio[];
}

/**
 * US-11 asset class distribution, overall and per bucket, plus where the
 * advisor's split sits against the worksheet. Everything here is derived from
 * the account balances, the bucket amounts, and the chosen models.
 */
export function AssetClassBreakdown({ clientCase, tickers, models }: Props) {
  const breakdown = useMemo(
    () => computeBreakdown(clientCase, tickers, models),
    [clientCase, tickers, models],
  );
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

      {breakdown.unallocatedCents !== 0 && (
        <Callout tone="warning" title="Not all of the money is in a bucket">
          {breakdown.unallocatedCents > 0
            ? `${formatCentsWhole(breakdown.unallocatedCents)} of the account balances is not in Now, Soon, or Later yet.`
            : `The bucket amounts add up to ${formatCentsWhole(-breakdown.unallocatedCents)} more than the account balances.`}{' '}
          Fix it on the Profile screen.
        </Callout>
      )}

      {breakdown.unmodeledCents > 0 && (
        <Callout tone="info" title="Some money has no model">
          {formatCentsWhole(breakdown.unmodeledCents)} is in a bucket with no model chosen, so it has
          no positions or asset class yet. It still counts toward the bucket totals.
        </Callout>
      )}

      <section className="card">
        <h3>Whole portfolio</h3>
        <SliceTable
          slices={breakdown.byAssetClass}
          totalCents={breakdown.totalCents}
          otherCents={breakdown.unmodeledCents + Math.max(breakdown.unallocatedCents, 0)}
        />
      </section>

      <section className="card">
        <h3>Target against actual</h3>
        <p className="muted">
          Target is what the worksheet says this client needs in each bucket. Actual is what the
          advisor has put in each bucket across the accounts.
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
                Not in a bucket
              </th>
              <th scope="col" className="amount">
                Balance
              </th>
            </tr>
          </thead>
          <tbody>
            {perAccount.map((account) => (
              <tr key={account.accountId}>
                <th scope="row">
                  {ACCOUNT_TYPE_LABELS[account.accountType]}
                  {account.maskedNumber === '' ? '' : ` ····${account.maskedNumber}`}
                  <span className="tag">{TAX_FUNNEL_LABELS[account.taxFunnel]}</span>
                </th>
                <td className="amount">{formatCentsWhole(account.nowCents)}</td>
                <td className="amount">{formatCentsWhole(account.soonCents)}</td>
                <td className="amount">{formatCentsWhole(account.laterCents)}</td>
                <td className="amount">
                  {account.unallocatedCents === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    formatCentsWhole(account.unallocatedCents)
                  )}
                </td>
                <td className="amount">{formatCentsWhole(account.balanceCents)}</td>
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
                {formatCentsWhole(perAccount.reduce((t, a) => t + a.unallocatedCents, 0))}
              </td>
              <td className="amount">
                {formatCentsWhole(perAccount.reduce((t, a) => t + a.balanceCents, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {breakdown.byBucket.map((composition) => {
        const bucketDrift = drift.find((d) => d.bucket === composition.bucket);
        const holdings = holdingsInBucket(clientCase, tickers, models, composition.bucket);

        return (
          <section className="card" key={composition.bucket}>
            <h3>
              <span
                className={`swatch bucket-${composition.bucket.toLowerCase()}`}
                aria-hidden="true"
              />
              {BUCKET_LABELS[composition.bucket]} bucket
            </h3>
            <p className="muted">
              {formatCents(composition.valueCents)} — {formatPercent(composition.pctOfPortfolio)} of
              the portfolio
              {bucketDrift !== undefined && bucketDrift.deltaCents !== 0 && (
                <>
                  {' · '}
                  <strong>
                    {formatCentsWhole(Math.abs(bucketDrift.deltaCents))}{' '}
                    {bucketDrift.deltaCents > 0 ? 'over' : 'under'} target
                  </strong>
                </>
              )}
            </p>

            {composition.valueCents > 0 && (
              <SliceTable
                slices={composition.slices}
                totalCents={composition.valueCents}
                otherCents={composition.unmodeledCents}
              />
            )}

            <h4>Positions in this bucket</h4>
            {holdings.length === 0 ? (
              <p className="empty">
                {composition.valueCents === 0
                  ? 'No money in this bucket.'
                  : 'No model chosen for the money in this bucket yet.'}
              </p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th scope="col">Symbol</th>
                    <th scope="col">Account</th>
                    <th scope="col">Model</th>
                    <th scope="col">Asset class</th>
                    <th scope="col" className="amount">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((holding) => (
                    <tr key={holding.key}>
                      <th scope="row">
                        <code>{holding.symbol}</code>
                        {holding.outsideDefaultBucket && (
                          <span className="tag" title="RIG's ticker mapping puts this symbol in another bucket">
                            other bucket
                          </span>
                        )}
                      </th>
                      <td className="muted">
                        {ACCOUNT_TYPE_LABELS[holding.accountType]}
                        {holding.maskedNumber === '' ? '' : ` ····${holding.maskedNumber}`}
                      </td>
                      <td className="muted">{holding.modelName}</td>
                      <td className="muted">
                        {holding.assetClass === null
                          ? '—'
                          : ASSET_CLASS_LABELS[holding.assetClass]}
                      </td>
                      <td className="amount">{formatCents(holding.marketValueCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}


          </section>
        );
      })}

    </div>
  );
}

function SliceTable({
  slices,
  totalCents,
  otherCents = 0,
}: {
  slices: readonly Slice[];
  totalCents: number;
  /** Money with no asset class: no model chosen, or not in a bucket. */
  otherCents?: number;
}) {
  const otherPct = totalCents === 0 ? 0 : Math.round((otherCents / totalCents) * 1000) / 10;
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
        {otherCents > 0 && (
          <tr>
            <th scope="row" className="muted">
              No asset class yet
            </th>
            <td className="amount">{formatCents(otherCents)}</td>
            <td className="amount">{formatPercent(otherPct)}</td>
            <td className="meter-cell">
              <div className="meter">
                <div className="meter-fill meter-other" style={{ width: `${otherPct}%` }} />
              </div>
            </td>
          </tr>
        )}
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
