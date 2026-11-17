import type { Db } from '@ai4rig/db';
import { DEFAULT_THRESHOLDS, type AlertThresholds, type AppSettings } from '@ai4rig/shared';
import { Router } from 'express';

import type { SecretStore } from '../secrets.js';
import { marketDataKeySchema, openAiKeySchema, parseOr400, thresholdsSchema } from '../validation.js';

/** The alert thresholds this computer uses, or the defaults until someone changes them. */
export function readThresholds(db: Db): AlertThresholds {
  const row = db.prepare<[], { value: string }>("SELECT value FROM app_settings WHERE key = 'thresholds'").get();
  if (row === undefined) return DEFAULT_THRESHOLDS;
  const parsed = thresholdsSchema.safeParse(JSON.parse(row.value));
  return parsed.success ? parsed.data : DEFAULT_THRESHOLDS;
}

/**
 * Settings the advisor can change on this computer: the OpenAI key for US-28
 * and the Market Data key for live prices. A key goes in and never comes back
 * out: reads say only whether one is set.
 *
 *   GET /api/settings                   whether each key is set and can be changed
 *   PUT /api/settings/openai-key        { apiKey: "sk-..." } to save, { apiKey: null } to remove
 *   PUT /api/settings/market-data-key   the same
 *   PUT /api/settings/thresholds        { cashExcessBps, driftBps } for the account alerts
 *        409 when the key comes from .env and the app cannot change it
 */
export function createSettingsRouter({
  openAiKey,
  openAiModel,
  marketDataKey,
  db,
}: {
  openAiKey: SecretStore;
  openAiModel: string;
  marketDataKey: SecretStore;
  db: Db;
}): Router {
  const router = Router();

  const current = (): AppSettings => ({
    openAiKeyConfigured: openAiKey.get() !== undefined,
    openAiKeyEditable: openAiKey.writable,
    openAiModel,
    marketDataKeyConfigured: marketDataKey.get() !== undefined,
    marketDataKeyEditable: marketDataKey.writable,
    thresholds: readThresholds(db),
  });

  router.get('/api/settings', (_req, res) => {
    res.json(current());
  });

  router.put('/api/settings/openai-key', (req, res) => {
    const body = parseOr400(openAiKeySchema, req.body, res);
    if (body === null) return;

    if (!openAiKey.writable) {
      res.status(409).json({
        error: 'This computer reads the OpenAI key from .env. Change OPENAI_API_KEY there instead.',
      });
      return;
    }
    openAiKey.set(body.apiKey);
    res.json(current());
  });

  router.put('/api/settings/thresholds', (req, res) => {
    const thresholds = parseOr400(thresholdsSchema, req.body, res);
    if (thresholds === null) return;
    db.prepare(
      "INSERT INTO app_settings (key, value) VALUES ('thresholds', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    ).run(JSON.stringify(thresholds));
    res.json(current());
  });

  router.put('/api/settings/market-data-key', (req, res) => {
    const body = parseOr400(marketDataKeySchema, req.body, res);
    if (body === null) return;

    if (!marketDataKey.writable) {
      res.status(409).json({
        error: 'This computer reads the Market Data key from .env. Change MARKETDATA_API_KEY there instead.',
      });
      return;
    }
    marketDataKey.set(body.apiKey);
    res.json(current());
  });

  return router;
}
