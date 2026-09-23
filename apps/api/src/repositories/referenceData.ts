/**
 * The ticker universe (US-06) and bucket definitions (US-08). Both are data,
 * not code, so RIG can change them without a developer.
 */

import type { Db } from '@ai4rig/db';
import type { BucketDefinition, BucketType, Ticker } from '@ai4rig/shared';

interface TickerRow {
  symbol: string;
  asset_class: Ticker['assetClass'];
  default_bucket: Ticker['defaultBucket'];
}

interface DefinitionRow {
  bucket: BucketType;
  label: string;
  horizon_months: number;
  purpose_text: string;
}

const toTicker = (row: TickerRow): Ticker => ({
  symbol: row.symbol,
  assetClass: row.asset_class,
  defaultBucket: row.default_bucket,
});

const toDefinition = (row: DefinitionRow): BucketDefinition => ({
  bucket: row.bucket,
  label: row.label,
  horizonMonths: row.horizon_months,
  purposeText: row.purpose_text,
});

export function listTickers(db: Db): Ticker[] {
  return db
    .prepare<[], TickerRow>('SELECT symbol, asset_class, default_bucket FROM tickers ORDER BY symbol')
    .all()
    .map(toTicker);
}

/**
 * Insert or update one ticker. Changing a default does not move holdings that
 * are already placed; a holding keeps the bucket the advisor chose (D1).
 */
export function upsertTicker(db: Db, ticker: Ticker): Ticker {
  db.prepare(
    `INSERT INTO tickers (symbol, asset_class, default_bucket) VALUES (@symbol, @assetClass, @defaultBucket)
     ON CONFLICT (symbol) DO UPDATE SET
       asset_class = excluded.asset_class,
       default_bucket = excluded.default_bucket`,
  ).run(ticker);
  return ticker;
}

export function deleteTicker(db: Db, symbol: string): boolean {
  return db.prepare('DELETE FROM tickers WHERE symbol = ?').run(symbol).changes > 0;
}

export function listBucketDefinitions(db: Db): BucketDefinition[] {
  return db
    .prepare<[], DefinitionRow>(
      `SELECT bucket, label, horizon_months, purpose_text FROM bucket_definitions
       ORDER BY CASE bucket WHEN 'NOW' THEN 0 WHEN 'SOON' THEN 1 ELSE 2 END`,
    )
    .all()
    .map(toDefinition);
}

/** The three rows always exist (migration 0002), so this is an update, never an insert. */
export function updateBucketDefinition(db: Db, definition: BucketDefinition): BucketDefinition | null {
  const { changes } = db
    .prepare(
      `UPDATE bucket_definitions
       SET label = @label, horizon_months = @horizonMonths, purpose_text = @purposeText
       WHERE bucket = @bucket`,
    )
    .run(definition);
  return changes > 0 ? definition : null;
}
