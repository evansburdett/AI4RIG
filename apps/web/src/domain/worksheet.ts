/**
 * Now / Soon / Later arithmetic, transcribed from RIG's "Bucket Plan
 * Deliverable" workbook, Inputs tab. Cell references in the comments are the
 * workbook's own.
 *
 * Provisional: this belongs in packages/engine behind POST /clients/{id}/plan
 * (US-09). It is kept pure so moving it is a file move.
 */

import { addCents, advisoryFeeCents, feeTierFor, type Cents } from '@ai4rig/engine';

import { multiplyCents, percentOf } from './money.js';
import type {
  AdvisoryFeeTier,
  AllocationTarget,
  BucketType,
  ClientCase,
  GapEntry,
  NowInputs,
  SoonInputs,
} from './types.js';

export interface WorksheetLine {
  readonly label: string;
  readonly amountCents: Cents;
  readonly cell: string;
  /** Set where the workbook contradicts itself and RIG needs to confirm. */
  readonly note?: string;
}

export interface BucketWorksheet {
  readonly bucket: BucketType;
  readonly lines: readonly WorksheetLine[];
  readonly totalCents: Cents;
}

/**
 * Where each account's fee rate is looked up (US-19): its own balance, or the
 * household's total across all accounts.
 *
 * Confirmed by Blake on Oct 22: the tier comes from the household's total
 * across all accounts. That one rate is charged on each account's balance,
 * and each account still holds its own fee cash in its Now bucket. 'ACCOUNT'
 * is kept for comparison and tests.
 */
/**
 * The inflation cushion on the Soon bucket's income gap: this much of each
 * year's gap, for every year the gap covers. RIG set 3% on Oct 26, in place of
 * the workbook's 7.5% of five years' gap (cell E28), so the cushion now grows
 * with the years of gap the advisor enters.
 */
export const INFLATION_HEDGE_RATE = 0.03;

export const FEE_TIER_BASIS: 'ACCOUNT' | 'HOUSEHOLD' = 'HOUSEHOLD';

/** One account's annual advisory fee, set aside as cash in its Now bucket. */
export interface AccountFee {
  readonly accountId: string;
  readonly balanceCents: Cents;
  /** 0 when the balance is not positive. */
  readonly rateBps: number;
  readonly feeCents: Cents;
}

export interface PlanTotals {
  readonly now: BucketWorksheet;
  readonly soon: BucketWorksheet;
  readonly later: BucketWorksheet;
  readonly investableAssetsCents: Cents;
  /** Per account, in account order. Their sum is the fee line in Now. */
  readonly advisoryFees: readonly AccountFee[];
  readonly advisoryFeeCents: Cents;
  /** Later goes negative when Now and Soon exceed the portfolio. Not clamped. */
  readonly isOverfunded: boolean;
}

function sumGapEntries(entries: readonly GapEntry[]): Cents {
  return addCents(
    ...entries.map((entry) =>
      multiplyCents(multiplyCents(entry.annualAmountCents, entry.years), entry.multiplier),
    ),
  );
}

/**
 * E16, plus a year of advisory fee cash (US-19). RIG's workbook leaves the fee
 * out of E16 because the tier table was not in it; on Sept 23 RIG asked for the
 * fee cash to be added to Now on top of income needs and planned expenses.
 */
export function computeNow(inputs: NowInputs, advisoryFeeCents: Cents): BucketWorksheet {
  const lines: WorksheetLine[] = [
    {
      label: `Income draw from investable assets (${inputs.incomeDrawMonths} months)`,
      amountCents: multiplyCents(inputs.monthlyIncomeDrawCents, inputs.incomeDrawMonths),
      cell: 'E6',
    },
    {
      label: 'Cash the client wants to see in the bank',
      amountCents: inputs.bankReserveCents,
      cell: 'E9',
    },
    {
      label: 'Large upcoming planned expenses',
      amountCents: addCents(...inputs.plannedExpenses.map((e) => e.costCents)),
      cell: 'E15',
    },
    {
      label: "Advisory fee cash, one year (held in each account's Now)",
      amountCents: advisoryFeeCents,
      cell: 'Fee',
    },
  ];

  return { bucket: 'NOW', lines, totalCents: addCents(...lines.map((l) => l.amountCents)) };
}

