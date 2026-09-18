/** Blank entities for the add buttons. */

import type { Account, ClientCase, GapEntry, Holding, PlannedExpense } from './types.js';

let counter = 0;

/** Unique within one browser session. The database assigns real ids. */
function localId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export function newHolding(): Holding {
  return { id: localId('h'), tickerSymbol: '', marketValueCents: 0, assignedBucket: 'LATER' };
}

export function newAccount(): Account {
  return { id: localId('acct'), accountType: 'SINGLE', maskedNumber: '', holdings: [] };
}

export function newExpense(): PlannedExpense {
  return { id: localId('exp'), label: '', costCents: 0 };
}

export function newGapEntry(multiplier = 1): GapEntry {
  return { id: localId('gap'), label: '', annualAmountCents: 0, years: 0, multiplier };
}

export function newClientCase(clientNumber: string): ClientCase {
  return {
    clientNumber,
    initials: '',
    planNumber: 1,
    people: [
      { role: 'CLIENT', birthYear: null, healthConcern: 'NONE', lifeExpectancyAge: null },
      { role: 'SPOUSE', birthYear: null, healthConcern: 'NONE', lifeExpectancyAge: null },
    ],
    moneyCyclePhase: 'ACCUMULATION',
    lifeStage: 'ACCUMULATION_YOUNG_PROFESSIONAL',
    accounts: [newAccount()],
    cashOnHandCents: 0,
    spareTireCents: 0,
    nowInputs: {
      monthlyIncomeDrawCents: 0,
      incomeDrawMonths: 12,
      bankReserveCents: 0,
      plannedExpenses: [],
    },
    soonInputs: {
      annualIncomeGapCents: 0,
      incomeGapYears: 10,
      socialSecurityBridges: [],
      healthcareGaps: [],
      miscellaneousCosts: [],
      forcedWithdrawals: [],
      conservativeReserveCents: 0,
    },
    updatedAt: new Date().toISOString(),
  };
}
