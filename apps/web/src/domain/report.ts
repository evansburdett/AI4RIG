/**
 * The client-facing bucket report (RIG, 11/2), matching RIG's "Bucket
 * Deliverable" sheet word for word: the three buckets with what each is for,
 * then the spending guardrails, whose amount remaining is lit green, yellow or
 * red by RIG's rule (cell D31, 11/17).
 *
 * A report is generated from a saved case and then kept as numbers, so last
 * quarter's still reads as it did when it was handed over.
 */

import { addCents, type Cents } from '@ai4rig/engine';

import { actualCashCents, bucketsByAccount, exactPriceMicros, tickersBySymbol, type FeesByAccount } from './breakdown.js';
import { ACCOUNT_TYPE_LABELS, LIFE_STAGE_LABELS, householdPlanYears } from './lifeStage.js';
import type {
  AdvisoryFeeTier,
  AlertThresholds,
  BucketType,
  ClientCase,
  Light,
  ReportBucket,
  ReportSnapshot,
  ReportWithdrawal,
  Ticker,
} from './types.js';
import { DEFAULT_THRESHOLDS } from './types.js';
import { computePlanTotals } from './worksheet.js';

/** RIG's yearly spending budget from investments, as a share of total assets. */
export const DEFAULT_BUDGET_BPS = 530;

const BUCKET_WORDS: Record<BucketType, { title: string; subtitle: string }> = {
  NOW: { title: 'Now Bucket', subtitle: 'Safe & Liquid' },
  SOON: { title: 'Soon Bucket', subtitle: 'Conservative & Income' },
  LATER: { title: 'Later Bucket', subtitle: 'Long Term Growth & Legacy Planning' },
};

/**
 * What each bucket is for, as the Bucket Deliverable lists it. RIG asked on
 * 11/17 for the income lines to say how long they cover.
 */
function bucketPurposes(clientCase: ClientCase): Record<BucketType, readonly string[]> {
  const months = clientCase.nowInputs.incomeDrawMonths;
  const years = clientCase.soonInputs.incomeGapYears;
  return {
    NOW: [`Income - ${months} ${months === 1 ? 'Month' : 'Months'}`, 'Emergency Fund', 'Planned Expenses'],
    SOON: [
      years > 0 ? `Income - First Phase (${years} ${years === 1 ? 'Year' : 'Years'})` : 'Income - First Phase',
      'Inflation Hedge',
      'Cash to Invest During Downturns',
      'Funds Invested Conservatively',
    ],
    LATER: ['Income - Second Phase', 'LTC / Disability', 'Inheritance'],
  };
}

export interface GuardrailLevel {
  readonly light: Light;
  readonly icon: string;
  /** RIG's heading, with the limits filled in. */
  readonly heading: string;
  readonly plan: string;
  readonly explanation: string;
}

