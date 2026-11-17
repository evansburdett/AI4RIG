import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase, runMigrations, type Db } from '@ai4rig/db';
import type { AppSettings, CaseTransferFile, ClientCase, ClientReport, ImportCasesResult } from '@ai4rig/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from './app.js';

/** Reports, alert thresholds, and moving cases between computers (RIG, 11/2). */

let workspace: string;
let db: Db;
let base: string;
let stop: () => Promise<void>;

async function serve(database: Db): Promise<[string, () => Promise<void>]> {
  const { app } = createApp({ config: { host: '127.0.0.1', port: 0, webOrigins: [], nodeEnv: 'test' }, db: database });
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('expected a TCP address');
      resolve([`http://127.0.0.1:${address.port}`, () => new Promise<void>((done) => server.close(() => done()))]);
    });
  });
}

const call = async <T>(url: string, method = 'GET', body?: unknown): Promise<{ status: number; body: T }> => {
  const response = await fetch(url, {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: (text === '' ? undefined : JSON.parse(text)) as T };
};

const snapshot = (clientNumber: string) => ({ version: 1, clientNumber, totalCents: 100, buckets: [] });

beforeEach(async () => {
  workspace = mkdtempSync(join(tmpdir(), 'ai4rig-transfer-'));
  db = openDatabase({ path: join(workspace, 'test.db') });
  runMigrations(db);
  [base, stop] = await serve(db);
});

afterEach(async () => {
  await stop();
  db.close();
  rmSync(workspace, { recursive: true, force: true });
});

describe('reports', () => {
  it('keeps each report as generated, newest first, and deletes one', async () => {
    const created = (await call<ClientCase>(`${base}/api/clients`, 'POST')).body;
    const url = `${base}/api/clients/${created.clientNumber}/reports`;

    const first = await call<ClientReport>(url, 'POST', { snapshot: snapshot(created.clientNumber) });
    expect(first.status).toBe(201);
    await call(url, 'POST', { snapshot: { ...snapshot(created.clientNumber), totalCents: 200 } });

    const list = (await call<ClientReport[]>(url)).body;
    expect(list).toHaveLength(2);
    expect(list[0]?.snapshot.totalCents).toBe(200);

    expect((await call(`${url}/${first.body.id}`, 'DELETE')).status).toBe(204);
    expect((await call<ClientReport[]>(url)).body).toHaveLength(1);
  });

  it('refuses a report for another case', async () => {
    const created = (await call<ClientCase>(`${base}/api/clients`, 'POST')).body;
    const response = await call(`${base}/api/clients/${created.clientNumber}/reports`, 'POST', { snapshot: snapshot('9999') });
    expect(response.status).toBe(400);
  });
});

describe('alert thresholds', () => {
  it('starts at 5% and 1 point, and saves new ones', async () => {
    expect((await call<AppSettings>(`${base}/api/settings`)).body.thresholds).toEqual({
      cashExcessBps: 500,
      driftBps: 100,
      guardrailGreenMaxBps: 350,
      guardrailRedMinBps: 700,
    });
    const saved = await call<AppSettings>(`${base}/api/settings/thresholds`, 'PUT', { cashExcessBps: 300, driftBps: 250 });
    // Saved the way 0.1.6 saves them: the guardrail limits take RIG's.
    expect(saved.body.thresholds).toEqual({ cashExcessBps: 300, driftBps: 250, guardrailGreenMaxBps: 350, guardrailRedMinBps: 700 });
    expect((await call<AppSettings>(`${base}/api/settings`)).body.thresholds.driftBps).toBe(250);
  });
});

describe('moving cases between computers', () => {
  it('exports cases with their reports, and imports them on another computer, merging', async () => {
    const created = (await call<ClientCase>(`${base}/api/clients`, 'POST')).body;
    await call(`${base}/api/clients/${created.clientNumber}`, 'PUT', { ...created, initials: 'A.B.' });
    await call(`${base}/api/clients/${created.clientNumber}/reports`, 'POST', { snapshot: snapshot(created.clientNumber) });
    const file = (await call<CaseTransferFile>(`${base}/api/transfer/export`)).body;
    expect(file.cases).toHaveLength(1);
    expect(file.reports[created.clientNumber]).toHaveLength(1);

    // The other computer, which already has a case with the same number.
    const otherDb = openDatabase({ path: join(workspace, 'other.db') });
    runMigrations(otherDb);
    const [other, stopOther] = await serve(otherDb);
    try {
      const theirs = (await call<ClientCase>(`${other}/api/clients`, 'POST')).body;
      expect(theirs.clientNumber).toBe(created.clientNumber);

      const preview = (await call<ImportCasesResult>(`${other}/api/transfer/import`, 'POST', { file, dryRun: true })).body;
      expect(preview.conflicts).toEqual([created.clientNumber]);

      const result = (
        await call<ImportCasesResult>(`${other}/api/transfer/import`, 'POST', {
          file,
          choices: { [created.clientNumber]: 'COPY' },
        })
      ).body;
      const copy = result.copied[created.clientNumber]!;
      expect(copy).not.toBe(created.clientNumber);
      expect(result.backupPath !== null && existsSync(result.backupPath)).toBe(true);

      // Theirs is untouched; the copy has the initials and the report.
      expect((await call<ClientCase>(`${other}/api/clients/${theirs.clientNumber}`)).body.initials).toBe('');
      expect((await call<ClientCase>(`${other}/api/clients/${copy}`)).body.initials).toBe('A.B.');
      expect((await call<ClientReport[]>(`${other}/api/clients/${copy}/reports`)).body).toHaveLength(1);
    } finally {
      await stopOther();
      otherDb.close();
    }
  });

  it('refuses a file that is not a cases file', async () => {
    const response = await call<{ error: string }>(`${base}/api/transfer/import`, 'POST', { file: { kind: 'other' } });
    expect(response.status).toBe(400);
  });
});
