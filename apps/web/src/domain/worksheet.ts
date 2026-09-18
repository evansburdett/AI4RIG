/**
 * Now / Soon / Later arithmetic, transcribed from RIG's "Bucket Plan
 * Deliverable" workbook, Inputs tab. Cell references in the comments are the
 * workbook's own.
 *
 * Provisional: this belongs in packages/engine behind POST /clients/{id}/plan
 * (US-09). It is kept pure so moving it is a file move.
 */

import { addCents, type Cents } from '@ai4rig/engine';

import { multiplyCents } from './money.js';
import type { BucketType, ClientCase, GapEntry, NowInputs, SoonInputs } from './types.js';

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

export interface PlanTotals {
  readonly now: BucketWorksheet;
  readonly soon: BucketWorksheet;
  readonly later: BucketWorksheet;
  readonly investableAssetsCents: Cents;
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

/** E16 */
export function computeNow(inputs: NowInputs): BucketWorksheet {
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
      label: 'Inflation hedge (5 years of the gap x 7.5%)',
      amountCents: multiplyCents(multiplyCents(inputs.annualIncomeGapCents, 5), 0.075),
      cell: 'E28',
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

export function investableAssets(clientCase: ClientCase): Cents {
  return addCents(
    ...clientCase.accounts.flatMap((account) =>
      account.holdings.map((holding) => holding.marketValueCents),
    ),
  );
}

export function computePlanTotals(clientCase: ClientCase): PlanTotals {
  const now = computeNow(clientCase.nowInputs);
  const soon = computeSoon(clientCase.soonInputs);
  const assets = investableAssets(clientCase);
  const later = computeLater(assets, now.totalCents, soon.totalCents);

  return { now, soon, later, investableAssetsCents: assets, isOverfunded: later.totalCents < 0 };
}
