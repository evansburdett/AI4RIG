import { useState } from 'react';

import { ASSET_CLASS_LABELS, BUCKET_LABELS } from '../domain/lifeStage.js';
import { parseCents } from '../domain/money.js';
import { ASSET_CLASSES, BUCKETS } from '../domain/types.js';
import type { AssetClass, BucketType, Ticker } from '../domain/types.js';

interface Props {
  /** Already normalised and valid; the caller decides when to show this. */
  symbol: string;
  /** Preselected bucket: the one the advisor is typing into, when there is one. */
  suggestedBucket: BucketType;
  /** Rejects with the reason when the save fails. */
  onAdd: (ticker: Ticker) => Promise<Ticker>;
  /** Called with the saved ticker. */
  onAdded?: (ticker: Ticker) => void;
}

/**
 * US-24: the two things RIG decides once per symbol, asset class and default
 * bucket, and a button that adds it to the universe for every case and model.
 *
 * Asset class starts blank on purpose. A guessed "Equity" that nobody looked at
 * would feed the asset-class breakdown for every client that holds the symbol.
 */
export function NewTickerFields({ symbol, suggestedBucket, onAdd, onAdded }: Props) {
  const [assetClass, setAssetClass] = useState<AssetClass | ''>('');
  const [defaultBucket, setDefaultBucket] = useState<BucketType>(suggestedBucket);
  const [priceText, setPriceText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optional: the price can wait for the Tickers screen, but shares (US-21)
  // cannot be worked out without it.
  const priceCents = priceText.trim() === '' ? null : parseCents(priceText);
  const priceInvalid = priceText.trim() !== '' && (priceCents === null || priceCents <= 0);

  async function add() {
    if (assetClass === '' || priceInvalid) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await onAdd({ symbol, assetClass, defaultBucket, priceCents, priceAsOf: null });
      onAdded?.(saved);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="new-ticker">
      <span className="new-ticker-note">
        <code>{symbol}</code> is not in the ticker list yet.
      </span>
      <select
        aria-label={`${symbol} asset class`}
        value={assetClass}
        onChange={(event) => setAssetClass(event.target.value as AssetClass | '')}
      >
        <option value="">Asset class…</option>
        {ASSET_CLASSES.map((c) => (
          <option key={c} value={c}>
            {ASSET_CLASS_LABELS[c]}
          </option>
        ))}
      </select>
      <select
        aria-label={`${symbol} default bucket`}
        value={defaultBucket}
        onChange={(event) => setDefaultBucket(event.target.value as BucketType)}
      >
        {BUCKETS.map((b) => (
          <option key={b} value={b}>
            {BUCKET_LABELS[b]}
          </option>
        ))}
      </select>
      <span className="money-input">
        <span aria-hidden="true">$</span>
        <input
          type="text"
          inputMode="decimal"
          aria-label={`${symbol} price per share`}
          aria-invalid={priceInvalid}
          placeholder="Price (optional)"
          value={priceText}
          onChange={(event) => setPriceText(event.target.value)}
        />
      </span>
      <button type="button" disabled={assetClass === '' || priceInvalid || busy} onClick={() => void add()}>
        {busy ? 'Adding…' : `Add ${symbol}`}
      </button>
      {error !== null && <p className="field-error">{error}</p>}
    </div>
  );
}
