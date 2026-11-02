import { useEffect, useRef, useState } from 'react';

import { ApiError } from '../api.js';
import { formatDay } from '../domain/dates.js';
import { priceAges } from '../domain/prices.js';
import type { PriceRefreshRequest, PriceRefreshResult, Ticker } from '../domain/types.js';
import { hrefFor } from '../routing.js';

interface Props {
  /** The funds this button is for. Left out, the whole universe. */
  symbols?: readonly string[];
  tickers: readonly Ticker[];
  onRefresh: (request: PriceRefreshRequest) => Promise<PriceRefreshResult>;
  /**
   * Look these up when the screen opens, skipping any already looked up today.
   * Blake (10/22): every time we pull up the tool, the value is today's value.
   */
  auto?: boolean;
  today: Date;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Looking a fund up and its price changing are different news, and only one moves the numbers. */
function describeFound(result: PriceRefreshResult): string {
  const checked = `Checked ${plural(result.updated.length, 'fund')}.`;
  if (result.changed.length === 0) return `${checked} No prices have changed since the last refresh.`;
  return `${checked} ${plural(result.changed.length, 'price')} changed.`;
}

/**
 * The prices on screen: how old they are, and a button to look them up again.
 * A price that could not be found keeps its old value, and this says which.
 */
export function RefreshPrices({ symbols, tickers, onRefresh, auto = false, today }: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PriceRefreshResult | null>(null);
  /** What the button found, in words. Opening a case says nothing: the dates are enough. */
  const [found, setFound] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noKey, setNoKey] = useState(false);

  const ages = priceAges(symbols ?? tickers.map((t) => t.symbol), tickers, today);
  const label = symbols === undefined ? 'Refresh all prices' : 'Refresh prices';

  async function refresh(unasked: boolean) {
    setBusy(true);
    if (!unasked) {
      setError(null);
      setNoKey(false);
    }
    try {
      const answer = await onRefresh({
        ...(symbols === undefined ? {} : { symbols }),
        skipCheckedToday: unasked,
      });
      // Nothing was due: leave whatever the last refresh said.
      if (answer.updated.length + answer.assumedCash.length + answer.notFound.length > 0) setResult(answer);
      setFound(unasked ? null : describeFound(answer));
    } catch (caught: unknown) {
      const missingKey = caught instanceof ApiError && caught.status === 503;
      // Not set up is not worth a warning until someone presses the button.
      if (missingKey && unasked) return;
      setNoKey(missingKey);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  // The latest refresh, without making it a dependency: this runs when the
  // funds change, not on every render.
  const latest = useRef(refresh);
  latest.current = refresh;
  const funds = symbols?.join(',') ?? '';
  useEffect(() => {
    if (auto && funds !== '') void latest.current(true);
  }, [auto, funds]);

  // Nothing to price yet, as on a new case.
  if (ages.total === 0) return null;

  return (
    <div className="refresh-prices">
      <button type="button" disabled={busy} onClick={() => void refresh(false)}>
        {busy ? 'Refreshing…' : label}
      </button>

      <span className="muted">
        {ages.newest === null
          ? 'No prices yet.'
          : ages.oldest === ages.newest
            ? `Prices as of ${formatDay(ages.newest)}.`
            : `Prices from ${formatDay(ages.oldest ?? ages.newest)} to ${formatDay(ages.newest)}.`}
      </span>
      {ages.stale > 0 && <span className="text-warn">{plural(ages.stale, 'price')} over a week old.</span>}
      {ages.missing > 0 && <span className="text-warn">{plural(ages.missing, 'fund')} with no price.</span>}

      {found !== null && error === null && <span className="muted">{found}</span>}
      {result !== null && result.assumedCash.length > 0 && (
        <span className="muted">No quote for {result.assumedCash.join(', ')}, so using $1.00 as cash.</span>
      )}
      {result !== null && result.notFound.length > 0 && (
        <span className="text-warn">
          No price found for {result.notFound.join(', ')}. {result.notFound.length === 1 ? 'It keeps' : 'They keep'} the
          last price.
        </span>
      )}
      {error !== null && (
        <span className="field-error">
          {error}
          {noKey && (
            <>
              {' '}
              <a href={hrefFor({ screen: 'settings', clientNumber: null })}>Go to Settings</a>
            </>
          )}
        </span>
      )}
    </div>
  );
}
