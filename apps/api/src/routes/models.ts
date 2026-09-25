import type { Db } from '@ai4rig/db';
import { Router } from 'express';

import { HttpError } from '../errors.js';
import { createModel, deleteModel, listModels, updateModel } from '../repositories/models.js';
import { modelPortfolioSchema, parseOr400 } from '../validation.js';

/**
 * Model portfolios (US-14). Administrator screen, like tickers.
 *
 *   GET    /api/models        every model with its tickers and weights
 *   POST   /api/models        new model
 *   PUT    /api/models/:id    edit one
 *   DELETE /api/models/:id    delete one; accounts using it keep their money, with no model
 */
export function createModelsRouter(db: Db): Router {
  const router = Router();

  function idFrom(raw: string): number {
    if (!/^\d+$/.test(raw)) throw new HttpError(404, `No model ${raw}`);
    return Number(raw);
  }

  router.get('/api/models', (_req, res) => {
    res.json(listModels(db));
  });

  router.post('/api/models', (req, res) => {
    const input = parseOr400(modelPortfolioSchema, req.body, res);
    if (input === null) return;
    res.status(201).json(createModel(db, input));
  });

  router.put('/api/models/:id', (req, res) => {
    const id = idFrom(req.params.id);
    const input = parseOr400(modelPortfolioSchema, req.body, res);
    if (input === null) return;

    if (input.id !== undefined && input.id !== req.params.id) {
      res.status(400).json({ error: `Body is model ${input.id} but the URL is model ${req.params.id}` });
      return;
    }

    const saved = updateModel(db, id, input);
    if (saved === null) {
      res.status(404).json({ error: `No model ${req.params.id}` });
      return;
    }
    res.json(saved);
  });

  router.delete('/api/models/:id', (req, res) => {
    if (!deleteModel(db, idFrom(req.params.id))) {
      res.status(404).json({ error: `No model ${req.params.id}` });
      return;
    }
    res.status(204).end();
  });

  return router;
}
