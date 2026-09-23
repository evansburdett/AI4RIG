import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase, runMigrations, runSeeds, type Db } from '@ai4rig/db';
import type { BucketDefinition, ClientCase, ClientSummary, ModelPortfolio, Ticker } from '@ai4rig/shared';
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
    expect(body.taxBracketPct).toBe(22);
    expect(body.accounts.map((a) => [a.accountType, a.taxFunnel, a.balanceCents])).toEqual([
      ['JOINT', 'TAXABLE', 1_200_000_00],
      ['IRA', 'PRE_TAX', 1_500_000_00],
      ['ROTH_IRA', 'TAX_FREE', 300_000_00],
    ]);
    expect(body.accounts[0]?.sleeves).toEqual([
      { bucket: 'NOW', amountCents: 190_000_00, modelId: '9001' },
      { bucket: 'SOON', amountCents: 400_000_00, modelId: '9002' },
      { bucket: 'LATER', amountCents: 610_000_00, modelId: '9003' },
    ]);
    expect(body.accounts[2]?.sleeves[0]).toEqual({ bucket: 'NOW', amountCents: 0, modelId: null });
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
    expect(body.taxBracketPct).toBeNull();
    expect(body.accounts).toHaveLength(1);
    expect(body.accounts[0]?.sleeves.map((sl) => sl.bucket)).toEqual(['NOW', 'SOON', 'LATER']);

    const list = await call<ClientSummary[]>('GET', '/api/clients');
    expect(list.body.map((c) => c.clientNumber)).toContain('2318');
  });

  it('saves an edited case and reads back exactly what was saved', async () => {
    const { body: original } = await call<ClientCase>('GET', '/api/clients/2317');

    const edited: ClientCase = {
      ...original,
      initials: 'C.D.E.',
      lifeStage: 'PRESERVATION',
      taxBracketPct: 24,
      accounts: [
        ...original.accounts,
        {
          id: 'acct-local-1',
          accountType: 'OTHER',
          taxFunnel: 'PRE_TAX',
          maskedNumber: '0042',
          balanceCents: 50_000_00,
          sleeves: [
            { bucket: 'NOW', amountCents: 0, modelId: null },
            { bucket: 'SOON', amountCents: 12_345_67, modelId: '9002' },
            { bucket: 'LATER', amountCents: 37_654_33, modelId: null },
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
    expect(reread.taxBracketPct).toBe(24);
    expect(reread.accounts).toHaveLength(3);
    expect(reread.accounts[2]).toMatchObject({ accountType: 'OTHER', taxFunnel: 'PRE_TAX', balanceCents: 50_000_00 });
    expect(reread.accounts[2]?.sleeves[1]).toEqual({ bucket: 'SOON', amountCents: 12_345_67, modelId: '9002' });
    // Local ids are replaced by database ids.
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
    const orphans = db
      .prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM account_sleeves WHERE account_id IN (9001, 9002, 9003)')
      .get();
    expect(orphans?.n).toBe(0);
  });

  it('refuses a model from the wrong bucket, and one that does not exist', async () => {
    const { body: original } = await call<ClientCase>('GET', '/api/clients/1042');
    const withSleeve = (modelId: string) => ({
      ...original,
      accounts: original.accounts.map((a, i) =>
        i === 0
          ? { ...a, sleeves: a.sleeves.map((sl) => (sl.bucket === 'NOW' ? { ...sl, modelId } : sl)) }
          : a,
      ),
    });

    const wrongBucket = await call<{ error: string }>('PUT', '/api/clients/1042', withSleeve('9003'));
    expect(wrongBucket.status).toBe(400);
    expect(wrongBucket.body.error).toMatch(/LATER model, not NOW/);

    const missing = await call('PUT', '/api/clients/1042', withSleeve('12345'));
    expect(missing.status).toBe(400);
  });

  it('refuses sleeves that are not exactly Now, Soon, Later', async () => {
    const { body: original } = await call<ClientCase>('GET', '/api/clients/1042');
    const [first, ...rest] = original.accounts;
    if (first === undefined) throw new Error('seed case has accounts');

    const { status } = await call('PUT', '/api/clients/1042', {
      ...original,
      accounts: [{ ...first, sleeves: first.sleeves.slice(0, 2) }, ...rest],
    });
    expect(status).toBe(400);
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
    const sleeves = db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM account_sleeves').get();
    expect(sleeves?.n).toBe(6); // only 2317's two accounts remain
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

  it('refuses to delete a ticker a model still uses, and says which', async () => {
    const { status, body } = await call<{ error: string }>('DELETE', '/api/tickers/SGOV');
    expect(status).toBe(409);
    expect(body.error).toMatch(/Placeholder Now: Cash/);
  });
});

describe('models', () => {
  const draft = {
    name: 'Custom income',
    bucket: 'SOON',
    taxFunnel: null,
    lines: [
      { tickerSymbol: 'bnd', weightBps: 7500 },
      { tickerSymbol: 'TIP', weightBps: 2500 },
    ],
  };

  it('lists models grouped by bucket', async () => {
    const { body } = await call<ModelPortfolio[]>('GET', '/api/models');
    expect(body.map((m) => m.bucket)).toEqual(['NOW', 'SOON', 'LATER', 'LATER']);
    expect(body[0]?.lines).toEqual([
      { tickerSymbol: 'SGOV', weightBps: 6000 },
      { tickerSymbol: 'BIL', weightBps: 4000 },
    ]);
  });

  it('creates, edits, and deletes a model', async () => {
    const created = await call<ModelPortfolio>('POST', '/api/models', draft);
    expect(created.status).toBe(201);
    expect(created.body.lines[0]?.tickerSymbol).toBe('BND');

    const edited = await call<ModelPortfolio>('PUT', `/api/models/${created.body.id}`, {
      ...draft,
      name: 'Custom income v2',
      lines: [{ tickerSymbol: 'BND', weightBps: 10_000 }],
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ name: 'Custom income v2', lines: [{ tickerSymbol: 'BND', weightBps: 10_000 }] });

    expect((await call('DELETE', `/api/models/${created.body.id}`)).status).toBe(204);
    expect((await call('DELETE', `/api/models/${created.body.id}`)).status).toBe(404);
  });

  it('refuses weights that do not add up to 100%', async () => {
    const { status, body } = await call<{ issues: { message: string }[] }>('POST', '/api/models', {
      ...draft,
      lines: [{ tickerSymbol: 'BND', weightBps: 9_000 }],
    });
    expect(status).toBe(400);
    expect(body.issues.map((i) => i.message)).toContain('Weights must add up to exactly 100%');
  });

  it('refuses a ticker that is not in the universe', async () => {
    const { status, body } = await call<{ error: string }>('POST', '/api/models', {
      ...draft,
      lines: [{ tickerSymbol: 'NOPE', weightBps: 10_000 }],
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/NOPE/);
  });

  it('refuses a duplicate name', async () => {
    const { status } = await call('POST', '/api/models', { ...draft, name: 'placeholder now: cash' });
    expect(status).toBe(409);
  });

  it('refuses to move a model in use to another bucket', async () => {
    const { body: models } = await call<ModelPortfolio[]>('GET', '/api/models');
    const cash = models.find((m) => m.id === '9001');
    const { status } = await call('PUT', '/api/models/9001', { ...cash, bucket: 'SOON' });
    expect(status).toBe(409);
  });

  it('leaves money in place with no model when its model is deleted', async () => {
    await call('DELETE', '/api/models/9001');
    const { body } = await call<ClientCase>('GET', '/api/clients/1042');
    expect(body.accounts[0]?.sleeves[0]).toEqual({ bucket: 'NOW', amountCents: 190_000_00, modelId: null });
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
