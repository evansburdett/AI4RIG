import { describe, expect, it } from 'vitest';

import {
  ageFromBirthYear,
  estimatedLifeExpectancyAge,
  householdPlanYears,
  planYears,
} from './lifeStage.js';
import type { Gender, HealthConcern, Person } from './types.js';

const TODAY = new Date('2026-09-17T00:00:00Z');

function person(
  birthYear: number | null,
  gender: Gender | null = 'MALE',
  healthConcerns: readonly HealthConcern[] = [],
  otherHealthConcernAdjustmentYears: number | null = null,
): Person {
  return {
    role: 'CLIENT',
    birthYear,
    gender,
    healthConcerns,
    healthConcernOther: '',
    otherHealthConcernAdjustmentYears,
  };
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
  it('uses the SSA remaining life expectancy for age and gender', () => {
    expect(estimatedLifeExpectancyAge(person(1961, 'MALE'), TODAY)).toBe(82);
    expect(estimatedLifeExpectancyAge(person(1961, 'FEMALE'), TODAY)).toBe(85);
    expect(planYears(person(1961, 'MALE'), TODAY)).toBe(17);
  });

  it('subtracts three years for each standard concern and the custom Other adjustment', () => {
    expect(
      estimatedLifeExpectancyAge(person(1961, 'MALE', ['CANCER', 'HEART']), TODAY),
    ).toBe(76);
    expect(
      estimatedLifeExpectancyAge(person(1961, 'MALE', ['HEART', 'OTHER'], 2.5), TODAY),
    ).toBe(77);
  });

  it('does not estimate without age, gender, or the Other adjustment', () => {
    expect(estimatedLifeExpectancyAge(person(null), TODAY)).toBeNull();
    expect(estimatedLifeExpectancyAge(person(1960, null), TODAY)).toBeNull();
    expect(estimatedLifeExpectancyAge(person(1960, 'MALE', ['OTHER']), TODAY)).toBeNull();
  });

  it('never estimates an age earlier than the current age', () => {
    expect(estimatedLifeExpectancyAge(person(1930, 'MALE', ['CANCER', 'STROKE', 'HEART']), TODAY))
      .toBe(96);
  });
});

describe('householdPlanYears', () => {
  it('takes the longer horizon, because the plan outlasts both', () => {
    expect(householdPlanYears([person(1960, 'MALE'), person(1964, 'FEMALE')], TODAY)).toBe(23);
  });

  it('ignores a person who is not filled in yet', () => {
    expect(householdPlanYears([person(1960, 'MALE'), person(null)], TODAY)).toBe(17);
  });
});
