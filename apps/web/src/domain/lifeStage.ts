/** Age derivation and the display labels for each enum. */

import type {
  AccountType,
  AllocationTarget,
  AssetClass,
  BucketType,
  HealthConcern,
  LifeStage,
  MoneyCyclePhase,
  Person,
} from './types.js';
import { LIFE_STAGES } from './types.js';

/** `today` is a parameter so tests can pin the year. */
export function ageFromBirthYear(birthYear: number | null, today: Date): number | null {
  if (birthYear === null) return null;
  const age = today.getFullYear() - birthYear;
  return age >= 0 && age < 130 ? age : null;
}

export function planYears(person: Person, today: Date): number | null {
  const age = ageFromBirthYear(person.birthYear, today);
  if (age === null || person.lifeExpectancyAge === null) return null;
  return Math.max(0, person.lifeExpectancyAge - age);
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

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  SINGLE: 'Single',
  JOINT: 'Joint',
  IRA: 'IRA',
  ROTH_IRA: 'Roth IRA',
  OTHER: 'Other',
};

export const HEALTH_CONCERN_LABELS: Record<HealthConcern, string> = {
  NONE: 'None reported',
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

/** Structure only. RIG has not supplied the percentages; US-10 is blocked. */
export const ALLOCATION_TARGETS_PENDING: readonly AllocationTarget[] = LIFE_STAGES.map(
  (lifeStage) => ({
    lifeStage,
    nowTargetPct: null,
    soonTargetPct: null,
    laterTargetPct: null,
  }),
);