export function percentText(bps: number): string {
  return `${(bps / 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

/** RIG's three levels and their wording (Bucket Deliverable, G22 to H29). */
export function guardrailLevels(greenMaxBps: number, redMinBps: number): readonly GuardrailLevel[] {
  return [
    {
      light: 'GREEN',
      icon: '✅',
      heading: `GREEN – 60 MPH in a 70 MPH Zone (${percentText(greenMaxBps)} or Less)`,
      plan: 'Overfunded Plan',
      explanation:
        "You're cruising comfortably below the speed limit! Your spending is well within your guardrails, giving you room to enjoy more without jeopardizing your financial plan.",
    },
    {
      light: 'YELLOW',
      icon: '⚠️',
      heading: `YELLOW – 78 MPH in a 70 MPH Zone (Above ${percentText(greenMaxBps)} to Below ${percentText(redMinBps)})`,
      plan: 'Constrained Plan',
      explanation:
        "You're moving a little faster than the speed limit. You're still on track, but proceed with caution! Large, unexpected withdrawals could push your plan into the danger zone.",
    },
    {
      light: 'RED',
      icon: '🛑',
      heading: `RED – 95 MPH in a 70 MPH Zone (${percentText(redMinBps)} or More)`,
      plan: 'Underfunded Plan',
      explanation:
        "You're driving well above the speed limit! Continuing at this spending pace significantly increases the risk of a financial setback. Slowing down and adjusting spending may be necessary to get back on track.",
    },
  ];
}

/**
 * RIG's rule for the amount remaining (D31's conditional formatting): the
 * year's total withdrawals over total assets. It does not follow the 5.3%
 * budget, so money can be left in the budget while the light is yellow.
 * Null when there are no assets to measure against.
 */
export function guardrailLight(
  totalWithdrawalsCents: Cents,
  totalCents: Cents,
  greenMaxBps: number,
  redMinBps: number,
): Light | null {
  if (totalCents <= 0) return null;
  // Compared without dividing, so 3.5% exactly is green as it is in Excel.
  const scaled = totalWithdrawalsCents * 10_000;
  if (scaled <= greenMaxBps * totalCents) return 'GREEN';
  if (scaled >= redMinBps * totalCents) return 'RED';
  return 'YELLOW';
}

/** Within this share of the target, a bucket is on target. */
const ON_TARGET_BPS = 500;

function dollars(cents: Cents): string {
  return `$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;
}

/** The profile's stoplight and its sentence for one bucket. The report no longer shows these (RIG, 11/17). */
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
      // Cash not in a fund is cash, in Now (RIG, 11/17), so only funds over the balance stop a report.
      label: "No account's funds add up to more than its balance",
      ok: accounts.every((a) => actualCashCents(a) >= 0),
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
    // RIG's lines and order (Bucket Deliverable, C24 to C30).
    withdrawals: [
      { label: 'Periodic Withdrawals', amountCents: clientCase.nowInputs.monthlyIncomeDrawCents * 12 },
      { label: 'DAF Disbursements', amountCents: 0 },
      { label: 'QCDs/RMDs', amountCents: forced },
      { label: 'Insurance Premiums', amountCents: 0 },
      { label: 'Gifts to Family', amountCents: 0 },
      { label: 'Charitable Giving Contributions', amountCents: 0 },
      { label: 'Additional Withdrawals', amountCents: 0 },
    ],
  };
}

/** The report's numbers, worked out from the case as it is now. */
export function buildReport(
  clientCase: ClientCase,
  tickers: readonly Ticker[],
  feeTiers: readonly AdvisoryFeeTier[],
  fees: FeesByAccount,
  guardrails: GuardrailInputs,
  today: Date,
  thresholds: Pick<AlertThresholds, 'guardrailGreenMaxBps' | 'guardrailRedMinBps'> = DEFAULT_THRESHOLDS,
): ReportSnapshot {
  const totals = computePlanTotals(clientCase, feeTiers);
  const perAccount = bucketsByAccount(clientCase, tickers);
  const actual = (bucket: BucketType) =>
    addCents(...perAccount.map((a) => (bucket === 'NOW' ? a.nowCents : bucket === 'SOON' ? a.soonCents : a.laterCents)));
  const purposes = bucketPurposes(clientCase);

  const buckets = (['NOW', 'SOON', 'LATER'] as const).map(
    (bucket): ReportBucket => ({
      bucket,
      ...BUCKET_WORDS[bucket],
      actualCents: actual(bucket),
      lines: purposes[bucket].map((label) => ({ label, amountCents: null })),
    }),
  );

  const totalCents = totals.investableAssetsCents;
  const budgetCents = Math.round((totalCents * guardrails.budgetBps) / 10_000);
  const totalWithdrawalsCents = addCents(...guardrails.withdrawals.map((w) => w.amountCents));

  return {
    version: 2,
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
      // Every line, as RIG's sheet shows them, zero or not.
      withdrawals: guardrails.withdrawals,
      totalWithdrawalsCents,
      remainingCents: budgetCents - totalWithdrawalsCents,
      greenMaxBps: thresholds.guardrailGreenMaxBps,
      redMinBps: thresholds.guardrailRedMinBps,
    },
  };
}
