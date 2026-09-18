import { useMemo } from 'react';

import { BucketBar } from '../components/BucketBar.js';
import { Callout } from '../components/Callout.js';
import { computeBreakdown } from '../domain/breakdown.js';
import { ASSET_CLASS_LABELS, BUCKET_LABELS, LIFE_STAGE_LABELS } from '../domain/lifeStage.js';
import { formatCents, formatPercent } from '../domain/money.js';
import type { ClientCase, Ticker } from '../domain/types.js';
import type { Slice } from '../domain/breakdown.js';

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
  const breakdown = useMemo(
    () => computeBreakdown(clientCase, tickers),
    [clientCase, tickers],
  );

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
        <h3>How the money divides across buckets</h3>
        <BucketBar
          totalCents={breakdown.totalCents}
          segments={breakdown.byBucket.map((b) => ({
            bucket: b.bucket,
            valueCents: b.valueCents,
          }))}
        />
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

      <Callout tone="blocked" title="No target to compare against">
        RIG has not supplied the Now / Soon / Later percentages for{' '}
        {LIFE_STAGE_LABELS[clientCase.lifeStage]}. This screen reports where the money is, not
        whether that is where it should be.
      </Callout>
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
