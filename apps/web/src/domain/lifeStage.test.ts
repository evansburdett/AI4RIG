import { describe, expect, it } from 'vitest';

import {
  ageFromBirthYear,
  STAGES_BY_PHASE,
  stageForPhase,
  estimatedLifeExpectancyAge,
  householdPlanYears,
  planYears,
} from './lifeStage.js';
import type { Gender, HealthConcern, Person } from './types.js';
import { LIFE_STAGES } from './types.js';

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

describe('stage of life follows the money cycle phase', () => {
  it('offers only the stages that belong to each phase', () => {
    expect(STAGES_BY_PHASE.ACCUMULATION).toEqual([
      'ACCUMULATION_YOUNG_PROFESSIONAL',
      'ACCUMULATION_PEAK_EARNINGS',
    ]);
    expect(STAGES_BY_PHASE.PRESERVATION).toEqual(['PRESERVATION']);
    expect(STAGES_BY_PHASE.DISTRIBUTION).toEqual([
      'DISTRIBUTION_GO_GO',
      'DISTRIBUTION_SLOW_GO',
      'DISTRIBUTION_NO_GO',
    ]);
  });

  it('puts every life stage under exactly one phase', () => {
    const all = Object.values(STAGES_BY_PHASE).flat();
    expect([...all].sort()).toEqual([...LIFE_STAGES].sort());
  });

  it('keeps a valid stage and resets an invalid one when the phase changes', () => {
    expect(stageForPhase('DISTRIBUTION', 'DISTRIBUTION_SLOW_GO')).toBe('DISTRIBUTION_SLOW_GO');
    expect(stageForPhase('ACCUMULATION', 'DISTRIBUTION_GO_GO')).toBe(
      'ACCUMULATION_YOUNG_PROFESSIONAL',
    );
    expect(stageForPhase('PRESERVATION', 'ACCUMULATION_PEAK_EARNINGS')).toBe('PRESERVATION');
  });
});