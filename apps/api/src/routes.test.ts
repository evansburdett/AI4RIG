import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase, runMigrations, runSeeds, type Db } from '@ai4rig/db';
import type { AdvisoryFeeTier, BucketDefinition, ClientCase, ClientSummary, ModelPortfolio, Ticker } from '@ai4rig/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { HttpError } from './errors.js';

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
    // Stands in for OpenAI: 84, or a 503 for anyone over 100, so both paths run.
    estimator: async (request) => {
      if (request.age > 100) throw new HttpError(503, 'not set up');
      return { lifeExpectancyAge: 84, explanation: `Estimated for ${request.age}.`, model: 'stub' };
    },
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
    // The Joint account's funds, picked by hand, in display order.
    expect(body.accounts[0]?.modelId).toBeNull();
    expect(body.accounts[0]?.lines.slice(0, 3)).toEqual([
      { tickerSymbol: 'SGOV', amountCents: 114_000_00 },
      { tickerSymbol: 'BIL', amountCents: 76_000_00 },
      { tickerSymbol: 'BND', amountCents: 200_000_00 },
    ]);
    expect(body.accounts[2]).toMatchObject({
      modelId: '9004',
      lines: [
        { tickerSymbol: 'VTI', amountCents: 178_200_00 },
        { tickerSymbol: 'VXUS', amountCents: 118_800_00 },
      ],
    });
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
    expect(body.accounts[0]).toMatchObject({ modelId: null, lines: [] });

    const list = await call<ClientSummary[]>('GET', '/api/clients');
    expect(list.body.map((c) => c.clientNumber)).toContain('2318');
  });

  it('saves an edited case and reads back exactly what was saved', async () => {
    const { body: original } = await call<ClientCase>('GET', '/api/clients/2317');

    const edited: ClientCase = {
      ...original,
      initials: 'C.D.E.',
      moneyCyclePhase: 'PRESERVATION',
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
          proposalShares: [],
          modelId: '9002',
          lines: [
            { tickerSymbol: 'TIP', amountCents: 12_345_67 },
            { tickerSymbol: 'BND', amountCents: 37_154_33 },
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
    // Funds come back in the order given, not alphabetically.
    expect(reread.accounts[2]).toMatchObject({
      modelId: '9002',
      lines: [
        { tickerSymbol: 'TIP', amountCents: 12_345_67 },
        { tickerSymbol: 'BND', amountCents: 37_154_33 },
      ],
    });
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
      .prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM account_lines WHERE account_id IN (9001, 9002, 9003)')
      .get();
    expect(orphans?.n).toBe(0);
  });

  it('refuses a model that does not exist', async () => {
    const { body: original } = await call<ClientCase>('GET', '/api/clients/1042');
    const { status, body } = await call<{ error: string }>('PUT', '/api/clients/1042', {
      ...original,
      accounts: original.accounts.map((a, i) => (i === 0 ? { ...a, modelId: '12345' } : a)),
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/model 12345 no longer exists/);
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
    const lines = db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM account_lines').get();
    expect(lines?.n).toBe(8); // only 2317's two accounts' funds remain
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
    expect(body[0]).toMatchObject({ symbol: 'BIL', assetClass: 'CASH', defaultBucket: 'NOW' });
  });

  it('stamps a changed price with the day, and keeps it when only the bucket changes', async () => {
    const priced = await call<Ticker>('PUT', '/api/tickers/SCHD', {
      symbol: 'SCHD',
      assetClass: 'EQUITY',
      defaultBucket: 'LATER',
      priceCents: 27_50,
    });
    expect(priced.body).toMatchObject({ priceCents: 27_50, priceAsOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });

    // A caller that leaves the price out (US-24's add-a-symbol, a bucket
    // change) must not wipe it.
    const moved = await call<Ticker>('PUT', '/api/tickers/SCHD', {
      symbol: 'SCHD',
      assetClass: 'EQUITY',
      defaultBucket: 'SOON',
    });
    expect(moved.body).toMatchObject({ defaultBucket: 'SOON', priceCents: 27_50, priceAsOf: priced.body.priceAsOf });

    const cleared = await call<Ticker>('PUT', '/api/tickers/SCHD', { ...moved.body, priceCents: null });
    expect(cleared.body).toMatchObject({ priceCents: null, priceAsOf: null });
  });

  it('refuses a price of zero', async () => {
    const { status } = await call('PUT', '/api/tickers/SCHD', {
      symbol: 'SCHD',
      assetClass: 'EQUITY',
      defaultBucket: 'LATER',
      priceCents: 0,
    });
    expect(status).toBe(400);
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
    expect(body.error).toMatch(/Placeholder Cash reserve/);
  });

  it('refuses to delete a ticker a client case holds, and says which', async () => {
    await call('PUT', '/api/tickers/SCHD', { symbol: 'SCHD', assetClass: 'EQUITY', defaultBucket: 'LATER' });
    const { body: original } = await call<ClientCase>('GET', '/api/clients/2317');
    const edited = {
      ...original,
      accounts: original.accounts.map((a, i) =>
        i === 0
          ? { ...a, lines: [...a.lines, { tickerSymbol: 'SCHD', amountCents: 15_000_00 }] }
          : a,
      ),
    };
    expect((await call('PUT', '/api/clients/2317', edited)).status).toBe(200);

    const { status, body } = await call<{ error: string }>('DELETE', '/api/tickers/SCHD');
    expect(status).toBe(409);
    expect(body.error).toMatch(/client case 2317/);
  });
});

describe('models', () => {
  const draft = {
    name: 'Custom income',
    taxFunnel: null,
    lines: [
      { tickerSymbol: 'bnd', weightBps: 7500 },
      { tickerSymbol: 'TIP', weightBps: 2500 },
    ],
  };

  it('lists models by name', async () => {
    const { body } = await call<ModelPortfolio[]>('GET', '/api/models');
    expect(body.map((m) => m.id)).toEqual(['9003', '9001', '9002', '9004']);
    expect(body[1]).not.toHaveProperty('bucket');
    expect(body[1]?.lines).toEqual([
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
    const { status } = await call('POST', '/api/models', { ...draft, name: 'placeholder cash reserve' });
    expect(status).toBe(409);
  });

  it('leaves the funds in place with no model when their model is deleted', async () => {
    const { body: before } = await call<ClientCase>('GET', '/api/clients/1042');
    expect((await call('DELETE', '/api/models/9004')).status).toBe(204);
    const { body } = await call<ClientCase>('GET', '/api/clients/1042');
    expect(body.accounts[2]).toMatchObject({ modelId: null, lines: before.accounts[2]?.lines });
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

describe('advisory fee tiers (US-19)', () => {
  it('ships RIG\'s schedule, lowest balance first', async () => {
    const { body } = await call<AdvisoryFeeTier[]>('GET', '/api/advisory-fee-tiers');
    expect(body.map((t) => [t.minBalanceCents, t.rateBps])).toEqual([
      [0, 195],
      [250_000_00, 175],
      [500_000_00, 150],
      [1_000_000_00, 125],
      [2_500_000_00, 100],
      [5_000_000_00, 85],
    ]);
  });

  it('replaces the whole schedule', async () => {
    const tiers = [
      { minBalanceCents: 0, rateBps: 150 },
      { minBalanceCents: 1_000_000_00, rateBps: 100 },
    ];
    const saved = await call<AdvisoryFeeTier[]>('PUT', '/api/advisory-fee-tiers', tiers);
    expect(saved.status).toBe(200);
    expect((await call<AdvisoryFeeTier[]>('GET', '/api/advisory-fee-tiers')).body).toEqual(tiers);
  });

  it('refuses a schedule that does not start at $0, or is out of order', async () => {
    expect(
      (await call('PUT', '/api/advisory-fee-tiers', [{ minBalanceCents: 100, rateBps: 100 }])).status,
    ).toBe(400);
    expect(
      (
        await call('PUT', '/api/advisory-fee-tiers', [
          { minBalanceCents: 0, rateBps: 100 },
          { minBalanceCents: 500_00, rateBps: 90 },
          { minBalanceCents: 200_00, rateBps: 80 },
        ])
      ).status,
    ).toBe(400);
    expect((await call('PUT', '/api/advisory-fee-tiers', [])).status).toBe(400);
  });
});

describe('stage of life follows money cycle phase (US-25)', () => {
  it('refuses a stage from another phase, and says which field', async () => {
    const { body: original } = await call<ClientCase>('GET', '/api/clients/1042');
    const { status, body } = await call<{ issues: { path: string }[] }>('PUT', '/api/clients/1042', {
      ...original,
      moneyCyclePhase: 'DISTRIBUTION',
      lifeStage: 'ACCUMULATION_PEAK_EARNINGS',
    });
    expect(status).toBe(400);
    expect(body.issues.map((i) => i.path)).toContain('lifeStage');
  });
});

describe('gender (US-26)', () => {
  it('reads back and saves each person\'s gender', async () => {
    const { body: original } = await call<ClientCase>('GET', '/api/clients/1042');
    expect(original.people.map((p) => p.gender)).toEqual(['MALE', 'FEMALE']);

    const { status, body } = await call<ClientCase>('PUT', '/api/clients/1042', {
      ...original,
      people: original.people.map((p) => (p.role === 'SPOUSE' ? { ...p, gender: null } : p)),
    });
    expect(status).toBe(200);
    expect(body.people.map((p) => p.gender)).toEqual(['MALE', null]);
  });

  it('refuses a value that is not on the list', async () => {
    const { body: original } = await call<ClientCase>('GET', '/api/clients/1042');
    const { status } = await call('PUT', '/api/clients/1042', {
      ...original,
      people: original.people.map((p) => ({ ...p, gender: 'X' })),
    });
    expect(status).toBe(400);
  });
});

describe('locked proposal shares (US-21)', () => {
  const lockedAt = '2026-10-21T15:00:00.000Z';

  async function lockJoint(shares: { bucket: string; tickerSymbol: string; shares: number; priceCents: number }[]) {
    const { body: original } = await call<ClientCase>('GET', '/api/clients/1042');
    return call<ClientCase>('PUT', '/api/clients/1042', {
      ...original,
      proposalLockedAt: lockedAt,
      accounts: original.accounts.map((a, i) => (i === 0 ? { ...a, proposalShares: shares } : a)),
    });
  }

  it('saves and reads back whole share counts with the price they were locked at', async () => {
    const { status, body } = await lockJoint([
      { bucket: 'NOW', tickerSymbol: 'SGOV', shares: 1230, priceCents: 100_00 },
      { bucket: 'LATER', tickerSymbol: 'VTI', shares: 1983, priceCents: 300_00 },
    ]);
    expect(status).toBe(200);
    expect(body.proposalLockedAt).toBe(lockedAt);
    expect(body.accounts[0]?.proposalShares).toEqual([
      { bucket: 'NOW', tickerSymbol: 'SGOV', shares: 1230, priceCents: 100_00 },
      { bucket: 'LATER', tickerSymbol: 'VTI', shares: 1983, priceCents: 300_00 },
    ]);
    // Typed balances are untouched by locking: shares never derive the balance.
    expect(body.accounts[0]?.balanceCents).toBe(1_200_000_00);
  });

  it('refuses a fraction of a share, and shares with no lock time', async () => {
    expect((await lockJoint([{ bucket: 'NOW', tickerSymbol: 'SGOV', shares: 1.5, priceCents: 100_00 }])).status).toBe(400);

    const { body: original } = await call<ClientCase>('GET', '/api/clients/1042');
    const { status } = await call('PUT', '/api/clients/1042', {
      ...original,
      proposalLockedAt: null,
      accounts: original.accounts.map((a, i) =>
        i === 0 ? { ...a, proposalShares: [{ bucket: 'NOW', tickerSymbol: 'SGOV', shares: 1, priceCents: 100_00 }] } : a,
      ),
    });
    expect(status).toBe(400);
  });

  it('refuses to delete a ticker with locked shares, and says which case', async () => {
    await call('PUT', '/api/tickers/SCHD', { symbol: 'SCHD', assetClass: 'EQUITY', defaultBucket: 'LATER' });
    expect((await lockJoint([{ bucket: 'LATER', tickerSymbol: 'SCHD', shares: 10, priceCents: 27_50 }])).status).toBe(200);

    const { status, body } = await call<{ error: string }>('DELETE', '/api/tickers/SCHD');
    expect(status).toBe(409);
    expect(body.error).toMatch(/locked in for client case 1042/);
  });
});

describe('life expectancy (US-28)', () => {
  it('passes age, gender, and concerns to the estimator and returns its answer', async () => {
    const { status, body } = await call('POST', '/api/life-expectancy/estimate', {
      age: 63,
      gender: 'FEMALE',
      healthConcerns: ['HEART'],
      healthConcernOther: '',
    });
    expect(status).toBe(200);
    expect(body).toEqual({ lifeExpectancyAge: 84, explanation: 'Estimated for 63.', model: 'stub' });
  });

  it('refuses a request without a gender', async () => {
    const { status } = await call('POST', '/api/life-expectancy/estimate', {
      age: 63,
      healthConcerns: [],
      healthConcernOther: '',
    });
    expect(status).toBe(400);
  });

  it('passes the estimator\'s own failure through', async () => {
    const { status, body } = await call<{ error: string }>('POST', '/api/life-expectancy/estimate', {
      age: 101,
      gender: 'MALE',
      healthConcerns: [],
      healthConcernOther: '',
    });
    expect(status).toBe(503);
    expect(body.error).toBe('not set up');
  });

  it('saves where the age came from, and refuses a source with no age', async () => {
    const { body: original } = await call<ClientCase>('GET', '/api/clients/1042');
    expect(original.people.map((p) => p.lifeExpectancySource)).toEqual(['ADVISOR', 'AI']);

    const cleared = await call('PUT', '/api/clients/1042', {
      ...original,
      people: original.people.map((p) => ({ ...p, lifeExpectancyAge: null })),
    });
    expect(cleared.status).toBe(400);

    const { status, body } = await call<ClientCase>('PUT', '/api/clients/1042', {
      ...original,
      people: original.people.map((p) => ({ ...p, lifeExpectancyAge: null, lifeExpectancySource: null })),
    });
    expect(status).toBe(200);
    expect(body.people.map((p) => p.lifeExpectancyAge)).toEqual([null, null]);
  });
});

describe('health concerns (US-27)', () => {
  it('reads back every concern a person has', async () => {
    const { body } = await call<ClientCase>('GET', '/api/clients/1042');

    expect(body.people[0]).toMatchObject({ healthConcerns: [], healthConcernOther: '' });
    expect(body.people[1]).toMatchObject({
      healthConcerns: ['HEART', 'OTHER'],
      healthConcernOther: 'Managed hypertension',
    });
  });

  it('orders them the same however they arrive', async () => {
    const { body: original } = await call<ClientCase>('GET', '/api/clients/2317');
    const edited = {
      ...original,
      people: original.people.map((p) => ({
        ...p,
        // Deliberately not in HEALTH_CONCERNS order.
        healthConcerns: ['OTHER', 'CANCER', 'STROKE'],
        healthConcernOther: 'Family history',
      })),
    };

    const saved = await call<ClientCase>('PUT', '/api/clients/2317', edited);
    expect(saved.status).toBe(200);
    expect(saved.body.people[0]?.healthConcerns).toEqual(['CANCER', 'STROKE', 'OTHER']);

    const { body: reread } = await call<ClientCase>('GET', '/api/clients/2317');
    expect(reread.people[0]?.healthConcerns).toEqual(['CANCER', 'STROKE', 'OTHER']);
    expect(reread.people[0]?.healthConcernOther).toBe('Family history');
  });

  it('treats an empty list as nothing reported, leaving no rows behind', async () => {
    const { body: original } = await call<ClientCase>('GET', '/api/clients/1042');
    const cleared = {
      ...original,
      people: original.people.map((p) => ({ ...p, healthConcerns: [], healthConcernOther: '' })),
    };

    const { status, body } = await call<ClientCase>('PUT', '/api/clients/1042', cleared);
    expect(status).toBe(200);
    expect(body.people.every((p) => p.healthConcerns.length === 0)).toBe(true);

    const left = db
      .prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM person_health_concerns')
      .get();
    expect(left?.n).toBe(0);
  });

  it('refuses a description when Other is not selected', async () => {
    const { body: original } = await call<ClientCase>('GET', '/api/clients/2317');
    const { status, body } = await call<{ issues: { path: string; message: string }[] }>(
      'PUT',
      '/api/clients/2317',
      {
        ...original,
        people: original.people.map((p) => ({
          ...p,
          healthConcerns: ['HEART'],
          healthConcernOther: 'Something',
        })),
      },
    );

    expect(status).toBe(400);
    expect(body.issues.some((i) => i.path.endsWith('healthConcernOther'))).toBe(true);
  });

  it('refuses the same concern twice', async () => {
    const { body: original } = await call<ClientCase>('GET', '/api/clients/2317');
    const { status } = await call('PUT', '/api/clients/2317', {
      ...original,
      people: original.people.map((p) => ({ ...p, healthConcerns: ['HEART', 'HEART'] })),
    });

    expect(status).toBe(400);
  });
});

describe('funds in an account (10/26)', () => {
  /** Case 2317's Single account: Balanced 60/40 on all but $15,000. */
  async function accumulator() {
    const { body } = await call<ClientCase>('GET', '/api/clients/2317');
    return body;
  }

  const withLines = (c: ClientCase, lines: { tickerSymbol: string; amountCents: number }[]) => ({
    ...c,
    accounts: c.accounts.map((a, i) => (i === 0 ? { ...a, lines } : a)),
  });

  it('reads back the model an account was filled from, and its funds', async () => {
    const body = await accumulator();
    expect(body.accounts[0]?.modelId).toBe('9003');
    expect(body.accounts[0]?.lines.reduce((t, l) => t + l.amountCents, 0)).toBe(260_800_00);
  });

  it('saves funds that do not add up to the balance yet, and a fund with nothing in it', async () => {
    const original = await accumulator();
    const lines = [
      { tickerSymbol: 'VOO', amountCents: 25_000_00 },
      { tickerSymbol: 'VTI', amountCents: 0 },
    ];
    const saved = await call<ClientCase>('PUT', '/api/clients/2317', withLines(original, lines));
    expect(saved.status).toBe(200);

    const { body: reread } = await call<ClientCase>('GET', '/api/clients/2317');
    expect(reread.accounts[0]?.lines).toEqual(lines);
  });

  it('refuses a negative amount, and a fund twice', async () => {
    const original = await accumulator();
    const negative = await call('PUT', '/api/clients/2317', withLines(original, [{ tickerSymbol: 'VTI', amountCents: -1 }]));
    expect(negative.status).toBe(400);

    const twice = await call<{ issues: { message: string }[] }>(
      'PUT',
      '/api/clients/2317',
      withLines(original, [
        { tickerSymbol: 'VTI', amountCents: 1_00 },
        { tickerSymbol: 'vti', amountCents: 2_00 },
      ]),
    );
    expect(twice.status).toBe(400);
    expect(twice.body.issues.map((i) => i.message)).toContain('A fund can appear in an account only once');
  });

  it('names the symbol when it is not in the ticker list', async () => {
    const original = await accumulator();
    const { status, body } = await call<{ error: string }>(
      'PUT',
      '/api/clients/2317',
      withLines(original, [{ tickerSymbol: 'NOTREAL', amountCents: 1_00 }]),
    );
    expect(status).toBe(400);
    expect(body.error).toMatch(/NOTREAL is not in the ticker list/);
  });

  it('replaces the funds rather than adding to them', async () => {
    const original = await accumulator();
    await call('PUT', '/api/clients/2317', withLines(original, [{ tickerSymbol: 'VTI', amountCents: 1_00 }]));
    const rows = db
      .prepare<[], { n: number }>(
        `SELECT COUNT(*) AS n FROM account_lines l
         JOIN accounts a ON a.id = l.account_id
         JOIN client_cases c ON c.id = a.client_case_id
         WHERE c.client_number = '2317'`,
      )
      .get();
    expect(rows?.n).toBe(3); // the one fund, plus the Roth's two
  });
});
