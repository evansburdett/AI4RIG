/**
 * Placeholder investment universe for the front-end unit tests. The running
 * app reads the same list from the database (packages/db/seed/0001_placeholder_tickers.sql)
 * and the bucket definitions from migration 0002. PLACEHOLDER_MODELS match
 * packages/db/seed/0002_placeholder_models.sql.
 */

import type { AdvisoryFeeTier, BucketDefinition, ModelPortfolio, Ticker } from '../domain/types.js';

/** RIG's advisory fee schedule as Ari sent it, and as migration 0008 ships it. */
export const RIG_FEE_TIERS: readonly AdvisoryFeeTier[] = [
  { minBalanceCents: 0, rateBps: 195 },
  { minBalanceCents: 250_000_00, rateBps: 175 },
  { minBalanceCents: 500_000_00, rateBps: 150 },
  { minBalanceCents: 1_000_000_00, rateBps: 125 },
  { minBalanceCents: 2_500_000_00, rateBps: 100 },
  { minBalanceCents: 5_000_000_00, rateBps: 85 },
];

/** Prices are round placeholders, not quotes, and match the seed. */
export const PLACEHOLDER_TICKERS: readonly Ticker[] = [
  { symbol: 'SGOV', assetClass: 'CASH', defaultBucket: 'NOW', priceCents: 100_00, priceAsOf: '2026-10-21' },
  { symbol: 'BIL', assetClass: 'CASH', defaultBucket: 'NOW', priceCents: 91_50, priceAsOf: '2026-10-21' },
  { symbol: 'SHY', assetClass: 'FIXED_INCOME', defaultBucket: 'SOON', priceCents: 82_00, priceAsOf: '2026-10-21' },
  { symbol: 'BND', assetClass: 'FIXED_INCOME', defaultBucket: 'SOON', priceCents: 73_00, priceAsOf: '2026-10-21' },
  { symbol: 'TIP', assetClass: 'FIXED_INCOME', defaultBucket: 'SOON', priceCents: 110_00, priceAsOf: '2026-10-21' },
  { symbol: 'VTI', assetClass: 'EQUITY', defaultBucket: 'LATER', priceCents: 300_00, priceAsOf: '2026-10-21' },
  { symbol: 'VOO', assetClass: 'EQUITY', defaultBucket: 'LATER', priceCents: 550_00, priceAsOf: '2026-10-21' },
  { symbol: 'VXUS', assetClass: 'EQUITY', defaultBucket: 'LATER', priceCents: 65_00, priceAsOf: '2026-10-21' },
  { symbol: 'VNQ', assetClass: 'REAL_ASSET', defaultBucket: 'LATER', priceCents: 90_00, priceAsOf: '2026-10-21' },
  { symbol: 'GLD', assetClass: 'REAL_ASSET', defaultBucket: 'SOON', priceCents: 250_00, priceAsOf: '2026-10-21' },
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

export const PLACEHOLDER_MODELS: readonly ModelPortfolio[] = [
  {
    id: '9001',
    name: 'Placeholder Now: Cash',
    bucket: 'NOW',
    taxFunnel: null,
    lines: [
      { tickerSymbol: 'SGOV', weightBps: 6000 },
      { tickerSymbol: 'BIL', weightBps: 4000 },
    ],
  },
  {
    id: '9002',
    name: 'Placeholder Soon: Core bonds',
    bucket: 'SOON',
    taxFunnel: null,
    lines: [
      { tickerSymbol: 'BND', weightBps: 5000 },
      { tickerSymbol: 'SHY', weightBps: 3000 },
      { tickerSymbol: 'TIP', weightBps: 2000 },
    ],
  },
  {
    id: '9003',
    name: 'Placeholder Later: Broad equity',
    bucket: 'LATER',
    taxFunnel: null,
    lines: [
      { tickerSymbol: 'VTI', weightBps: 5000 },
      { tickerSymbol: 'VOO', weightBps: 2000 },
      { tickerSymbol: 'VXUS', weightBps: 2000 },
      { tickerSymbol: 'VNQ', weightBps: 1000 },
    ],
  },
  {
    id: '9004',
    name: 'Placeholder Later: Roth growth',
    bucket: 'LATER',
    taxFunnel: 'TAX_FREE',
    lines: [
      { tickerSymbol: 'VTI', weightBps: 6000 },
      { tickerSymbol: 'VXUS', weightBps: 4000 },
    ],
  },
];
