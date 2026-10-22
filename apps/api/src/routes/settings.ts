import type { AppSettings } from '@ai4rig/shared';
import { Router } from 'express';

import type { SecretStore } from '../secrets.js';
import { openAiKeySchema, parseOr400 } from '../validation.js';

/**
 * Settings the advisor can change on this computer. Today that is only the
 * OpenAI key for US-28. The key goes in and never comes back out: reads say
 * only whether one is set.
 *
 *   GET /api/settings              { openAiKeyConfigured, openAiKeyEditable, openAiModel }
 *   PUT /api/settings/openai-key   { apiKey: "sk-..." } to save, { apiKey: null } to remove
 *        409 when the key comes from .env and the app cannot change it
 */
export function createSettingsRouter({
  openAiKey,
  openAiModel,
}: {
  openAiKey: SecretStore;
  openAiModel: string;
}): Router {
  const router = Router();

  const current = (): AppSettings => ({
    openAiKeyConfigured: openAiKey.get() !== undefined,
    openAiKeyEditable: openAiKey.writable,
    openAiModel,
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

  return router;
}
