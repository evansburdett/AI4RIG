import { Router } from 'express';

import type { Estimator } from '../lifeExpectancy.js';
import { lifeExpectancyRequestSchema, parseOr400 } from '../validation.js';

/**
 * US-28. Stateless: nothing is saved here. The profile puts the answer in the
 * person's life expectancy field, and it is saved with the case like anything
 * the advisor typed.
 *
 *   POST /api/life-expectancy/estimate   { age, gender, healthConcerns, healthConcernOther }
 *        200 { lifeExpectancyAge, explanation, model }
 *        503 no OpenAI key on this machine
 *        502 OpenAI failed, or answered something that is not a usable age
 */
export function createLifeExpectancyRouter(estimate: Estimator): Router {
  const router = Router();

  router.post('/api/life-expectancy/estimate', async (req, res) => {
    const request = parseOr400(lifeExpectancyRequestSchema, req.body, res);
    if (request === null) return;
    res.json(await estimate(request));
  });

  return router;
}
