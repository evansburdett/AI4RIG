import { describe, expect, it } from 'vitest';

import { SAMPLE_CASES } from '../fixtures/clients.js';
import { PLACEHOLDER_MODELS, PLACEHOLDER_TICKERS } from '../fixtures/tickers.js';
import {
  lockedMatchesPlan,
  lockProposal,
  missingPrices,
  proposedPositions,
  unlockProposal,
  valueLockedShares,
} from './proposal.js';
import type { Ticker } from './types.js';

const WORKBOOK_CASE = SAMPLE_CASES[0]!;
const NOW = new Date('2026-10-21T15:00:00.000Z');

const withPrice = (symbol: string, priceCents: number | null): Ticker[] =>
  PLACEHOLDER_TICKERS.map((t) => (t.symbol === symbol ? { ...t, priceCents } : t));

describe('proposedPositions', () => {
  it('turns percent into dollars into whole shares, keeping the rest as cash', () => {
    // Joint Now: $205,000 in the cash model, SGOV 60% / BIL 40%.
    const now = proposedPositions(WORKBOOK_CASE.accounts[0]!, PLACEHOLDER_MODELS, PLACEHOLDER_TICKERS).filter(
      (p) => p.bucket === 'NOW',
    );
    expect(now).toEqual([
      { bucket: 'NOW', tickerSymbol: 'SGOV', amountCents: 123_000_00, priceCents: 100_00, shares: 1230, costCents: 123_000_00, cashCents: 0 },
      { bucket: 'NOW', tickerSymbol: 'BIL', amountCents: 82_000_00, priceCents: 91_50, shares: 896, costCents: 81_984_00, cashCents: 16_00 },
    ]);
  });

  it('leaves the share count blank for a ticker with no price', () => {
    const now = proposedPositions(WORKBOOK_CASE.accounts[0]!, PLACEHOLDER_MODELS, withPrice('BIL', null));
    expect(now.find((p) => p.tickerSymbol === 'BIL')).toMatchObject({ priceCents: null, shares: null });
  });
});

describe('lockProposal', () => {
  it('keeps whole shares and the price they were worked out at, and stamps the time', () => {
    const locked = lockProposal(WORKBOOK_CASE, PLACEHOLDER_MODELS, PLACEHOLDER_TICKERS, NOW);
    expect(locked.proposalLockedAt).toBe(NOW.toISOString());
    expect(locked.accounts[0]?.proposalShares.slice(0, 2)).toEqual([
      { bucket: 'NOW', tickerSymbol: 'SGOV', shares: 1230, priceCents: 100_00 },
      { bucket: 'NOW', tickerSymbol: 'BIL', shares: 896, priceCents: 91_50 },
    ]);
    // Typed balances are untouched: shares never derive them.
    expect(locked.accounts.map((a) => a.balanceCents)).toEqual(WORKBOOK_CASE.accounts.map((a) => a.balanceCents));
  });

  it('waits until every ticker in the plan has a price', () => {
    expect(missingPrices(WORKBOOK_CASE, PLACEHOLDER_MODELS, withPrice('VTI', null))).toEqual(['VTI']);
    expect(() => lockProposal(WORKBOOK_CASE, PLACEHOLDER_MODELS, withPrice('VTI', null), NOW)).toThrow(/VTI/);
  });

  it('can be undone', () => {
    const unlocked = unlockProposal(lockProposal(WORKBOOK_CASE, PLACEHOLDER_MODELS, PLACEHOLDER_TICKERS, NOW));
    expect(unlocked.proposalLockedAt).toBeNull();
    expect(unlocked.accounts.every((a) => a.proposalShares.length === 0)).toBe(true);
  });
});

describe('valueLockedShares', () => {
  it('values the same shares at today\'s price when the client comes back', () => {
    const locked = lockProposal(WORKBOOK_CASE, PLACEHOLDER_MODELS, PLACEHOLDER_TICKERS, NOW);
    const sgov = valueLockedShares(locked, withPrice('SGOV', 100_50)).find(
      (v) => v.accountId === '9001' && v.tickerSymbol === 'SGOV',
    );
    expect(sgov).toMatchObject({
      shares: 1230,
      lockedValueCents: 123_000_00,
      currentPriceCents: 100_50,
      currentValueCents: 123_615_00,
    });
  });

  it('has no current value for a ticker whose price was cleared', () => {
    const locked = lockProposal(WORKBOOK_CASE, PLACEHOLDER_MODELS, PLACEHOLDER_TICKERS, NOW);
    const sgov = valueLockedShares(locked, withPrice('SGOV', null)).find((v) => v.tickerSymbol === 'SGOV');
    expect(sgov).toMatchObject({ currentPriceCents: null, currentValueCents: null });
  });
});

describe('lockedMatchesPlan', () => {
  const locked = lockProposal(WORKBOOK_CASE, PLACEHOLDER_MODELS, PLACEHOLDER_TICKERS, NOW);

  it('holds right after locking, and after a price moves', () => {
    expect(lockedMatchesPlan(locked, PLACEHOLDER_MODELS, PLACEHOLDER_TICKERS)).toBe(true);
    expect(lockedMatchesPlan(locked, PLACEHOLDER_MODELS, withPrice('VTI', 310_00))).toBe(true);
  });

  it('breaks when the advisor changes a bucket amount', () => {
    const edited = {
      ...locked,
      accounts: locked.accounts.map((a, i) =>
        i === 0 ? { ...a, sleeves: a.sleeves.map((s) => (s.bucket === 'NOW' ? { ...s, amountCents: 300_000_00 } : s)) } : a,
      ),
    };
    expect(lockedMatchesPlan(edited, PLACEHOLDER_MODELS, PLACEHOLDER_TICKERS)).toBe(false);
  });

  it('is false for a proposal never locked', () => {
    expect(lockedMatchesPlan(WORKBOOK_CASE, PLACEHOLDER_MODELS, PLACEHOLDER_TICKERS)).toBe(false);
  });
});
