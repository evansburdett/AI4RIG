import type { Db } from '@ai4rig/db';
import { Router } from 'express';

import {
  createClientCase,
  deleteClientCase,
  getClientCase,
  listClientSummaries,
  saveClientCase,
} from '../repositories/clientCases.js';
import { clientCaseSchema, parseOr400 } from '../validation.js';

/**
 * Client cases (US-01 intake, US-02 generated numbers, US-03 switching, US-04
 * saved cases). Cases are addressed by client number, never by the database
 * row id, so the number the advisor sees is the number in the URL.
 *
 *   GET    /api/clients                  list, for the switcher
 *   GET    /api/clients/:clientNumber    one whole case
 *   POST   /api/clients                  new blank case; the server picks the number
 *   PUT    /api/clients/:clientNumber    save the whole case
 *   DELETE /api/clients/:clientNumber    delete it and everything under it
 */
export function createClientsRouter(db: Db): Router {
  const router = Router();

  router.get('/api/clients', (_req, res) => {
    res.json(listClientSummaries(db));
  });

  router.get('/api/clients/:clientNumber', (req, res) => {
    const clientCase = getClientCase(db, req.params.clientNumber);
    if (clientCase === null) {
      res.status(404).json({ error: `No client case numbered ${req.params.clientNumber}` });
      return;
    }
    res.json(clientCase);
  });

  router.post('/api/clients', (_req, res) => {
    res.status(201).json(createClientCase(db));
  });

  router.put('/api/clients/:clientNumber', (req, res) => {
    const input = parseOr400(clientCaseSchema, req.body, res);
    if (input === null) return;

    if (input.clientNumber !== req.params.clientNumber) {
      res.status(400).json({
        error: `Body is case ${input.clientNumber} but the URL is case ${req.params.clientNumber}`,
      });
      return;
    }

    const saved = saveClientCase(db, input);
    if (saved === null) {
      res.status(404).json({ error: `No client case numbered ${req.params.clientNumber}` });
      return;
    }
    res.json(saved);
  });

  router.delete('/api/clients/:clientNumber', (req, res) => {
    if (!deleteClientCase(db, req.params.clientNumber)) {
      res.status(404).json({ error: `No client case numbered ${req.params.clientNumber}` });
      return;
    }
    res.status(204).end();
  });

  return router;
}
