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
  name: string | null;
  asset_class: Ticker['assetClass'];
  default_bucket: Ticker['defaultBucket'];
  price_cents: number | null;
  price_micros: number | null;
  price_as_of: string | null;
}

interface DefinitionRow {
  bucket: BucketType;
  label: string;
  horizon_months: number;
  purpose_text: string;
}

const toTicker = (row: TickerRow): Ticker => ({
  symbol: row.symbol,
  name: row.name,
  assetClass: row.asset_class,
  defaultBucket: row.default_bucket,
  priceCents: row.price_cents,
  priceMicros: row.price_micros,
  priceAsOf: row.price_as_of,
});

const toDefinition = (row: DefinitionRow): BucketDefinition => ({
  bucket: row.bucket,
  label: row.label,
  horizonMonths: row.horizon_months,
  purposeText: row.purpose_text,
});

export function listTickers(db: Db): Ticker[] {
  return db
    .prepare<[], TickerRow>(
      'SELECT symbol, name, asset_class, default_bucket, price_cents, price_micros, price_as_of FROM tickers ORDER BY symbol',
    )
    .all()
    .map(toTicker);
}

export function getTicker(db: Db, symbol: string): Ticker | null {
  const row = db
    .prepare<[string], TickerRow>(
      'SELECT symbol, name, asset_class, default_bucket, price_cents, price_micros, price_as_of FROM tickers WHERE symbol = ?',
    )
    .get(symbol);
  return row === undefined ? null : toTicker(row);
}

/** What a caller may send: the price is optional, and its date is the server's to set. */
export interface TickerInput {
  readonly symbol: string;
  /** Undefined leaves the stored name alone; null clears it. */
  readonly name?: string | null | undefined;
  readonly assetClass: Ticker['assetClass'];
  readonly defaultBucket: Ticker['defaultBucket'];
  /** Undefined leaves the stored price alone; null clears it. */
  readonly priceCents?: number | null | undefined;
  /** The exact price. A number here wins over priceCents. */
  readonly priceMicros?: number | null | undefined;
}

/**
 * Insert or update one ticker. The default bucket is RIG's mapping of which
 * bucket the symbol belongs in; a model that puts it elsewhere is flagged on
 * the Models screen, not refused.
 *
 * A changed price is stamped with today's date (US-21), so the screens can
 * show how old a price is. `today` is a parameter for tests.
 */
export function upsertTicker(db: Db, ticker: TickerInput, today: Date = new Date()): Ticker {
  const existing = getTicker(db, ticker.symbol);
  const name = ticker.name === undefined ? (existing?.name ?? null) : ticker.name;
  // The exact price is used when it agrees with priceCents (or priceCents
  // is left out). When they disagree, priceCents is the one a person just
  // typed, as when the whole ticker comes back with only the cents changed;
  // null clears both. Neither keeps what is stored.
  const exact = typeof ticker.priceMicros === 'number' ? ticker.priceMicros : null;
  const priceMicros =
    ticker.priceCents === null
      ? null
      : exact !== null && (ticker.priceCents === undefined || ticker.priceCents === centsOf(exact))
        ? exact
        : ticker.priceCents === undefined
          ? (existing?.priceMicros ?? null)
          : ticker.priceCents * 10_000;
  const priceCents = priceMicros === null ? null : centsOf(priceMicros);
  const priceAsOf =
    priceMicros === null
      ? null
      : priceMicros === existing?.priceMicros
        ? existing.priceAsOf
        : today.toISOString().slice(0, 10);

  db.prepare(
    `INSERT INTO tickers (symbol, name, asset_class, default_bucket, price_cents, price_micros, price_as_of)
     VALUES (@symbol, @name, @assetClass, @defaultBucket, @priceCents, @priceMicros, @priceAsOf)
     ON CONFLICT (symbol) DO UPDATE SET
       name = excluded.name,
       asset_class = excluded.asset_class,
       default_bucket = excluded.default_bucket,
       price_cents = excluded.price_cents,
       price_micros = excluded.price_micros,
       price_as_of = excluded.price_as_of`,
  ).run({
    symbol: ticker.symbol,
    name,
    assetClass: ticker.assetClass,
    defaultBucket: ticker.defaultBucket,
    priceCents,
    priceMicros,
    priceAsOf,
  });

  const saved = getTicker(db, ticker.symbol);
  if (saved === null) throw new Error(`Saved ${ticker.symbol} and then could not read it back`);
  return saved;
}

/** An exact price to the cent: never below 1, since a price of $0 is refused. */
function centsOf(priceMicros: number): number {
  return Math.max(Math.round(priceMicros / 10_000), 1);
}

/**
 * Refused (409) while any model, any client's account, or any locked-in
 * proposal still uses the ticker, naming them. Without the second check the foreign key on
 * account_lines would refuse the delete anyway, but as an unexplained 500.
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
      `SELECT DISTINCT c.client_number FROM account_lines l
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
      `${symbol} is held in client ${noun} ${cases.join(', ')}. Take it out of those accounts first.`,
    );
  }

  const locked = db
    .prepare<[string], { client_number: string }>(
      `SELECT DISTINCT c.client_number FROM proposal_positions p
       JOIN accounts a ON a.id = p.account_id
       JOIN client_cases c ON c.id = a.client_case_id
       WHERE p.ticker_symbol = ? ORDER BY c.client_number`,
    )
    .all(symbol)
    .map((row) => row.client_number);
  if (locked.length > 0) {
    const noun = locked.length === 1 ? 'case' : 'cases';
    throw new HttpError(
      409,
      `${symbol} has shares locked in for client ${noun} ${locked.join(', ')}. ` +
        'Lock those proposals in again without it first.',
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
