import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase, runMigrations, runSeeds, type Db } from '@ai4rig/db';
import type { BucketDefinition, ClientCase, ClientSummary, Ticker } from '@ai4rig/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from './app.js';

/**
 * Every route against a temp database built from the real migrations and
 * seeds, so these double as a check that the schema, the repositories, and the
 * shapes in @ai4rig/shared agree.
 */

let workspace: string;
let db: Db;
let baseUrl: string;
let close: () => Promise<void>;

beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), 'ai4rig-routes-'));
});

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

beforeEach(async () => {
  db = openDatabase({ path: join(workspace, `${Date.now()}-${Math.random()}.db`) });
  runMigrations(db);
  runSeeds(db);

  const { app } = createApp({
    config: { host: '127.0.0.1', port: 0, webOrigins: [], nodeEnv: 'test' },
    db,
  });

  await new Promise<void>((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('expected a TCP address');
      baseUrl = `http://127.0.0.1:${address.port}`;
      close = () => new Promise<void>((done) => server.close(() => done()));
      resolve();
    });
  });
});

afterEach(async () => {
  await close();
  db.close();
});

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: (text === '' ? null : JSON.parse(text)) as T };
}

describe('client cases', () => {
  it('lists the seeded cases for the switcher', async () => {
    const { status, body } = await call<ClientSummary[]>('GET', '/api/clients');

    expect(status).toBe(200);
    expect(body.map((c) => c.clientNumber)).toEqual(['1042', '2317']);
    expect(body[0]).toMatchObject({ initials: 'A.B.', lifeStage: 'DISTRIBUTION_GO_GO' });
  });

  it('returns a whole case, children in order', async () => {
    const { status, body } = await call<ClientCase>('GET', '/api/clients/1042');

    expect(status).toBe(200);
    expect(body.people.map((p) => p.role)).toEqual(['CLIENT', 'SPOUSE']);
    expect(body.accounts.map((a) => a.accountType)).toEqual(['JOINT', 'IRA', 'ROTH_IRA']);
    expect(body.accounts[0]?.holdings.map((h) => h.tickerSymbol)).toEqual(['SGOV', 'BND', 'VTI']);
    expect(body.nowInputs.plannedExpenses).toEqual([
      { id: expect.any(String), label: 'Roof replacement', costCents: 4_000_000 },
    ]);
    expect(body.soonInputs.socialSecurityBridges.map((g) => g.years)).toEqual([3, 1.5]);
    expect(body.soonInputs.miscellaneousCosts.map((c) => c.label)).toEqual(['Boat']);
  });

  it('404s a case that does not exist', async () => {
    const { status } = await call('GET', '/api/clients/9999');
    expect(status).toBe(404);
  });

  it('creates a blank case with the next client number', async () => {
    const { status, body } = await call<ClientCase>('POST', '/api/clients');

    expect(status).toBe(201);
    expect(body.clientNumber).toBe('2318');
    expect(body.people.map((p) => p.role)).toEqual(['CLIENT', 'SPOUSE']);
    expect(body.accounts).toHaveLength(1);

    const list = await call<ClientSummary[]>('GET', '/api/clients');
    expect(list.body.map((c) => c.clientNumber)).toContain('2318');
  });

  it('saves an edited case and reads back exactly what was saved', async () => {
    const { body: original } = await call<ClientCase>('GET', '/api/clients/2317');

    const edited: ClientCase = {
      ...original,
      initials: 'C.D.E.',
      lifeStage: 'PRESERVATION',
      accounts: [
        ...original.accounts,
        {
          id: 'acct-local-1',
          accountType: 'IRA',
          maskedNumber: '0042',
          holdings: [
            { id: 'h-local-1', tickerSymbol: 'bnd', marketValueCents: 12_345_67, assignedBucket: 'SOON' },
          ],
        },
      ],
      soonInputs: {
        ...original.soonInputs,
        forcedWithdrawals: [
          { id: 'gap-local-1', label: 'Client', annualAmountCents: 20_000_00, years: 10, multiplier: 1.15 },
        ],
      },
    };

    const saved = await call<ClientCase>('PUT', '/api/clients/2317', edited);
    expect(saved.status).toBe(200);
    expect(saved.body.updatedAt).not.toBe(original.updatedAt);

    const { body: reread } = await call<ClientCase>('GET', '/api/clients/2317');
    expect(reread).toEqual(saved.body);
    expect(reread.initials).toBe('C.D.E.');
    expect(reread.lifeStage).toBe('PRESERVATION');
    expect(reread.accounts).toHaveLength(3);
    // Symbols are stored upper-case; local ids are replaced by database ids.
    expect(reread.accounts[2]?.holdings[0]).toMatchObject({ tickerSymbol: 'BND', marketValueCents: 12_345_67 });
    expect(reread.accounts[2]?.id).not.toBe('acct-local-1');
    expect(reread.soonInputs.forcedWithdrawals[0]?.multiplier).toBe(1.15);
  });

  it('can remove every account and line from a case', async () => {
    const { body: original } = await call<ClientCase>('GET', '/api/clients/1042');
    const emptied: ClientCase = {
      ...original,
      accounts: [],
      nowInputs: { ...original.nowInputs, plannedExpenses: [] },
      soonInputs: { ...original.soonInputs, socialSecurityBridges: [], miscellaneousCosts: [] },
    };

    const { body } = await call<ClientCase>('PUT', '/api/clients/1042', emptied);

    expect(body.accounts).toEqual([]);
    expect(body.nowInputs.plannedExpenses).toEqual([]);
    const orphans = db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM holdings WHERE account_id IN (9001, 9002, 9003)').get();
    expect(orphans?.n).toBe(0);
  });

  it('rejects float money with a 400 and leaves the case alone', async () => {
    const { body: original } = await call<ClientCase>('GET', '/api/clients/1042');

    const { status, body } = await call<{ issues: { path: string }[] }>('PUT', '/api/clients/1042', {
      ...original,
      cashOnHandCents: 100.5,
    });

    expect(status).toBe(400);
    expect(body.issues.map((i) => i.path)).toContain('cashOnHandCents');
    const { body: after } = await call<ClientCase>('GET', '/api/clients/1042');
    expect(after).toEqual(original);
  });

  it('rejects a full account number', async () => {
    const { body: original } = await call<ClientCase>('GET', '/api/clients/1042');
    const [first, ...rest] = original.accounts;
    if (first === undefined) throw new Error('seed case has accounts');

    const { status } = await call('PUT', '/api/clients/1042', {
      ...original,
      accounts: [{ ...first, maskedNumber: '123456789' }, ...rest],
    });

    expect(status).toBe(400);
  });

  it('rejects a body whose client number does not match the URL', async () => {
    const { body: original } = await call<ClientCase>('GET', '/api/clients/1042');
    const { status } = await call('PUT', '/api/clients/2317', original);
    expect(status).toBe(400);
  });

  it('deletes a case and everything under it', async () => {
    const deleted = await call('DELETE', '/api/clients/1042');
    expect(deleted.status).toBe(204);

    expect((await call('GET', '/api/clients/1042')).status).toBe(404);
    expect((await call('DELETE', '/api/clients/1042')).status).toBe(404);
    const holdings = db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM holdings').get();
    expect(holdings?.n).toBe(5); // only 2317's remain
  });

  it('answers malformed JSON with a JSON 400', async () => {
    const response = await fetch(`${baseUrl}/api/clients/1042`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty('error');
  });
});

describe('tickers', () => {
  it('lists the universe alphabetically', async () => {
    const { body } = await call<Ticker[]>('GET', '/api/tickers');
    expect(body).toHaveLength(10);
    expect(body[0]).toEqual({ symbol: 'BIL', assetClass: 'CASH', defaultBucket: 'NOW' });
  });

  it('updates an existing ticker and adds a new one', async () => {
    const updated = await call<Ticker>('PUT', '/api/tickers/GLD', {
      symbol: 'GLD',
      assetClass: 'ALTERNATIVE',
      defaultBucket: 'LATER',
    });
    expect(updated.status).toBe(200);

    const added = await call<Ticker>('PUT', '/api/tickers/schd', {
      symbol: 'schd',
      assetClass: 'EQUITY',
      defaultBucket: 'LATER',
    });
    expect(added.body.symbol).toBe('SCHD');

    const { body } = await call<Ticker[]>('GET', '/api/tickers');
    expect(body.find((t) => t.symbol === 'GLD')).toMatchObject({ assetClass: 'ALTERNATIVE' });
    expect(body).toHaveLength(11);
  });

  it('rejects an unknown asset class', async () => {
    const { status } = await call('PUT', '/api/tickers/GLD', {
      symbol: 'GLD',
      assetClass: 'CRYPTO',
      defaultBucket: 'LATER',
    });
    expect(status).toBe(400);
  });

  it('deletes a ticker', async () => {
    expect((await call('DELETE', '/api/tickers/GLD')).status).toBe(204);
    expect((await call('DELETE', '/api/tickers/GLD')).status).toBe(404);
  });
});

describe('bucket definitions', () => {
  it('lists Now, Soon, Later in that order', async () => {
    const { body } = await call<BucketDefinition[]>('GET', '/api/bucket-definitions');
    expect(body.map((d) => d.bucket)).toEqual(['NOW', 'SOON', 'LATER']);
  });

  it('saves an edit', async () => {
    const edit: BucketDefinition = {
      bucket: 'SOON',
      label: 'Soon',
      horizonMonths: 96,
      purposeText: 'Eight years of preservation.',
    };
    const { status, body } = await call<BucketDefinition>('PUT', '/api/bucket-definitions/SOON', edit);
    expect(status).toBe(200);
    expect(body).toEqual(edit);

    const { body: list } = await call<BucketDefinition[]>('GET', '/api/bucket-definitions');
    expect(list[1]).toEqual(edit);
  });

  it('404s a bucket that does not exist', async () => {
    const { status } = await call('PUT', '/api/bucket-definitions/SOMEDAY', {});
    expect(status).toBe(404);
  });
});