/** E52 */
export function computeSoon(inputs: SoonInputs): BucketWorksheet {
  const lines: WorksheetLine[] = [
    {
      label: `Income gap (${inputs.incomeGapYears} years)`,
      amountCents: multiplyCents(inputs.annualIncomeGapCents, inputs.incomeGapYears),
      cell: 'E23',
      note: 'Workbook labels this "5 yr income gap" but multiplies by 10. Confirm with RIG.',
    },
    {
      label: `Inflation hedge (${inputs.incomeGapYears} years of the gap x ${INFLATION_HEDGE_RATE * 100}%)`,
      amountCents: multiplyCents(
        multiplyCents(inputs.annualIncomeGapCents, inputs.incomeGapYears),
        INFLATION_HEDGE_RATE,
      ),
      cell: 'E28',
      note: 'Changed at RIG’s request on Oct 26: 3% of the gap for each year covered. The workbook uses 7.5% of five years’ gap.',
    },
    {
      label: 'Social Security bridge (delayed optimization)',
      amountCents: sumGapEntries(inputs.socialSecurityBridges),
      cell: 'E33',
    },
    {
      label: 'Additional healthcare gap',
      amountCents: sumGapEntries(inputs.healthcareGaps),
      cell: 'E38',
    },
    {
      label: 'Miscellaneous costs',
      amountCents: addCents(...inputs.miscellaneousCosts.map((c) => c.costCents)),
      cell: 'E43',
    },
    {
      label: 'Forced withdrawals from qualified accounts (10 years)',
      amountCents: sumGapEntries(inputs.forcedWithdrawals),
      cell: 'E48',
      note: 'Workbook applies the 1.15 gross-up to row 46 but not row 47. Confirm with RIG.',
    },
    {
      label: 'Money to hold conservatively',
      amountCents: inputs.conservativeReserveCents,
      cell: 'E51',
    },
  ];

  return { bucket: 'SOON', lines, totalCents: addCents(...lines.map((l) => l.amountCents)) };
}

/** E60 — the remainder after Now and Soon. */
export function computeLater(
  investableAssetsCents: Cents,
  nowTotalCents: Cents,
  soonTotalCents: Cents,
): BucketWorksheet {
  return {
    bucket: 'LATER',
    lines: [
      { label: 'Total investable assets', amountCents: investableAssetsCents, cell: 'E59' },
      { label: 'Less the Now bucket', amountCents: -nowTotalCents, cell: 'E16' },
      { label: 'Less the Soon bucket', amountCents: -soonTotalCents, cell: 'E52' },
    ],
    totalCents: addCents(investableAssetsCents, -nowTotalCents, -soonTotalCents),
  };
}

/** E59, and "Total Account Balances" on the profile sheet: the sum of the balances the advisor typed. */
export function investableAssets(clientCase: ClientCase): Cents {
  return addCents(...clientCase.accounts.map((account) => account.balanceCents));
}

/**
 * Each account's annual fee under RIG's schedule (US-19). The rate comes from
 * the account's own balance or the household total, per FEE_TIER_BASIS, and is
 * charged on the account's whole balance.
 */
export function accountAdvisoryFees(
  clientCase: ClientCase,
  tiers: readonly AdvisoryFeeTier[],
  basis: 'ACCOUNT' | 'HOUSEHOLD' = FEE_TIER_BASIS,
): AccountFee[] {
  const household = investableAssets(clientCase);
  return clientCase.accounts.map((account) => {
    const lookup = basis === 'ACCOUNT' ? account.balanceCents : household;
    const rateBps = account.balanceCents > 0 ? (feeTierFor(lookup, tiers)?.rateBps ?? 0) : 0;
    return {
      accountId: account.id,
      balanceCents: account.balanceCents,
      rateBps,
      feeCents: advisoryFeeCents(account.balanceCents, [{ minBalanceCents: 0, rateBps }]),
    };
  });
}

export function computePlanTotals(
  clientCase: ClientCase,
  feeTiers: readonly AdvisoryFeeTier[],
): PlanTotals {
  const advisoryFees = accountAdvisoryFees(clientCase, feeTiers);
  const advisoryFeeCentsTotal = addCents(...advisoryFees.map((f) => f.feeCents));
  const now = computeNow(clientCase.nowInputs, advisoryFeeCentsTotal);
  const soon = computeSoon(clientCase.soonInputs);
  const assets = investableAssets(clientCase);
  const later = computeLater(assets, now.totalCents, soon.totalCents);

  return {
    now,
    soon,
    later,
    investableAssetsCents: assets,
    advisoryFees,
    advisoryFeeCents: advisoryFeeCentsTotal,
    isOverfunded: later.totalCents < 0,
  };
}

/**
 * The target Now / Soon / Later split for this client, as percentages of
 * investable assets.
 *
 * This is the "bucket target percentages" RIG asked for. Their answer to how it
 * is derived was that it comes out of the worksheet inputs rather than a table
 * keyed by life stage, so this is a function of the client's own numbers.
 */
export function targetAllocation(clientCase: ClientCase, totals: PlanTotals): AllocationTarget {
  const denominator = totals.investableAssetsCents;

  return {
    lifeStage: clientCase.lifeStage,
    nowCents: totals.now.totalCents,
    soonCents: totals.soon.totalCents,
    laterCents: totals.later.totalCents,
    nowPct: percentOf(totals.now.totalCents, denominator),
    soonPct: percentOf(totals.soon.totalCents, denominator),
    laterPct: percentOf(totals.later.totalCents, denominator),
  };
}
