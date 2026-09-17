/**
 * The Now / Soon / Later arithmetic, transcribed from the sponsor's
 * "Bucket Plan Deliverable" workbook, Inputs tab.
 *
 * PROVISIONAL, AND ON PURPOSE. Calculation is not the front end's job — it
 * belongs in `packages/engine`, behind `POST /clients/{id}/plan`, and US-09
 * owns putting it there. This module exists so the intake screen can show the
 * advisor a live total while they type, which is the whole promise of US-01
 * ("output is generated automatically"). When the endpoint lands, the screen
 * reads the plan off the API and this file goes away.
 *
 * It is kept pure — inputs in, numbers out, no React and no fetch — so that
 * moving it is a file move rather than a rewrite, and so the cases below can be
 * checked against the workbook cell by cell.
 *
 * Cell references in the comments are the workbook's own, so that anyone
 * holding the spreadsheet open can follow along.
 */

import { addCents, type Cents } from '@ai4rig/engine';

import { multiplyCents } from './money.js';
import type { BucketType, ClientCase, GapEntry, NowInputs, SoonInputs } from './types.js';

/** One labelled row of a bucket's arithmetic, for the UI to show its work. */
export interface WorksheetLine {
  readonly label: string;
  readonly amountCents: Cents;
  /** The workbook cell this line came from, shown in the UI as provenance. */
  readonly cell: string;
  /** Set when the transcription needed a judgement call the sponsor should confirm. */
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
  /**
   * Later is what is left after Now and Soon are funded, so it goes negative
   * when the plan asks for more than the client has. That is a real finding the
   * advisor needs to see, not an error to clamp away.
   */
  readonly isOverfunded: boolean;
}

function sumGapEntries(entries: readonly GapEntry[]): Cents {
  return addCents(
    ...entries.map((entry) =>
      multiplyCents(multiplyCents(entry.annualAmountCents, entry.years), entry.multiplier),
    ),
  );
}

/** Now = twelve months of draw + the bank reserve + planned expenses. (E16) */
export function computeNow(inputs: NowInputs): BucketWorksheet {
  const incomeDraw = multiplyCents(inputs.monthlyIncomeDrawCents, inputs.incomeDrawMonths);
  const plannedExpenses = addCents(...inputs.plannedExpenses.map((e) => e.costCents));

  const lines: WorksheetLine[] = [
    {
      label: `Income draw from investable assets (${inputs.incomeDrawMonths} months)`,
      amountCents: incomeDraw,
      cell: 'E6',
    },
    { label: 'Cash the client wants to see in the bank', amountCents: inputs.bankReserveCents, cell: 'E9' },
    { label: 'Large upcoming planned expenses', amountCents: plannedExpenses, cell: 'E15' },
  ];

  return { bucket: 'NOW', lines, totalCents: addCents(...lines.map((l) => l.amountCents)) };
}

/** Soon = seven lines, each one a question the advisor asks in the meeting. (E52) */
export function computeSoon(inputs: SoonInputs): BucketWorksheet {
  const incomeGap = multiplyCents(inputs.annualIncomeGapCents, inputs.incomeGapYears);

  // E26 * E27: five years of the gap, then 7.5% of that.
  const inflationHedge = multiplyCents(multiplyCents(inputs.annualIncomeGapCents, 5), 0.075);

  const lines: WorksheetLine[] = [
    {
      label: `Income gap (${inputs.incomeGapYears} years)`,
      amountCents: incomeGap,
      cell: 'E23',
      note:
        'The workbook labels this row "5 yr income gap" but multiplies the annual gap by 10. ' +
        'We follow the arithmetic, not the label. Confirm with RIG which was intended.',
    },
    { label: 'Inflation hedge (5 years of the gap × 7.5%)', amountCents: inflationHedge, cell: 'E28' },
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
      note:
        'The workbook grosses row 46 up by 1.15 but leaves the same multiplier off row 47. ' +
        'We apply it to every row; confirm that is what RIG intends.',
    },
    {
      label: 'Money to hold conservatively',
      amountCents: inputs.conservativeReserveCents,
      cell: 'E51',
    },
  ];

  return { bucket: 'SOON', lines, totalCents: addCents(...lines.map((l) => l.amountCents)) };
}

/** Later is the remainder: everything Now and Soon did not claim. (E60) */
export function computeLater(
  investableAssetsCents: Cents,
  nowTotalCents: Cents,
  soonTotalCents: Cents,
): BucketWorksheet {
  const total = addCents(investableAssetsCents, -nowTotalCents, -soonTotalCents);

  return {
    bucket: 'LATER',
    lines: [
      { label: 'Total investable assets', amountCents: investableAssetsCents, cell: 'E59' },
      { label: 'Less the Now bucket', amountCents: -nowTotalCents, cell: 'E16' },
      { label: 'Less the Soon bucket', amountCents: -soonTotalCents, cell: 'E52' },
    ],
    totalCents: total,
  };
}

/** Everything a holding is worth, across every account on the case. */
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
