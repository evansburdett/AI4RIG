import { describe, expect, it } from 'vitest';

import { ALLOCATION_TARGETS_PENDING, ageFromBirthYear, householdPlanYears, planYears } from './lifeStage.js';
import type { Person } from './types.js';

const TODAY = new Date('2026-09-17T00:00:00Z');

function person(birthYear: number | null, lifeExpectancyAge: number | null): Person {
  return { role: 'CLIENT', birthYear, healthConcern: 'NONE', lifeExpectancyAge };
}

describe('ageFromBirthYear', () => {
  it('derives age from the year alone', () => {
    expect(ageFromBirthYear(1960, TODAY)).toBe(66);
  });

  it('is null when the year is missing or impossible', () => {
    expect(ageFromBirthYear(null, TODAY)).toBeNull();
    expect(ageFromBirthYear(2040, TODAY)).toBeNull();
    expect(ageFromBirthYear(1800, TODAY)).toBeNull();
  });
});

describe('planYears', () => {
  it('is life expectancy minus current age', () => {
    expect(planYears(person(1960, 88), TODAY)).toBe(22);
  });

  it('never goes negative', () => {
    expect(planYears(person(1930, 88), TODAY)).toBe(0);
  });

  it('is null until both halves are entered', () => {
    expect(planYears(person(1960, null), TODAY)).toBeNull();
    expect(planYears(person(null, 88), TODAY)).toBeNull();
  });
});

describe('householdPlanYears', () => {
  it('takes the longer horizon, because the plan outlasts both', () => {
    expect(householdPlanYears([person(1960, 88), person(1964, 92)], TODAY)).toBe(30);
  });

  it('ignores a person who is not filled in yet', () => {
    expect(householdPlanYears([person(1960, 88), person(null, null)], TODAY)).toBe(22);
  });
});

describe('ALLOCATION_TARGETS_PENDING', () => {
  it('carries all six stages with no invented percentages', () => {
    expect(ALLOCATION_TARGETS_PENDING).toHaveLength(6);
    for (const target of ALLOCATION_TARGETS_PENDING) {
      expect(target.nowTargetPct).toBeNull();
      expect(target.soonTargetPct).toBeNull();
      expect(target.laterTargetPct).toBeNull();
    }
  });
});
