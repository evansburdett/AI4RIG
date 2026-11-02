import { Router } from 'express';

import type { PriceRefresher } from '../prices.js';
import { parseOr400, priceRefreshSchema } from '../validation.js';

/**
 * Live prices (RIG, 10/26).
 *
 *   POST /api/prices/refresh   { symbols?, skipCheckedToday? }
 *        200 { tickers, updated, changed, assumedCash, notFound }
 *        503 no Market Data key on this computer
 *        502 Market Data failed or refused the key; no price was changed
 */
export function createPricesRouter(refresh: PriceRefresher): Router {
  const router = Router();

  router.post('/api/prices/refresh', async (req, res) => {
    const options = parseOr400(priceRefreshSchema, req.body, res);
    if (options === null) return;
    res.json(await refresh(options));
  });

  return router;
}
