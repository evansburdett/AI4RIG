/**
 * Model portfolios (US-14): named sets of tickers and weights for one bucket.
 * RIG's vendor models change quarterly, so an administrator maintains them
 * here; a custom model is just another one.
 */

import type { Db } from '@ai4rig/db';
import type { ModelPortfolio } from '@ai4rig/shared';

import { HttpError } from '../errors.js';
import type { ModelPortfolioInput } from '../validation.js';

interface ModelRow {
  id: number;
  name: string;
  bucket: ModelPortfolio['bucket'];
  tax_funnel: ModelPortfolio['taxFunnel'];
}

interface LineRow {
  model_id: number;
  ticker_symbol: string;
  weight_bps: number;
}

export function listModels(db: Db): ModelPortfolio[] {
  const lines = db
    .prepare<[], LineRow>('SELECT model_id, ticker_symbol, weight_bps FROM model_lines ORDER BY position, id')
    .all();

  return db
    .prepare<[], ModelRow>(
      `SELECT id, name, bucket, tax_funnel FROM model_portfolios
       ORDER BY CASE bucket WHEN 'NOW' THEN 0 WHEN 'SOON' THEN 1 ELSE 2 END, name`,
    )
    .all()
    .map((row) => ({
      id: String(row.id),
      name: row.name,
      bucket: row.bucket,
      taxFunnel: row.tax_funnel,
      lines: lines
        .filter((line) => line.model_id === row.id)
        .map((line) => ({ tickerSymbol: line.ticker_symbol, weightBps: line.weight_bps })),
    }));
}

export function getModel(db: Db, id: number): ModelPortfolio | null {
  return listModels(db).find((model) => model.id === String(id)) ?? null;
}

/** Checks the database can answer better than a bare constraint error. */
function checkModel(db: Db, input: ModelPortfolioInput, id: number | null): void {
  const clash = db
    .prepare<[string], { id: number }>('SELECT id FROM model_portfolios WHERE name = ? COLLATE NOCASE')
    .get(input.name);
  if (clash !== undefined && clash.id !== id) {
    throw new HttpError(409, `There is already a model called "${input.name}"`);
  }

  const known = db.prepare<[string], { symbol: string }>('SELECT symbol FROM tickers WHERE symbol = ?');
  const unknown = input.lines.map((l) => l.tickerSymbol).filter((symbol) => known.get(symbol) === undefined);
  if (unknown.length > 0) {
    throw new HttpError(
      400,
      `Not in the ticker universe: ${unknown.join(', ')}. Add ${unknown.length === 1 ? 'it' : 'them'} on the Tickers screen first.`,
    );
  }

  if (id !== null) {
    const inUse = db
      .prepare<[number, string], { count: number }>(
        'SELECT COUNT(*) AS count FROM account_sleeves WHERE model_id = ? AND bucket <> ?',
      )
      .get(id, input.bucket);
    if ((inUse?.count ?? 0) > 0) {
      throw new HttpError(
        409,
        `This model is in use for a different bucket on ${inUse?.count} account(s), so its bucket cannot change. Make a new model instead.`,
      );
    }
  }
}

function writeLines(db: Db, modelId: number, input: ModelPortfolioInput): void {
  db.prepare('DELETE FROM model_lines WHERE model_id = ?').run(modelId);
  const add = db.prepare(
    'INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps) VALUES (?, ?, ?, ?)',
  );
  input.lines.forEach((line, position) => add.run(modelId, position, line.tickerSymbol, line.weightBps));
}

export function createModel(db: Db, input: ModelPortfolioInput, now: Date = new Date()): ModelPortfolio {
  const id = db.transaction((): number => {
    checkModel(db, input, null);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO model_portfolios (name, bucket, tax_funnel, updated_at) VALUES (?, ?, ?, ?)')
      .run(input.name, input.bucket, input.taxFunnel, now.toISOString());
    writeLines(db, Number(lastInsertRowid), input);
    return Number(lastInsertRowid);
  })();

  const created = getModel(db, id);
  if (created === null) throw new Error('Created a model and then could not read it back');
  return created;
}

/** Null if there is no model with that id. */
export function updateModel(
  db: Db,
  id: number,
  input: ModelPortfolioInput,
  now: Date = new Date(),
): ModelPortfolio | null {
  const found = db.transaction((): boolean => {
    const { changes } = db
      .prepare('UPDATE model_portfolios SET updated_at = updated_at WHERE id = ?')
      .run(id);
    if (changes === 0) return false;

    checkModel(db, input, id);
    db.prepare('UPDATE model_portfolios SET name = ?, bucket = ?, tax_funnel = ?, updated_at = ? WHERE id = ?').run(
      input.name,
      input.bucket,
      input.taxFunnel,
      now.toISOString(),
      id,
    );
    writeLines(db, id, input);
    return true;
  })();

  return found ? getModel(db, id) : null;
}

/** Accounts that followed this model keep their money in the bucket, with no model chosen. */
export function deleteModel(db: Db, id: number): boolean {
  return db.prepare('DELETE FROM model_portfolios WHERE id = ?').run(id).changes > 0;
}
