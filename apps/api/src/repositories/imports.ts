/**
 * Importing RIG's spreadsheets: their vendor model portfolios, and a
 * custodian export of an account's holdings (10/26). The web app reads and
 * checks the file and shows the advisor what it found; this saves the
 * tickers, prices, and models that result, in one transaction, so a failed
 * import leaves nothing half done.
 */

import type { Db } from '@ai4rig/db';
import type { ImportResult } from '@ai4rig/shared';

import { HttpError } from '../errors.js';
import type { ImportInput } from '../validation.js';

import { createModel, listModels, updateModel } from './models.js';
import { getTicker, listTickers, upsertTicker } from './referenceData.js';

export function runImport(db: Db, input: ImportInput, now: Date = new Date()): ImportResult {
  db.transaction(() => {
    // New tickers first: the models and prices below refer to them. One
    // already in the universe keeps RIG's own asset class and bucket.
    for (const ticker of input.newTickers) {
      if (getTicker(db, ticker.symbol) === null) upsertTicker(db, ticker, now);
    }

    for (const { symbol, priceCents } of input.prices) {
      const existing = getTicker(db, symbol);
      if (existing === null) throw new HttpError(400, `${symbol} is not in the ticker list, so it cannot be priced`);
      upsertTicker(db, { ...existing, priceCents }, now);
    }

    // A model with the same name is a vendor's new quarter: its lines are
    // replaced and its id kept, so accounts filled from it stay linked.
    const byName = new Map(listModels(db).map((model) => [model.name.toLowerCase(), Number(model.id)]));
    for (const model of input.models) {
      const id = byName.get(model.name.toLowerCase());
      if (id === undefined) createModel(db, model, now);
      else updateModel(db, id, model, now);
    }
  })();

  return { tickers: listTickers(db), models: listModels(db) };
}
