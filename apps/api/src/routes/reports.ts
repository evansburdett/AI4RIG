import type { Db } from '@ai4rig/db';
import { Router } from 'express';

import { addReport, deleteReport, listReports } from '../repositories/reports.js';
import { parseOr400, reportSchema } from '../validation.js';

/**
 * Saved bucket reports for one case.
 *
 *   GET    /api/clients/:clientNumber/reports        every report, newest first
 *   POST   /api/clients/:clientNumber/reports        { snapshot } saved as generated
 *   DELETE /api/clients/:clientNumber/reports/:id
 */
export function createReportsRouter(db: Db): Router {
  const router = Router();

  router.get('/api/clients/:clientNumber/reports', (req, res) => {
    const reports = listReports(db, req.params.clientNumber);
    if (reports === null) {
      res.status(404).json({ error: `No client case numbered ${req.params.clientNumber}` });
      return;
    }
    res.json(reports);
  });

  router.post('/api/clients/:clientNumber/reports', (req, res) => {
    const body = parseOr400(reportSchema, req.body, res);
    if (body === null) return;
    if (body.snapshot.clientNumber !== req.params.clientNumber) {
      res.status(400).json({ error: `That report is for case ${body.snapshot.clientNumber}` });
      return;
    }
    const saved = addReport(db, req.params.clientNumber, body.snapshot);
    if (saved === null) {
      res.status(404).json({ error: `No client case numbered ${req.params.clientNumber}` });
      return;
    }
    res.status(201).json(saved);
  });

  router.delete('/api/clients/:clientNumber/reports/:id', (req, res) => {
    if (!deleteReport(db, req.params.clientNumber, req.params.id)) {
      res.status(404).json({ error: 'No such report' });
      return;
    }
    res.status(204).end();
  });

  return router;
}
