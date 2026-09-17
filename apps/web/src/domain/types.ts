/**
 * The shapes the front end works in.
 *
 * These mirror the MVP conceptual model in the Architectural Spike Report
 * (Section 6.5) and docs/uml/src/04_domain_mvp.puml. They live here, and not in
 * a shared package, because the API contract does not exist yet — when the API
 * lands, the intent is to lift this file into a package both sides import so
 * there is one definition instead of two that drift.
 *
 * Two conventions this file will not bend on:
 *
 *   1. Money is `Cents`, a whole number. Never a dollars-valued number, never a
 *      float. See docs/decisions/0004-money-as-integer-cents.md.
 *   2. Nothing here is personally identifying. No name, address, email, phone,
 *      SSN, or real account number — not even an optional one. A field that
 *      cannot exist cannot be filled in by mistake.
 *      See docs/decisions/0006-no-pii-anywhere.md.
 */

import type { Cents } from '@ai4rig/engine';

export type { Cents };

/** Now spends this year, Soon preserves, Later grows. */
export const BUCKETS = ['NOW', 'SOON', 'LATER'] as const;
export type BucketType = (typeof BUCKETS)[number];

/**
 * The six values behind RIG's "Stage of Life" field, confirmed by the sponsor:
 * early accumulator, peak earning years, preservation, go-go, slow-go, no-go.
 *
 * Life stage drives bucket weighting (US-10). The target percentages for each
 * stage are the project's one known gap — RIG has not written them down, so
 * `AllocationTarget` below carries the structure with the values left null.
 */
export const LIFE_STAGES = [
  'ACCUMULATION_YOUNG_PROFESSIONAL',
  'ACCUMULATION_PEAK_EARNINGS',
  'PRESERVATION',
  'DISTRIBUTION_GO_GO',
  'DISTRIBUTION_SLOW_GO',
  'DISTRIBUTION_NO_GO',
] as const;
export type LifeStage = (typeof LIFE_STAGES)[number];

/**
 * The sponsor's profile worksheet calls this "Money Cycle Phase" and offers
 * three options. It is coarser than life stage and is entered directly rather
 * than derived, because the worksheet treats it as an advisor's judgement call.
 */
export const MONEY_CYCLE_PHASES = ['ACCUMULATION', 'PRESERVATION', 'DISTRIBUTION'] as const;
export type MoneyCyclePhase = (typeof MONEY_CYCLE_PHASES)[number];

