import type { Db } from '@ai4rig/db';
import { Router } from 'express';

import { exportCases, importCases } from '../repositories/transfer.js';
import { importCasesSchema, parseOr400 } from '../validation.js';

/**
 * Moving cases between computers.
 *
 *   GET  /api/transfer/export   every case, with its reports and the tickers and models it uses
 *   POST /api/transfer/import   { file, choices, dryRun } merge a file's cases in
 */
export function createTransferRouter(db: Db): Router {
  const router = Router();

  router.get('/api/transfer/export', (_req, res) => {
    res.json(exportCases(db));
  });

  router.post('/api/transfer/import', async (req, res) => {
    const input = parseOr400(importCasesSchema, req.body, res);
    if (input === null) return;
    res.json(await importCases(db, input));
  });

  return router;
}
