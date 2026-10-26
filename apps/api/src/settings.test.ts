import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase, runMigrations, type Db } from '@ai4rig/db';
import type { AppSettings } from '@ai4rig/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp, type AppDeps } from './app.js';
import { HttpError } from './errors.js';
import { envSecretStore, memorySecretStore } from './secrets.js';

/**
 * What the desktop app adds to the API: a writable OpenAI key store behind
 * the Settings screen, and serving the built front end from the same address.
 */

let workspace: string;
let db: Db;
let stop: (() => Promise<void>) | undefined;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'ai4rig-settings-'));
  db = openDatabase({ path: join(workspace, 'test.db') });
  runMigrations(db);
});

afterEach(async () => {
  await stop?.();
  stop = undefined;
  db.close();
  rmSync(workspace, { recursive: true, force: true });
});

async function serve(deps: Omit<AppDeps, 'config' | 'db'>, nodeEnv = 'test'): Promise<string> {
  const { app } = createApp({
    config: { host: '127.0.0.1', port: 0, webOrigins: [], nodeEnv, appVersion: '9.9.9' },
    db,
    ...deps,
  });
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('expected a TCP address');
      stop = () => new Promise<void>((done) => server.close(() => done()));
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

const json = (body: unknown) => ({
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('OpenAI key settings', () => {
  it('saves a key, reports it as set without ever returning it, and removes it', async () => {
    const store = memorySecretStore();
    const base = await serve({ openAiKey: store });

    const before = (await (await fetch(`${base}/api/settings`)).json()) as AppSettings;
    expect(before).toMatchObject({ openAiKeyConfigured: false, openAiKeyEditable: true });

    const key = 'sk-proj-abcdefghijklmnopqrstuvwxyz';
    const saved = await fetch(`${base}/api/settings/openai-key`, json({ apiKey: key }));
    expect(saved.status).toBe(200);
    expect(await saved.text()).not.toContain(key);
    expect(store.get()).toBe(key);

    const health = (await (await fetch(`${base}/api/health`)).json()) as Record<string, unknown>;
    expect(health.lifeExpectancyEstimates).toBe(true);
    expect(health.appVersion).toBe('9.9.9');

    await fetch(`${base}/api/settings/openai-key`, json({ apiKey: null }));
    expect(store.get()).toBeUndefined();
  });

  it('refuses something that is not a key', async () => {
    const base = await serve({ openAiKey: memorySecretStore() });
    expect((await fetch(`${base}/api/settings/openai-key`, json({ apiKey: 'short' }))).status).toBe(400);
    expect((await fetch(`${base}/api/settings/openai-key`, json({ apiKey: 'sk-has a space in it here' }))).status).toBe(400);
  });

  it('will not change a key that comes from .env', async () => {
    const base = await serve({ openAiKey: envSecretStore('sk-from-env-file-abcdefghij') });
    const settings = (await (await fetch(`${base}/api/settings`)).json()) as AppSettings;
    expect(settings).toMatchObject({ openAiKeyConfigured: true, openAiKeyEditable: false });

    const attempt = await fetch(`${base}/api/settings/openai-key`, json({ apiKey: null }));
    expect(attempt.status).toBe(409);
  });
});

describe('serving the built front end', () => {
  it('serves index.html at / with a content security policy, and the API beside it', async () => {
    const web = join(workspace, 'web');
    mkdirSync(web);
    writeFileSync(join(web, 'index.html'), '<!doctype html><title>AI4RIG</title>');
    const base = await serve({ webRoot: web });

    const page = await fetch(`${base}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<title>AI4RIG</title>');
    expect(page.headers.get('content-security-policy')).toContain("default-src 'self'");

    expect((await fetch(`${base}/api/health`)).status).toBe(200);
    expect((await fetch(`${base}/api/nothing-here`)).status).toBe(404);
  });

  it('serves nothing but the API when no front end is given', async () => {
    const base = await serve({});
    expect((await fetch(`${base}/`)).status).toBe(404);
  });
});

describe('error messages in the installed app', () => {
  const request = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ age: 63, gender: 'FEMALE', healthConcerns: [], healthConcernOther: '' }),
  };

  it('tells the advisor how to set up the AI estimate, rather than "Internal server error"', async () => {
    const base = await serve({ openAiKey: envSecretStore(undefined) }, 'production');
    const response = await fetch(`${base}/api/life-expectancy/estimate`, request);
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: string }).error).toMatch(/Settings screen/);
  });

  it('passes on an OpenAI problem the advisor can act on', async () => {
    const base = await serve(
      {
        estimator: async () => {
          throw new HttpError(502, 'OpenAI refused the API key in .env. Type the age in for now.');
        },
      },
      'production',
    );
    const response = await fetch(`${base}/api/life-expectancy/estimate`, request);
    expect(((await response.json()) as { error: string }).error).toMatch(/refused the API key/);
  });

  it('still hides an unexpected crash, whose message is meant for us', async () => {
    const base = await serve(
      {
        estimator: async () => {
          throw new Error('Cannot read properties of undefined (reading "x") at internal.ts:12');
        },
      },
      'production',
    );
    const response = await fetch(`${base}/api/life-expectancy/estimate`, request);
    expect(response.status).toBe(500);
    expect(((await response.json()) as { error: string }).error).toBe('Internal server error');
  });
});
