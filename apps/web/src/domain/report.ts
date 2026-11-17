/**
 * The client-facing bucket report (RIG, 11/2), modeled on RIG's "Bucket
 * Deliverable": three buckets with RIG's wording, what each holds against
 * what the plan needs, and the spending guardrails underneath. Each bucket gets
 * a stoplight and one plain sentence saying what it means.
 *
 * A report is generated from a saved case and then kept as numbers, so last
 * quarter's still reads as it did when it was handed over.
 */

import { addCents, type Cents } from '@ai4rig/engine';

import { accountCash, bucketsByAccount, exactPriceMicros, tickersBySymbol, type FeesByAccount } from './breakdown.js';
import { ACCOUNT_TYPE_LABELS, LIFE_STAGE_LABELS, householdPlanYears } from './lifeStage.js';
import type {
  AdvisoryFeeTier,
  BucketType,
  ClientCase,
  Light,
  ReportBucket,
  ReportSnapshot,
  ReportWithdrawal,
  Ticker,
} from './types.js';
import { computePlanTotals, targetAllocation } from './worksheet.js';

/** Within this share of the target, a bucket is on target. */
const ON_TARGET_BPS = 500;

/** RIG's yearly spending budget from investments, as a share of total assets. */
export const DEFAULT_BUDGET_BPS = 530;

const BUCKET_WORDS: Record<BucketType, { title: string; subtitle: string }> = {
  NOW: { title: 'Now Bucket', subtitle: 'Safe & Liquid' },
  SOON: { title: 'Soon Bucket', subtitle: 'Conservative & Income' },
  LATER: { title: 'Later Bucket', subtitle: 'Long-Term Growth & Legacy Planning' },
};

