import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase, runMigrations, type Db } from '@ai4rig/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import type { ApiConfig } from './config.js';

/** Shape of the /api/health body, asserted rather than inferred from `any`. */
interface HealthBody {
  status: string;
  databasePath: string;
  migrationsApplied: number;
  apiHost: string;
  apiPort: number;
  nodeEnv: string;
  time: string;
}

const config: ApiConfig = {
  host: '127.0.0.1',
  port: 0,
  webOrigins: ['http://localhost:5173'],
  nodeEnv: 'test',
};

let workspace: string;
let db: Db;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'ai4rig-api-'));
  db = openDatabase({ path: join(workspace, 'test.db') });
});

afterEach(() => {
  db.close();
  rmSync(workspace, { recursive: true, force: true });
});

/** Boot the app on an ephemeral port and return its base URL plus a stopper. */
async function listen(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const { app } = createApp({ config, db });

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('expected a TCP address');
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

describe('GET /api/health', () => {
  it('reports the database file and the number of migrations applied', async () => {
    const migrations = join(workspace, 'migrations');
    mkdirSync(migrations, { recursive: true });
    writeFileSync(
      join(migrations, '0001_create_widget.sql'),
      'CREATE TABLE widget (id INTEGER PRIMARY KEY);',
    );
    runMigrations(db, migrations);

    const { baseUrl, close } = await listen();
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      expect(response.status).toBe(200);

      const body = (await response.json()) as HealthBody;
      expect(body.status).toBe('ok');
      expect(body.migrationsApplied).toBe(1);
      expect(body.databasePath).toBe(join(workspace, 'test.db'));
      expect(body.apiHost).toBe('127.0.0.1');
    } finally {
      await close();
    }
  });

  it('answers on an empty database with zero migrations', async () => {
    const { baseUrl, close } = await listen();
    try {
      const body = (await fetch(`${baseUrl}/api/health`).then((r) => r.json())) as HealthBody;
      expect(body.migrationsApplied).toBe(0);
    } finally {
      await close();
    }
  });

  it('404s an unknown route as JSON', async () => {
    const { baseUrl, close } = await listen();
    try {
      const response = await fetch(`${baseUrl}/api/nope`);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Not found' });
    } finally {
      await close();
    }
  });
});
