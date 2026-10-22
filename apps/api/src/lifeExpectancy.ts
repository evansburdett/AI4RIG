/**
 * US-28: estimate how long a person is likely to live, for the plan horizon.
 *
 * RIG chose an AI estimate the advisor can override (Sept 23) and will supply
 * the OpenAI key. The model is given age, gender, and health concerns and
 * nothing else: no birth year, no case number, no initials (ADR 0006). The
 * answer is a suggestion; the profile shows it as one and the advisor can type
 * over it.
 *
 * The key lives in the machine's own .env as OPENAI_API_KEY, never in the
 * repository. Without one, the route answers 503 and the advisor types the
 * age in by hand, exactly as before.
 *
 * Everything the model returns is checked before it reaches the screen. A
 * financial plan built on a hallucinated number is the failure RIG named in
 * the first meeting, so an answer that is not a whole age between the
 * person's current age and 120 is refused rather than passed on.
 */

import type { LifeExpectancyEstimate, LifeExpectancyRequest } from '@ai4rig/shared';

import { HttpError } from './errors.js';

/** Swappable so tests never reach the network. */
export type Estimator = (request: LifeExpectancyRequest) => Promise<LifeExpectancyEstimate>;

export interface OpenAiSettings {
  /** Undefined or '' means not configured. */
  apiKey: string | undefined;
  model: string;
  /** Overridable for tests. */
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** No person in the life tables is planned past this. */
const MAX_AGE = 120;

const SYSTEM_PROMPT = [
  'You estimate life expectancy for a retirement planning tool used by a financial advisor.',
  'You are given a person\'s current age, gender, and any health concerns the advisor recorded.',
  'Start from United States period life tables for that age and gender, then adjust for the',
  'health concerns. Answer the age the person is expected to live to, as a whole number of years,',
  'never less than their current age.',
  'Reply with JSON only, shaped exactly like:',
  '{"lifeExpectancyAge": 87, "explanation": "One or two plain sentences on the baseline and each adjustment."}',
].join(' ');

const CONCERN_WORDS: Record<LifeExpectancyRequest['healthConcerns'][number], string> = {
  CANCER: 'cancer',
  STROKE: 'stroke',
  HEART: 'heart condition',
  OTHER: 'other',
};

/** The user message: the request, in words, and nothing more. */
export function describePerson(request: LifeExpectancyRequest): string {
  const concerns = request.healthConcerns
    .filter((c) => c !== 'OTHER')
    .map((c) => CONCERN_WORDS[c]);
  if (request.healthConcerns.includes('OTHER')) {
    const other = request.healthConcernOther.trim();
    concerns.push(other === '' ? 'an unspecified other condition' : other);
  }

  return [
    `Current age: ${request.age}`,
    `Gender: ${request.gender === 'MALE' ? 'male' : 'female'}`,
    `Health concerns: ${concerns.length === 0 ? 'none reported' : concerns.join('; ')}`,
  ].join('\n');
}

/**
 * Turn the model's reply into an estimate, or throw a 502 that says what was
 * wrong with it. Rounds a fractional age; refuses anything outside
 * [current age, 120].
 */
export function readEstimate(
  content: string,
  request: LifeExpectancyRequest,
  model: string,
): LifeExpectancyEstimate {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new HttpError(502, 'The life expectancy model did not answer in the expected format. Try again, or type the age in.');
  }

  const raw = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const age = typeof raw.lifeExpectancyAge === 'number' ? Math.round(raw.lifeExpectancyAge) : NaN;
  if (!Number.isFinite(age) || age < request.age || age > MAX_AGE) {
    throw new HttpError(
      502,
      `The life expectancy model answered ${JSON.stringify(raw.lifeExpectancyAge)}, which is not an age ` +
        `between ${request.age} and ${MAX_AGE}. Try again, or type the age in.`,
    );
  }

  const explanation =
    typeof raw.explanation === 'string' ? raw.explanation.trim().slice(0, 600) : '';

  return { lifeExpectancyAge: age, explanation, model };
}

/** Build the estimator for this machine's settings. */
export function openAiEstimator(settings: OpenAiSettings): Estimator {
  const doFetch = settings.fetch ?? fetch;
  const baseUrl = (settings.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');

  return async (request) => {
    if (settings.apiKey === undefined || settings.apiKey.trim() === '') {
      throw new HttpError(
        503,
        'AI life expectancy estimates are not set up on this computer (no OPENAI_API_KEY in .env). ' +
          'Type the age in for now.',
      );
    }

    let response: Response;
    try {
      response = await doFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: settings.model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: describePerson(request) },
          ],
        }),
        signal: AbortSignal.timeout(settings.timeoutMs ?? 30_000),
      });
    } catch {
      throw new HttpError(502, 'Could not reach OpenAI for a life expectancy estimate. Check the internet connection, or type the age in.');
    }

    if (!response.ok) {
      // Never echo the body: an auth failure's body can quote part of the key.
      const reason =
        response.status === 401
          ? 'OpenAI refused the API key in .env'
          : response.status === 429
            ? 'OpenAI is rate limiting this key or it is out of credit'
            : `OpenAI answered ${response.status}`;
      throw new HttpError(502, `${reason}. Type the age in for now.`);
    }

    const body = (await response.json().catch(() => null)) as {
      model?: unknown;
      choices?: { message?: { content?: unknown } }[];
    } | null;
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new HttpError(502, 'OpenAI sent back an empty answer. Try again, or type the age in.');
    }

    return readEstimate(content, request, typeof body?.model === 'string' ? body.model : settings.model);
  };
}