/** The account rows on the sponsor's profile worksheet, in the order they appear. */
export const ACCOUNT_TYPES = ['SINGLE', 'JOINT', 'IRA', 'ROTH_IRA', 'OTHER'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/**
 * Health category, which the worksheet feeds into a life-expectancy estimate.
 *
 * A category code, not a diagnosis and not an identifier — "HEART" attached to
 * client 1042 identifies nobody. Kept coarse on purpose for that reason.
 */
export const HEALTH_CONCERNS = ['NONE', 'CANCER', 'STROKE', 'HEART', 'OTHER'] as const;
export type HealthConcern = (typeof HEALTH_CONCERNS)[number];

export const ASSET_CLASSES = [
  'CASH',
  'FIXED_INCOME',
  'EQUITY',
  'REAL_ASSET',
  'ALTERNATIVE',
] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

/**
 * One person on the case. There are at most two — the worksheet has a Client
 * column and a Spouse column.
 *
 * `birthYear`, not a birth date. Age drives bucket weighting so we need it, but
 * a full date of birth is a direct identifier and CONTRIBUTING.md tells a
 * reviewer to reject one. The sponsor's own worksheet asks for the year alone,
 * so the narrower field is also the more faithful one.
 */
export interface Person {
  readonly role: 'CLIENT' | 'SPOUSE';
  readonly birthYear: number | null;
  readonly healthConcern: HealthConcern;
  /**
   * Set by the advisor. The worksheet notes this as "to be calculated by AI
   * based on current age and health" — that estimator does not exist, so the
   * field is a manual entry with the derivation left for later.
   */
  readonly lifeExpectancyAge: number | null;
}

/** One position inside an account. */
export interface Holding {
  readonly id: string;
  readonly tickerSymbol: string;
  readonly marketValueCents: Cents;
  /**
   * What the advisor actually chose. Starts as the ticker's `defaultBucket` and
   * diverges only when the advisor overrides it — which is the whole point of
   * keeping the two fields apart (decision D1). `isOverride` is derived, not
   * stored: it is true when this differs from the ticker's default.
   */
  readonly assignedBucket: BucketType;
}

export interface Account {
  readonly id: string;
  readonly accountType: AccountType;
  /** Last four only, the way RIG already masks account numbers in its workbook. */
  readonly maskedNumber: string;
  readonly holdings: readonly Holding[];
}

/** An entry in RIG's approved investment universe (US-06). */
export interface Ticker {
  readonly symbol: string;
  readonly assetClass: AssetClass;
  /** What the engine proposes for a new holding. Editable by an administrator (US-08). */
  readonly defaultBucket: BucketType;
}

/** The editable description of a bucket. Administrators may reword these (US-08). */
export interface BucketDefinition {
  readonly bucket: BucketType;
  readonly label: string;
  readonly horizonMonths: number;
  readonly purposeText: string;
}

/**
 * Target bucket percentages per life stage.
 *
 * BLOCKED: RIG has not supplied the numbers. The structure is here so that
 * filling them in later is data entry rather than a redesign, and the UI shows
 * the gap rather than inventing percentages that would look authoritative and
 * be wrong. Nulls are the honest representation of "not yet known".
 */
export interface AllocationTarget {
  readonly lifeStage: LifeStage;
  readonly nowTargetPct: number | null;
  readonly soonTargetPct: number | null;
  readonly laterTargetPct: number | null;
}

/**
 * The inputs behind the Now bucket, straight off the sponsor's worksheet:
 * twelve months of income draw, the cash they want sitting in the bank, and any
 * large planned expenses.
 */
export interface NowInputs {
  readonly monthlyIncomeDrawCents: Cents;
  readonly incomeDrawMonths: number;
  readonly bankReserveCents: Cents;
  readonly plannedExpenses: readonly PlannedExpense[];
}

export interface PlannedExpense {
  readonly id: string;
  readonly label: string;
  readonly costCents: Cents;
}

/**
 * The inputs behind the Soon bucket. Seven lines, each one a question the
 * advisor asks in the meeting, summed at the bottom.
 */
export interface SoonInputs {
  readonly annualIncomeGapCents: Cents;
  /**
   * The worksheet labels this row "5 yr income gap" but multiplies the annual
   * gap by 10, not 5. We follow the sponsor's arithmetic rather than the
   * sponsor's label — penny parity with the workbook is how this project is
   * judged — and flag the mismatch for them to confirm.
   */
  readonly incomeGapYears: number;
  readonly socialSecurityBridges: readonly GapEntry[];
  readonly healthcareGaps: readonly GapEntry[];
  readonly miscellaneousCosts: readonly PlannedExpense[];
  readonly forcedWithdrawals: readonly GapEntry[];
  readonly conservativeReserveCents: Cents;
}

/** An annual amount held for a number of years — the shape of several Soon rows. */
export interface GapEntry {
  readonly id: string;
  readonly label: string;
  readonly annualAmountCents: Cents;
  readonly years: number;
  /** The worksheet grosses forced withdrawals up by 1.15 for tax. 1 elsewhere. */
  readonly multiplier: number;
}

/**
 * A de-identified case record. Everything an advisor enters for one household.
 */
export interface ClientCase {
  readonly clientNumber: string;
  /** Display label only. Initials collide, so they are never a key. */
  readonly initials: string;
  readonly planNumber: number;
  readonly people: readonly Person[];
  readonly moneyCyclePhase: MoneyCyclePhase;
  readonly lifeStage: LifeStage;
  readonly accounts: readonly Account[];
  readonly cashOnHandCents: Cents;
  /** The worksheet's "Extra Spare Tire" — a manually entered cushion. */
  readonly spareTireCents: Cents;
  readonly nowInputs: NowInputs;
  readonly soonInputs: SoonInputs;
  readonly updatedAt: string;
}

/** What the switcher needs, without loading every holding (US-03). */
export interface ClientSummary {
  readonly clientNumber: string;
  readonly initials: string;
  readonly lifeStage: LifeStage;
  readonly updatedAt: string;
}
