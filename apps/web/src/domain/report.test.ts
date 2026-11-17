import { describe, expect, it } from 'vitest';

import { SAMPLE_CASES } from '../fixtures/clients.js';
import { PLACEHOLDER_TICKERS, RIG_FEE_TIERS } from '../fixtures/tickers.js';

import { feesByAccount } from './breakdown.js';
import { modelCsv, modelCsvName } from './modelCsv.js';
import { bucketLight, buildReport, defaultGuardrails, reportReadiness } from './report.js';
import { accountAdvisoryFees } from './worksheet.js';

const WORKBOOK_CASE = SAMPLE_CASES[0]!;
const fees = feesByAccount(accountAdvisoryFees(WORKBOOK_CASE, RIG_FEE_TIERS));
const today = new Date('2026-11-17T12:00:00Z');

describe('bucketLight', () => {
  it('is green near the target, yellow over, red short', () => {
    expect(bucketLight('NOW', 100_000_00, 100_000_00).light).toBe('GREEN');
    expect(bucketLight('NOW', 103_000_00, 100_000_00).light).toBe('GREEN');
    expect(bucketLight('SOON', 200_000_00, 100_000_00).light).toBe('YELLOW');
    expect(bucketLight('NOW', 50_000_00, 100_000_00)).toMatchObject({ light: 'RED', message: expect.stringMatching(/\$50,000 short/) });
  });

  it('turns Later red when Now and Soon hold more than they need (RIG, 11/2)', () => {
    expect(bucketLight('LATER', 1_000_000_00, 1_687_000_00)).toMatchObject({
      light: 'RED',
      message: expect.stringMatching(/\$687,000 less invested for growth/),
    });
    expect(bucketLight('LATER', 1_700_000_00, 1_687_000_00).light).toBe('GREEN');
  });
});

describe('buildReport', () => {
  it('puts the workbook case on target in every bucket, with RIG\'s wording', () => {
    const report = buildReport(WORKBOOK_CASE, PLACEHOLDER_TICKERS, RIG_FEE_TIERS, fees, defaultGuardrails(WORKBOOK_CASE), today);
    expect(report.totalCents).toBe(3_000_000_00);
    expect(report.buckets.map((b) => [b.subtitle, b.light])).toEqual([
      ['Safe & Liquid', 'GREEN'],
      ['Conservative & Income', 'GREEN'],
      ['Long-Term Growth & Legacy Planning', 'GREEN'],
    ]);
    expect(report.buckets[0]?.lines.map((l) => l.label)).toContain('Emergency fund');
    expect(report.accounts).toHaveLength(3);
  });

  it('works out the spending guardrails from a 5.3% budget', () => {
    const report = buildReport(WORKBOOK_CASE, PLACEHOLDER_TICKERS, RIG_FEE_TIERS, fees, defaultGuardrails(WORKBOOK_CASE), today);
    // 5.3% of $3,000,000, less a year of the $5,000 monthly draw.
    expect(report.guardrails.budgetCents).toBe(159_000_00);
    expect(report.guardrails.totalWithdrawalsCents).toBe(60_000_00);
    expect(report.guardrails.remainingCents).toBe(99_000_00);
  });
});

describe('reportReadiness', () => {
  it('waits for a saved, filled-in case', () => {
    expect(reportReadiness(WORKBOOK_CASE, PLACEHOLDER_TICKERS, fees, true).every((i) => i.ok)).toBe(true);
    const unsaved = reportReadiness(WORKBOOK_CASE, PLACEHOLDER_TICKERS, fees, false);
    expect(unsaved.find((i) => !i.ok)?.label).toMatch(/saved/);
    const accumulator = reportReadiness(SAMPLE_CASES[1]!, PLACEHOLDER_TICKERS, feesByAccount(accountAdvisoryFees(SAMPLE_CASES[1]!, RIG_FEE_TIERS)), true);
    expect(accumulator.find((i) => !i.ok)?.label).toMatch(/allocated/);
  });
});

describe('modelCsv', () => {
  it('lists symbols and weights for YCharts', () => {
    const model = { id: '1', name: 'Growth & Income / 60', taxFunnel: null, lines: [{ tickerSymbol: 'VTI', weightBps: 6_000 }, { tickerSymbol: 'BND', weightBps: 4_000 }] };
    expect(modelCsv(model)).toBe('Symbol,Weight\r\nVTI,60.00\r\nBND,40.00\r\n');
    expect(modelCsvName(model)).toBe('Growth-Income-60.csv');
  });
});
