/**
 * Blank entities for the add buttons. A new client case is created by the
 * server (POST /api/clients), which assigns its number.
 */

import { BUCKETS, DEFAULT_TAX_FUNNEL } from './types.js';
import type { Account, GapEntry, ModelPortfolio, PlannedExpense } from './types.js';

let counter = 0;

/** Unique within one browser session. The database assigns real ids. */
function localId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export function newAccount(): Account {
  return {
    id: localId('acct'),
    accountType: 'SINGLE',
    taxFunnel: DEFAULT_TAX_FUNNEL.SINGLE,
    maskedNumber: '',
    balanceCents: 0,
    sleeves: BUCKETS.map((bucket) => ({ bucket, amountCents: 0, modelId: null })),
  };
}

/** A model not yet saved. The server assigns the id; until then it is ''. */
export function newModel(): ModelPortfolio {
  return { id: '', name: '', bucket: 'LATER', taxFunnel: null, lines: [] };
}

export function newExpense(): PlannedExpense {
  return { id: localId('exp'), label: '', costCents: 0 };
}

export function newGapEntry(multiplier = 1): GapEntry {
  return { id: localId('gap'), label: '', annualAmountCents: 0, years: 0, multiplier };
}
