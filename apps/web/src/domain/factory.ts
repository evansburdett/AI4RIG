/**
 * Blank entities for the add buttons. A new client case is created by the
 * server (POST /api/clients), which assigns its number.
 */

import type { Account, GapEntry, Holding, PlannedExpense } from './types.js';

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
