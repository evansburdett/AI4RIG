import type { Db } from '@ai4rig/db';
import { Router } from 'express';

import { runImport } from '../repositories/imports.js';
import { importSchema, parseOr400 } from '../validation.js';

/**
 * Importing from RIG's spreadsheets (10/26). The file itself is read in the
 * browser; this takes what the advisor checked and saves it all at once.
 *
 *   POST /api/import   new tickers, prices, and models; returns every ticker and model
 */
export function createImportsRouter(db: Db): Router {
  const router = Router();

  router.post('/api/import', (req, res) => {
    const input = parseOr400(importSchema, req.body, res);
    if (input === null) return;
    res.json(runImport(db, input));
  });

  return router;
}
