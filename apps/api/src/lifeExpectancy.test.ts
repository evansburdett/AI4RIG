import type { LifeExpectancyRequest } from '@ai4rig/shared';
import { describe, expect, it } from 'vitest';

import { describePerson, openAiEstimator, readEstimate } from './lifeExpectancy.js';

const PERSON: LifeExpectancyRequest = {
  age: 63,
  gender: 'FEMALE',
  healthConcerns: ['HEART', 'OTHER'],
  healthConcernOther: 'Managed hypertension',
};

/** A fetch that records what it was sent and answers with `reply`. */
function fakeFetch(reply: { status?: number; content?: string; body?: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const body =
      reply.body ?? { model: 'test-model', choices: [{ message: { content: reply.content ?? '' } }] };
    return new Response(JSON.stringify(body), { status: reply.status ?? 200 });
  }) as typeof fetch;
  return { fn, calls };
}

describe('describePerson', () => {
  it('says age, gender, and concerns, with the Other text in place of "other"', () => {
    expect(describePerson(PERSON)).toBe(
      'Current age: 63\nGender: female\nHealth concerns: heart condition; Managed hypertension',
    );
  });

  it('says none reported for an empty list', () => {
    expect(describePerson({ ...PERSON, healthConcerns: [], healthConcernOther: '' })).toMatch(
      /Health concerns: none reported/,
    );
  });
});

describe('readEstimate', () => {
  it('takes a whole age and the explanation', () => {
    expect(readEstimate('{"lifeExpectancyAge": 84, "explanation": "Baseline 85, less 1."}', PERSON, 'm')).toEqual({
      lifeExpectancyAge: 84,
      explanation: 'Baseline 85, less 1.',
      model: 'm',
    });
  });

  it('rounds a fractional age', () => {
    expect(readEstimate('{"lifeExpectancyAge": 84.6}', PERSON, 'm').lifeExpectancyAge).toBe(85);
  });

  it('refuses an age below the current one, above 120, or missing', () => {
    expect(() => readEstimate('{"lifeExpectancyAge": 50}', PERSON, 'm')).toThrow(/between 63 and 120/);
    expect(() => readEstimate('{"lifeExpectancyAge": 140}', PERSON, 'm')).toThrow(/between 63 and 120/);
    expect(() => readEstimate('{"age": 80}', PERSON, 'm')).toThrow(/not an age/);
  });

  it('refuses something that is not JSON', () => {
    expect(() => readEstimate('About 85 years.', PERSON, 'm')).toThrow(/expected format/);
  });
});

describe('openAiEstimator', () => {
  it('answers 503 without a key, and never calls out', async () => {
    const { fn, calls } = fakeFetch({ content: '{}' });
    const estimate = openAiEstimator({ apiKey: '', model: 'm', fetch: fn });
    await expect(estimate(PERSON)).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(0);
  });

  it('sends only age, gender, and concerns, and returns the checked answer', async () => {
    const { fn, calls } = fakeFetch({
      content: '{"lifeExpectancyAge": 84, "explanation": "Baseline, less a little for heart."}',
    });
    const estimate = openAiEstimator({ apiKey: 'sk-test', model: 'm', fetch: fn });

    await expect(estimate(PERSON)).resolves.toEqual({
      lifeExpectancyAge: 84,
      explanation: 'Baseline, less a little for heart.',
      model: 'test-model',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.openai.com/v1/chat/completions');
    const sent = JSON.parse(String(calls[0]?.init.body)) as { messages: { role: string; content: string }[] };
    expect(sent.messages[1]?.content).toBe(describePerson(PERSON));
  });

  it('turns an OpenAI failure into a 502 that does not repeat the response', async () => {
    const { fn } = fakeFetch({ status: 401, body: { error: { message: 'Incorrect API key sk-te***' } } });
    const estimate = openAiEstimator({ apiKey: 'sk-test', model: 'm', fetch: fn });
    const failure = estimate(PERSON);
    await expect(failure).rejects.toMatchObject({ status: 502 });
    await expect(failure).rejects.not.toThrow(/sk-te/);
  });
});
