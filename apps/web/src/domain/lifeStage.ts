/**
 * Age, life stage, and the labels the UI shows for each.
 *
 * The sponsor confirmed the six stages by email: early accumulator, peak
 * earning years, preservation, go-go, slow-go, no-go. What they have not given
 * us is the boundary between them, or the target percentages each one implies.
 * Both are deliberately absent here rather than guessed — see
 * `ALLOCATION_TARGETS_PENDING` at the bottom.
 */

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

/**
 * Age from year of birth.
 *
 * `today` is a parameter, not `new Date()` reached for inside the function, so
 * that a test can pin the year instead of breaking every January.
 */
export function ageFromBirthYear(birthYear: number | null, today: Date): number | null {
  if (birthYear === null) return null;
  const age = today.getFullYear() - birthYear;
  // Without a birth date we cannot know whether they have had this year's
  // birthday. The worksheet asks for the year alone and accepts the same
  // imprecision; being off by one for part of the year is the price of not
  // storing a date of birth.
  return age >= 0 && age < 130 ? age : null;
}

/** Years the plan has to cover: life expectancy minus current age. */
export function planYears(person: Person, today: Date): number | null {
  const age = ageFromBirthYear(person.birthYear, today);
  if (age === null || person.lifeExpectancyAge === null) return null;
  return Math.max(0, person.lifeExpectancyAge - age);
}

/** The longer of the two people's horizons — the plan has to outlast both. */
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

/**
 * The structure of US-10, with the values RIG has not supplied.
 *
 * Nulls, not zeroes and not placeholder percentages. A screen that showed
 * "Now 10% / Soon 30% / Later 60%" would look like a rule the firm had agreed
 * to, and nobody would go back and check. Nulls make the gap visible on every
 * screen that touches it, which is the point.
 *
 * The sponsor's email is explicit that this matters most in preservation and
 * distribution and matters least — but is still present — in accumulation.
 */
export const ALLOCATION_TARGETS_PENDING: readonly AllocationTarget[] = [
  'ACCUMULATION_YOUNG_PROFESSIONAL',
  'ACCUMULATION_PEAK_EARNINGS',
  'PRESERVATION',
  'DISTRIBUTION_GO_GO',
  'DISTRIBUTION_SLOW_GO',
  'DISTRIBUTION_NO_GO',
].map((lifeStage) => ({
  lifeStage: lifeStage as LifeStage,
  nowTargetPct: null,
  soonTargetPct: null,
  laterTargetPct: null,
}));
