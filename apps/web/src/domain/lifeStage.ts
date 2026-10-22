/** Age derivation and the display labels for each enum. */

import type {
  AccountType,
  AssetClass,
  BucketType,
  HealthConcern,
  LifeStage,
  MoneyCyclePhase,
  Person,
  TaxFunnel,
} from './types.js';
import { SSA_2022_REMAINING_YEARS } from './ssaLifeTable.js';

/** `today` is a parameter so tests can pin the year. */
export function ageFromBirthYear(birthYear: number | null, today: Date): number | null {
  if (birthYear === null) return null;
  const age = today.getFullYear() - birthYear;
  return age >= 0 && age < 130 ? age : null;
}

export function estimatedLifeExpectancyAge(person: Person, today: Date): number | null {
  const age = ageFromBirthYear(person.birthYear, today);
  if (age === null || person.gender === null) return null;
  if (person.healthConcerns.includes('OTHER') && person.otherHealthConcernAdjustmentYears === null) {
    return null;
  }

  const tableAge = Math.min(age, 119);
  const remainingYears = SSA_2022_REMAINING_YEARS[person.gender][tableAge];
  if (remainingYears === undefined) {
    throw new Error(`Missing SSA life-table value for ${person.gender} at age ${tableAge}`);
  }

  const standardConcernYears =
    person.healthConcerns.filter((concern) => concern !== 'OTHER').length * 3;
  const otherConcernYears = person.healthConcerns.includes('OTHER')
    ? (person.otherHealthConcernAdjustmentYears ?? 0)
    : 0;

  return Math.max(age, Math.round(age + remainingYears - standardConcernYears - otherConcernYears));
}

export function planYears(person: Person, today: Date): number | null {
  const age = ageFromBirthYear(person.birthYear, today);
  const lifeExpectancyAge = estimatedLifeExpectancyAge(person, today);
  if (age === null || lifeExpectancyAge === null) return null;
  return Math.max(0, lifeExpectancyAge - age);
}

/** The longer of the two horizons — the plan has to outlast both. */
export function householdPlanYears(people: readonly Person[], today: Date): number | null {
  const years = people.map((p) => planYears(p, today)).filter((y): y is number => y !== null);
  return years.length === 0 ? null : Math.max(...years);
}

export const LIFE_STAGE_LABELS: Record<LifeStage, string> = {
  ACCUMULATION_YOUNG_PROFESSIONAL: 'Early accumulator',
  ACCUMULATION_PEAK_EARNINGS: 'Peak earning years',
  PRESERVATION: 'Preservation',
  DISTRIBUTION_GO_GO: 'Go-go',
  DISTRIBUTION_SLOW_GO: 'Slow-go',
  DISTRIBUTION_NO_GO: 'No-go',
};

export const MONEY_CYCLE_LABELS: Record<MoneyCyclePhase, string> = {
  ACCUMULATION: 'Accumulation',
  PRESERVATION: 'Preservation',
  DISTRIBUTION: 'Distribution',
};

export const STAGES_BY_PHASE: Record<MoneyCyclePhase, readonly LifeStage[]> = {
  ACCUMULATION: ['ACCUMULATION_YOUNG_PROFESSIONAL', 'ACCUMULATION_PEAK_EARNINGS'],
  PRESERVATION: ['PRESERVATION'],
  DISTRIBUTION: ['DISTRIBUTION_GO_GO', 'DISTRIBUTION_SLOW_GO', 'DISTRIBUTION_NO_GO'],
};

export function stageForPhase(phase: MoneyCyclePhase, current: LifeStage): LifeStage {
  const allowed = STAGES_BY_PHASE[phase];
  return allowed.includes(current) ? current : (allowed[0] ?? current);
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  SINGLE: 'Single',
  JOINT: 'Joint',
  IRA: 'IRA',
  ROTH_IRA: 'Roth IRA',
  OTHER: 'Other',
};

export const HEALTH_CONCERN_LABELS: Record<HealthConcern, string> = {
  CANCER: 'Cancer',
  STROKE: 'Stroke',
  HEART: 'Heart',
  OTHER: 'Other',
};

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  CASH: 'Cash and equivalents',
  FIXED_INCOME: 'Fixed income',
  EQUITY: 'Equity',
  REAL_ASSET: 'Real assets',
  ALTERNATIVE: 'Alternatives',
};

export const BUCKET_LABELS: Record<BucketType, string> = {
  NOW: 'Now',
  SOON: 'Soon',
  LATER: 'Later',
};

export const TAX_FUNNEL_LABELS: Record<TaxFunnel, string> = {
  TAXABLE: 'Taxable',
  PRE_TAX: 'Pre-tax',
  TAX_FREE: 'Tax-free',
};
