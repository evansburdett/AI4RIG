/**
 * Placeholder investment universe for the front-end unit tests. The running
 * app reads the same list from the database (packages/db/seed/0001_placeholder_tickers.sql)
 * and the bucket definitions from migration 0002.
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

/** Worded from RIG's description of the three buckets. Editable under US-08. */
export const DEFAULT_BUCKET_DEFINITIONS: readonly BucketDefinition[] = [
  {
    bucket: 'NOW',
    label: 'Now',
    horizonMonths: 12,
    purposeText:
      'Money spent in the next twelve months: income draw, cash held at the bank, and known large expenses.',
  },
  {
    bucket: 'SOON',
    label: 'Soon',
    horizonMonths: 120,
    purposeText:
      'Preservation. Income gap, inflation hedge, Social Security bridge, and anything held conservatively.',
  },
  {
    bucket: 'LATER',
    label: 'Later',
    horizonMonths: 360,
    purposeText:
      'Long-term growth. Market dependent, and absorbs whatever Now and Soon do not claim.',
  },
];
