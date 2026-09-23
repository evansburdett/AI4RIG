import type { Db } from '@ai4rig/db';
import { Router } from 'express';

import {
  deleteTicker,
  listBucketDefinitions,
  listTickers,
  updateBucketDefinition,
  upsertTicker,
} from '../repositories/referenceData.js';
import { bucketDefinitionSchema, bucketParam, parseOr400, tickerSchema } from '../validation.js';

/**
 * The ticker universe (US-06) and bucket definitions (US-08). Administrator
 * screens; there is no role check yet because there is no login yet (US-05).
 *
 *   GET    /api/tickers                     the whole universe
 *   PUT    /api/tickers/:symbol             add or update one ticker
 *   DELETE /api/tickers/:symbol             remove one
 *   GET    /api/bucket-definitions          Now, Soon, Later, in that order
 *   PUT    /api/bucket-definitions/:bucket  edit one
 */
export function createReferenceDataRouter(db: Db): Router {
  const router = Router();

  router.get('/api/tickers', (_req, res) => {
    res.json(listTickers(db));
  });

  router.put('/api/tickers/:symbol', (req, res) => {
    const ticker = parseOr400(tickerSchema, req.body, res);
    if (ticker === null) return;

    if (ticker.symbol !== req.params.symbol.toUpperCase()) {
      res.status(400).json({ error: `Body is ${ticker.symbol} but the URL is ${req.params.symbol}` });
      return;
    }
    res.json(upsertTicker(db, ticker));
  });

  router.delete('/api/tickers/:symbol', (req, res) => {
    if (!deleteTicker(db, req.params.symbol.toUpperCase())) {
      res.status(404).json({ error: `No ticker ${req.params.symbol}` });
      return;
    }
    res.status(204).end();
  });

  router.get('/api/bucket-definitions', (_req, res) => {
    res.json(listBucketDefinitions(db));
  });

  router.put('/api/bucket-definitions/:bucket', (req, res) => {
    const bucket = bucketParam.safeParse(req.params.bucket);
    if (!bucket.success) {
      res.status(404).json({ error: `No bucket ${req.params.bucket}` });
      return;
    }

    const definition = parseOr400(bucketDefinitionSchema, req.body, res);
    if (definition === null) return;

    if (definition.bucket !== bucket.data) {
      res.status(400).json({ error: `Body is ${definition.bucket} but the URL is ${bucket.data}` });
      return;
    }

    const saved = updateBucketDefinition(db, definition);
    if (saved === null) {
      res.status(404).json({ error: `No bucket ${bucket.data}` });
      return;
    }
    res.json(saved);
  });

  return router;
}
