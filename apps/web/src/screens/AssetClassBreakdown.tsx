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
 * US-11 — Asset Class Breakdown.
 *
 * What percentage of the portfolio sits in each asset class once the buckets
 * are built, overall and one bucket at a time. The per-bucket view is the one
 * that earns its place: "62% equity" across the whole portfolio is a fact, but
 * "62% equity inside the Soon bucket" is a problem, and the overall number
 * hides it.
 *
 * Every figure is derived from the holdings on each render and none of it is
 * stored (decision D2). Asset class comes from the ticker universe, so a symbol
 * that is not in it cannot be classified — those are called out rather than
 * dropped, since dropping them would make this screen quietly disagree with the
 * account totals on the profile.
 */
export function AssetClassBreakdown({ clientCase, tickers }: Props) {
  const breakdown = useMemo(
    () => computeBreakdown(clientCase, tickers),
    [clientCase, tickers],
  );

  return (
    <div className="screen">
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
            {breakdown.unknownSymbols.length === 1 ? 'is' : 'are'} held on this case but not in the
            ticker list, so {breakdown.unknownSymbols.length === 1 ? 'it has' : 'they have'} no
            asset class. The money still counts toward the totals — it is real — but it cannot be
            classified. Usually this is a typo or a gap in the master list.
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
            {formatCents(composition.valueCents)} —{' '}
            {formatPercent(composition.pctOfPortfolio)} of the portfolio
          </p>

          {composition.slices.length === 0 ? (
            <p className="muted">Nothing classified in this bucket.</p>
          ) : (
            <SliceTable slices={composition.slices} totalCents={composition.valueCents} />
          )}
        </section>
      ))}

      <Callout tone="blocked" title="Nothing to compare this against yet">
        A breakdown is only actionable next to a target. RIG has not supplied the Now / Soon / Later
        percentages for {LIFE_STAGE_LABELS[clientCase.lifeStage]}, so this screen reports where the
        money is and stops short of saying whether that is where it should be.
      </Callout>
    </div>
  );
}

function SliceTable({ slices, totalCents }: { slices: readonly Slice[]; totalCents: number }) {
  return (
    <table className="breakdown">
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
