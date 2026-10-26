import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { memorySecretStore } from '@ai4rig/api/secrets';
import { migrationsDir, seedDir } from '@ai4rig/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { databasePathIn, startServer, type RunningServer } from './server.js';

/**
 * The desktop app's server, without Electron: a fresh data folder, the real
 * migrations, and the same reference seeds the build copies in.
 */

let workspace: string;
let server: RunningServer | undefined;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'ai4rig-desktop-'));
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  rmSync(workspace, { recursive: true, force: true });
});

function folders() {
  const web = join(workspace, 'web');
  mkdirSync(web);
  writeFileSync(join(web, 'index.html'), '<!doctype html><title>AI4RIG</title>');

  // What scripts/build.mjs copies: tickers and models, never the sample cases.
  const referenceSeedDir = join(workspace, 'reference-seed');
  mkdirSync(referenceSeedDir);
  for (const file of ['0001_placeholder_tickers.sql', '0002_placeholder_models.sql']) {
    copyFileSync(join(seedDir(), file), join(referenceSeedDir, file));
  }

  return {
    dataDir: join(workspace, 'data'),
    webRoot: web,
    migrationsDir: migrationsDir(),
    referenceSeedDir,
    appVersion: '1.2.3',
    openAiKey: memorySecretStore(),
  };
}

describe('startServer', () => {
  it('creates the database in the data folder and serves the app and the API', async () => {
    const options = folders();
    server = await startServer(options);

    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(server.databasePath).toBe(databasePathIn(options.dataDir));

    const health = (await (await fetch(`${server.url}/api/health`)).json()) as Record<string, unknown>;
    expect(health).toMatchObject({ status: 'ok', appVersion: '1.2.3', databasePath: server.databasePath });
    expect(await (await fetch(`${server.url}/`)).text()).toContain('<title>AI4RIG</title>');
  });

  it('shuts down promptly even while a request is still arriving', async () => {
    server = await startServer(folders());
    // A request whose headers never finish keeps its connection busy, which
    // on its own makes server.close() wait until Node's 60-second timeout.
    const { port } = new URL(server.url);
    const socket = connect(Number(port), '127.0.0.1');
    await new Promise((resolve) => socket.once('connect', resolve));
    socket.write('GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\n');
    await new Promise((resolve) => setTimeout(resolve, 100));

    const closing = server.close();
    server = undefined;
    const outcome = await Promise.race([
      closing.then(() => 'closed'),
      new Promise((resolve) => setTimeout(() => resolve('hung'), 2_000)),
    ]);
    expect(outcome).toBe('closed');
    socket.destroy();
  });

  it('starts a new install with tickers and models (RIG\'s, from the migrations), and no client cases', async () => {
    server = await startServer(folders());
    const tickers = (await (await fetch(`${server.url}/api/tickers`)).json()) as unknown[];
    const models = (await (await fetch(`${server.url}/api/models`)).json()) as unknown[];
    const clients = (await (await fetch(`${server.url}/api/clients`)).json()) as unknown[];
    expect(tickers.length).toBeGreaterThan(0);
    expect(models.length).toBeGreaterThan(0);
    expect(clients).toEqual([]);
  });

  it('closes at once when the app quits, with every write already on disk', async () => {
    const options = folders();
    server = await startServer(options);
    await fetch(`${server.url}/api/clients`, { method: 'POST' });
    server.closeNow();
    expect(server.db.open).toBe(false);

    server = await startServer(options);
    const clients = (await (await fetch(`${server.url}/api/clients`)).json()) as unknown[];
    expect(clients).toHaveLength(1);
  });

  it('keeps the advisor\'s data and edits when started again, as after an update', async () => {
    const options = folders();
    server = await startServer(options);
    const created = (await (await fetch(`${server.url}/api/clients`, { method: 'POST' })).json()) as {
      clientNumber: string;
    };
    await fetch(`${server.url}/api/models/9001`, { method: 'DELETE' });
    await server.close();

    server = await startServer(options);
    const clients = (await (await fetch(`${server.url}/api/clients`)).json()) as { clientNumber: string }[];
    expect(clients.map((c) => c.clientNumber)).toEqual([created.clientNumber]);
    // The reference seed did not run again and bring the deleted model back.
    const models = (await (await fetch(`${server.url}/api/models`)).json()) as { id: string }[];
    expect(models.map((m) => m.id)).not.toContain('9001');
  });
});
