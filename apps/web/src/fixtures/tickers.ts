/**
 * PLACEHOLDER investment universe.
 *
 * RIG has not sent the Common Investments list yet — the sponsor's email says
 * "We will send these." Until it arrives this is a small set of broad, widely
 * quoted ETFs, chosen only so the screens have something to render. It is not
 * RIG's approved list and must not be mistaken for one, which is why the count
 * is small and obviously generic rather than a plausible-looking fifty rows.
 *
 * When the real list lands it belongs in the database behind US-06, not here.
 */

import type { BucketDefinition, Ticker } from '../domain/types.js';

export const PLACEHOLDER_TICKERS: readonly Ticker[] = [
  { symbol: 'SGOV', assetClass: 'CASH', defaultBucket: 'NOW' },
  { symbol: 'BIL', assetClass: 'CASH', defaultBucket: 'NOW' },
  { symbol: 'SHY', assetClass: 'FIXED_INCOME', defaultBucket: 'SOON' },
  { symbol: 'BND', assetClass: 'FIXED_INCOME', defaultBucket: 'SOON' },
  { symbol: 'TIP', assetClass: 'FIXED_INCOME', defaultBucket: 'SOON' },
  { symbol: 'VTI', assetClass: 'EQUITY', defaultBucket: 'LATER' },
  { symbol: 'VOO', assetClass: 'EQUITY', defaultBucket: 'LATER' },
  { symbol: 'VXUS', assetClass: 'EQUITY', defaultBucket: 'LATER' },
  { symbol: 'VNQ', assetClass: 'REAL_ASSET', defaultBucket: 'LATER' },
  { symbol: 'GLD', assetClass: 'REAL_ASSET', defaultBucket: 'SOON' },
];

/**
 * Bucket definitions, worded from the sponsor's own description of the three
 * buckets. Editable through the UI under US-08 so RIG can adjust the language
 * as their strategy evolves, without a developer.
 */
export const DEFAULT_BUCKET_DEFINITIONS: readonly BucketDefinition[] = [
  {
    bucket: 'NOW',
    label: 'Now',
    horizonMonths: 12,
    purposeText:
      'Money spent in the next twelve months: income draw, the cash the client wants to see in the bank, and known large expenses.',
  },
  {
    bucket: 'SOON',
    label: 'Soon',
    horizonMonths: 120,
    purposeText:
      'Preservation. Covers the income gap, an inflation hedge, any Social Security bridge, and anything the client wants invested conservatively.',
  },
  {
    bucket: 'LATER',
    label: 'Later',
    horizonMonths: 360,
    purposeText:
      'Long-term growth. Market dependent, and the bucket that absorbs whatever Now and Soon do not claim.',
  },
];
