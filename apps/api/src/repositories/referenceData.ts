/**
 * The ticker universe (US-06), bucket definitions (US-08), and the advisory
 * fee schedule (US-19). All data, not code, so RIG can change them without a
 * developer.
 */

import type { Db } from '@ai4rig/db';
import type { AdvisoryFeeTier, BucketDefinition, BucketType, Ticker } from '@ai4rig/shared';

import { HttpError } from '../errors.js';

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
 * Insert or update one ticker. The default bucket is RIG's mapping of which
 * bucket the symbol belongs in; a model that puts it elsewhere is flagged on
 * the Models screen, not refused.
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

/**
 * Refused (409) while any model or any client's hand-picked bucket still uses
 * the ticker, naming them. Without the second check the foreign key on
 * sleeve_lines would refuse the delete anyway, but as an unexplained 500.
 */
export function deleteTicker(db: Db, symbol: string): boolean {
  const models = db
    .prepare<[string], { name: string }>(
      `SELECT DISTINCT m.name FROM model_lines l JOIN model_portfolios m ON m.id = l.model_id
       WHERE l.ticker_symbol = ? ORDER BY m.name`,
    )
    .all(symbol)
    .map((row) => row.name);
  if (models.length > 0) {
    throw new HttpError(409, `${symbol} is in ${models.join(', ')}. Take it out of those models first.`);
  }

  const cases = db
    .prepare<[string], { client_number: string }>(
      `SELECT DISTINCT c.client_number FROM sleeve_lines l
       JOIN accounts a ON a.id = l.account_id
       JOIN client_cases c ON c.id = a.client_case_id
       WHERE l.ticker_symbol = ? ORDER BY c.client_number`,
    )
    .all(symbol)
    .map((row) => row.client_number);
  if (cases.length > 0) {
    const noun = cases.length === 1 ? 'case' : 'cases';
    throw new HttpError(
      409,
      `${symbol} is picked by hand in client ${noun} ${cases.join(', ')}. Take it out of those first.`,
    );
  }

  return db.prepare('DELETE FROM tickers WHERE symbol = ?').run(symbol).changes > 0;
}

/** RIG's fee schedule, lowest balance first (US-19). */
export function listAdvisoryFeeTiers(db: Db): AdvisoryFeeTier[] {
  return db
    .prepare<[], { min_balance_cents: number; rate_bps: number }>(
      'SELECT min_balance_cents, rate_bps FROM advisory_fee_tiers ORDER BY min_balance_cents',
    )
    .all()
    .map((row) => ({ minBalanceCents: row.min_balance_cents, rateBps: row.rate_bps }));
}

/** Replace the whole schedule in one transaction. Validation has already ordered and checked it. */
export function replaceAdvisoryFeeTiers(db: Db, tiers: readonly AdvisoryFeeTier[]): AdvisoryFeeTier[] {
  db.transaction(() => {
    db.prepare('DELETE FROM advisory_fee_tiers').run();
    const add = db.prepare('INSERT INTO advisory_fee_tiers (min_balance_cents, rate_bps) VALUES (?, ?)');
    for (const tier of tiers) add.run(tier.minBalanceCents, tier.rateBps);
  })();
  return listAdvisoryFeeTiers(db);
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