function dollars(cents: Cents): string {
  return `$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;
}

/** The stoplight and its sentence for one bucket. */
export function bucketLight(bucket: BucketType, actualCents: Cents, targetCents: Cents): { light: Light; message: string } {
  const variance = actualCents - targetCents;
  const tolerance = Math.max(Math.round((Math.abs(targetCents) * ON_TARGET_BPS) / 10_000), 100);

  if (bucket === 'LATER') {
    // Later is the rest of the money. Less than the plan leaves room for means
    // Now and Soon hold more than they need: too conservative to keep up with
    // inflation over the plan (RIG, 11/2).
    if (variance < -tolerance) {
      return {
        light: 'RED',
        message: `${dollars(variance)} less invested for growth than the plan leaves room for. Now and Soon hold more than they need.`,
      };
    }
    return { light: 'GREEN', message: 'Invested for long-term growth and legacy goals.' };
  }

  const what = bucket === 'NOW' ? "the next year's needs" : 'the income years ahead';
  if (variance > tolerance) {
    return { light: 'YELLOW', message: `${dollars(variance)} more than ${what} call for. That money could be invested for growth.` };
  }
  if (variance < -tolerance) {
    return {
      light: 'RED',
      message: `${dollars(variance)} short of ${what}. ${bucket === 'NOW' ? 'Raise cash.' : 'Add to bond or income funds.'}`,
    };
  }
  return { light: 'GREEN', message: `On target for ${what}.` };
}

export interface ReadinessItem {
  readonly label: string;
  readonly ok: boolean;
}

/**
 * What has to be true before a report can be generated: the case is saved
 * (so the report matches what is stored), the accounts are filled in and
 * priced, and each person has the ages the plan years come from.
 */
export function reportReadiness(
  clientCase: ClientCase,
  tickerList: readonly Ticker[],
  fees: FeesByAccount,
  saved: boolean,
): ReadinessItem[] {
  const tickers = tickersBySymbol(tickerList);
  const accounts = clientCase.accounts;
  const withBalance = accounts.filter((a) => a.balanceCents > 0);
  return [
    { label: 'All changes are saved', ok: saved },
    { label: 'At least one account has a balance', ok: withBalance.length > 0 },
    {
      // Within 1% of the account: leftovers from rounding shares are not a job left undone.
      label: 'Every account is allocated',
      ok:
        withBalance.length > 0 &&
        withBalance.every((a) => Math.abs(accountCash(a, tickers, fees.get(a.id) ?? 0).leftCents) * 100 <= a.balanceCents),
    },
    {
      label: 'Every fund has a price',
      ok: accounts.every((a) => a.lines.every((l) => exactPriceMicros(tickers.get(l.tickerSymbol)) !== null)),
    },
    {
      label: 'Each person has a year of birth and a life expectancy',
      ok: clientCase.people.every((p) => p.birthYear !== null && p.lifeExpectancyAge !== null),
    },
  ];
}

export interface GuardrailInputs {
  readonly budgetBps: number;
  readonly withdrawals: readonly ReportWithdrawal[];
}

/**
 * Withdrawals as RIG's deliverable lists them. The two the plan already knows
 * start from the plan (a year of the income draw, and the forced withdrawals);
 * the rest are typed on the report page.
 */
export function defaultGuardrails(clientCase: ClientCase): GuardrailInputs {
  const forced = addCents(...clientCase.soonInputs.forcedWithdrawals.map((w) => Math.round(w.annualAmountCents)));
  return {
    budgetBps: DEFAULT_BUDGET_BPS,
    withdrawals: [
      { label: 'Periodic withdrawals', amountCents: clientCase.nowInputs.monthlyIncomeDrawCents * 12 },
      { label: 'QCDs / RMDs', amountCents: forced },
      { label: 'DAF disbursements', amountCents: 0 },
      { label: 'Insurance premiums', amountCents: 0 },
      { label: 'Gifts to family', amountCents: 0 },
      { label: 'Charitable giving', amountCents: 0 },
      { label: 'Additional withdrawals', amountCents: 0 },
    ],
  };
}

const SOON_LABELS = [
  'Income (first phase)',
  'Inflation hedge',
  'Social Security bridge',
  'Healthcare',
  'Other planned costs',
  'Required withdrawals',
  'Funds invested conservatively',
];

/** The report's numbers, worked out from the case as it is now. */
export function buildReport(
  clientCase: ClientCase,
  tickers: readonly Ticker[],
  feeTiers: readonly AdvisoryFeeTier[],
  fees: FeesByAccount,
  guardrails: GuardrailInputs,
  today: Date,
): ReportSnapshot {
  const totals = computePlanTotals(clientCase, feeTiers);
  const target = targetAllocation(clientCase, totals);
  const perAccount = bucketsByAccount(clientCase, tickers, fees);
  const actual = (bucket: BucketType) =>
    addCents(...perAccount.map((a) => (bucket === 'NOW' ? a.nowCents : bucket === 'SOON' ? a.soonCents : a.laterCents)));
  const targets: Record<BucketType, Cents> = { NOW: target.nowCents, SOON: target.soonCents, LATER: target.laterCents };

  const [income, bank, planned, fee] = totals.now.lines;
  const lines: Record<BucketType, ReportBucket['lines']> = {
    NOW: [
      { label: `Income (${clientCase.nowInputs.incomeDrawMonths} months)`, amountCents: income?.amountCents ?? 0 },
      { label: 'Emergency fund', amountCents: bank?.amountCents ?? 0 },
      { label: 'Planned expenses', amountCents: planned?.amountCents ?? 0 },
      { label: 'Advisory fees, one year', amountCents: fee?.amountCents ?? 0 },
    ].filter((line) => line.amountCents !== 0),
    SOON: totals.soon.lines
      .map((line, i) => ({ label: SOON_LABELS[i] ?? line.label, amountCents: line.amountCents }))
      .filter((line) => line.amountCents !== 0),
    LATER: [
      { label: 'Income (second phase)', amountCents: null },
      { label: 'Long-term care / disability', amountCents: null },
      { label: 'Inheritance', amountCents: null },
    ],
  };

  const buckets = (['NOW', 'SOON', 'LATER'] as const).map((bucket): ReportBucket => {
    const actualCents = actual(bucket);
    return {
      bucket,
      ...BUCKET_WORDS[bucket],
      actualCents,
      targetCents: targets[bucket],
      varianceCents: actualCents - targets[bucket],
      ...bucketLight(bucket, actualCents, targets[bucket]),
      lines: lines[bucket],
    };
  });

  const totalCents = totals.investableAssetsCents;
  const budgetCents = Math.round((totalCents * guardrails.budgetBps) / 10_000);
  const totalWithdrawalsCents = addCents(...guardrails.withdrawals.map((w) => w.amountCents));

  return {
    version: 1,
    clientNumber: clientCase.clientNumber,
    initials: clientCase.initials,
    lifeStageLabel: LIFE_STAGE_LABELS[clientCase.lifeStage],
    planYears: householdPlanYears(clientCase.people, today),
    totalCents,
    buckets,
    accounts: perAccount.map((a) => ({
      label: `${ACCOUNT_TYPE_LABELS[a.accountType]}${a.maskedNumber === '' ? '' : ` ····${a.maskedNumber}`}`,
      nowCents: a.nowCents,
      soonCents: a.soonCents,
      laterCents: a.laterCents,
      balanceCents: a.balanceCents,
    })),
    guardrails: {
      budgetBps: guardrails.budgetBps,
      budgetCents,
      withdrawals: guardrails.withdrawals.filter((w) => w.amountCents !== 0),
      totalWithdrawalsCents,
      remainingCents: budgetCents - totalWithdrawalsCents,
    },
  };
}
