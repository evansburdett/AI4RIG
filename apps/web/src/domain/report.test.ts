import { describe, expect, it } from 'vitest';

import { SAMPLE_CASES } from '../fixtures/clients.js';
import { PLACEHOLDER_TICKERS, RIG_FEE_TIERS } from '../fixtures/tickers.js';

import { feesByAccount } from './breakdown.js';
import { modelCsv, modelCsvName } from './modelCsv.js';
import { bucketLight, buildReport, defaultGuardrails, guardrailLevels, guardrailLight, reportReadiness } from './report.js';
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

describe('guardrailLight', () => {
  it('follows RIG\'s rule in D31: withdrawals over total assets, 3.5% and 7%', () => {
    const total = 1_000_000_00;
    expect(guardrailLight(35_000_00, total, 350, 700)).toBe('GREEN'); // 3.5% exactly is green
    expect(guardrailLight(35_001_00, total, 350, 700)).toBe('YELLOW');
    expect(guardrailLight(69_999_00, total, 350, 700)).toBe('YELLOW');
    expect(guardrailLight(70_000_00, total, 350, 700)).toBe('RED'); // 7% exactly is red
    expect(guardrailLight(0, 0, 350, 700)).toBeNull();
    // The limits come from Settings.
    expect(guardrailLight(45_000_00, total, 500, 800)).toBe('GREEN');
  });

  it('keeps RIG\'s wording, with the limits filled in', () => {
    const [green, yellow, red] = guardrailLevels(350, 700);
    expect(green?.heading).toBe('GREEN – 60 MPH in a 70 MPH Zone (3.5% or Less)');
    expect(yellow?.heading).toBe('YELLOW – 78 MPH in a 70 MPH Zone (Above 3.5% to Below 7%)');
    expect(red?.heading).toBe('RED – 95 MPH in a 70 MPH Zone (7% or More)');
    expect(green?.plan).toBe('Overfunded Plan');
    expect(red?.explanation).toMatch(/^You're driving well above the speed limit!/);
  });
});

describe('buildReport', () => {
  it('uses the Bucket Deliverable\'s wording, with how long each income line covers', () => {
    const report = buildReport(WORKBOOK_CASE, PLACEHOLDER_TICKERS, RIG_FEE_TIERS, fees, defaultGuardrails(WORKBOOK_CASE), today);
    expect(report.version).toBe(2);
    expect(report.totalCents).toBe(3_000_000_00);
    expect(report.buckets.map((b) => b.subtitle)).toEqual([
      'Safe & Liquid',
      'Conservative & Income',
      'Long Term Growth & Legacy Planning',
    ]);
    const months = WORKBOOK_CASE.nowInputs.incomeDrawMonths;
    const years = WORKBOOK_CASE.soonInputs.incomeGapYears;
    expect(report.buckets.map((b) => b.lines.map((l) => l.label))).toEqual([
      [`Income - ${months} Months`, 'Emergency Fund', 'Planned Expenses'],
      [`Income - First Phase (${years} Years)`, 'Inflation Hedge', 'Cash to Invest During Downturns', 'Funds Invested Conservatively'],
      ['Income - Second Phase', 'LTC / Disability', 'Inheritance'],
    ]);
    expect(report.accounts).toHaveLength(3);
  });

  it('works out the spending guardrails from a 5.3% budget', () => {
    const report = buildReport(WORKBOOK_CASE, PLACEHOLDER_TICKERS, RIG_FEE_TIERS, fees, defaultGuardrails(WORKBOOK_CASE), today);
    // 5.3% of $3,000,000, less a year of the $5,000 monthly draw.
    expect(report.guardrails.budgetCents).toBe(159_000_00);
    expect(report.guardrails.totalWithdrawalsCents).toBe(60_000_00);
    expect(report.guardrails.remainingCents).toBe(99_000_00);
    // RIG's seven lines in RIG's order, zero or not, and the limits the light used.
    expect(report.guardrails.withdrawals.map((w) => w.label)).toEqual([
      'Periodic Withdrawals',
      'DAF Disbursements',
      'QCDs/RMDs',
      'Insurance Premiums',
      'Gifts to Family',
      'Charitable Giving Contributions',
      'Additional Withdrawals',
    ]);
    expect(report.guardrails).toMatchObject({ greenMaxBps: 350, redMinBps: 700 });
  });
});

describe('reportReadiness', () => {
  it('waits for a saved, filled-in case', () => {
    expect(reportReadiness(WORKBOOK_CASE, PLACEHOLDER_TICKERS, fees, true).every((i) => i.ok)).toBe(true);
    const unsaved = reportReadiness(WORKBOOK_CASE, PLACEHOLDER_TICKERS, fees, false);
    expect(unsaved.find((i) => !i.ok)?.label).toMatch(/saved/);
    // Cash not in a fund yet is cash, not a job left undone (RIG, 11/17).
    const accumulator = SAMPLE_CASES[1]!;
    const accumulatorFees = feesByAccount(accountAdvisoryFees(accumulator, RIG_FEE_TIERS));
    expect(reportReadiness(accumulator, PLACEHOLDER_TICKERS, accumulatorFees, true).every((i) => i.ok)).toBe(true);
    const over = { ...accumulator, accounts: accumulator.accounts.map((a) => ({ ...a, balanceCents: 1_00 })) };
    expect(reportReadiness(over, PLACEHOLDER_TICKERS, accumulatorFees, true).find((i) => !i.ok)?.label).toMatch(/more than its balance/);
  });
});

describe('modelCsv', () => {
  it('lists symbols and weights for YCharts', () => {
    const model = { id: '1', name: 'Growth & Income / 60', taxFunnel: null, lines: [{ tickerSymbol: 'VTI', weightBps: 6_000 }, { tickerSymbol: 'BND', weightBps: 4_000 }] };
    expect(modelCsv(model)).toBe('Symbol,Weight\r\nVTI,60.00\r\nBND,40.00\r\n');
    expect(modelCsvName(model)).toBe('Growth-Income-60.csv');
  });
});
