import { Router } from 'express';
import type { Db } from '@ai4rig/db';

import { z } from 'zod';

const clientIntakeSchema = z.object({
  accountData: z.record(z.string(), z.unknown()),
  incomeCents: z.number().int(),
  spendingCents: z.number().int(),
});

export function createClientsRouter(db: Db): Router {
  const router = Router();

  router.get('/api/clients', (_req, res) => {
    const rows = db.prepare('SELECT id FROM clients ORDER BY id').all();
    res.json(rows);
  });

  router.get('/api/clients/:id', (req, res) => {
    const client = db
      .prepare('SELECT * FROM clients WHERE id = ?')
      .get(req.params.id);

    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    res.json(client);
  });


  router.post('/api/clients', (req, res) => {
    const parsed = clientIntakeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    res.json({ received: parsed.data });
  });
  
  return router;
}