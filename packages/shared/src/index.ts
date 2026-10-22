/**
 * The API contract. The web app renders these shapes and the API validates and
 * returns them, so a change here is a change to both sides: typecheck will tell
 * you everywhere that needs updating. They mirror the MVP conceptual model in
 * docs/uml/src/04_domain_mvp.puml.
 *
 * Row ids (`Account.id`, `Holding.id`, ...) are strings. The database assigns
 * them when a case is saved; a row added in the browser carries a temporary
 * local id until then. Saving a case replaces its rows, so ids can change on
 * every save. Nothing should hold on to one across a save.
 *
 * Money is always `Cents`, a whole number. No field here can hold PII.
 * See docs/decisions/0004-money-as-integer-cents.md and 0006-no-pii-anywhere.md.
 */

import type { Cents } from '@ai4rig/engine';

export type { Cents };

export const BUCKETS = ['NOW', 'SOON', 'LATER'] as const;
export type BucketType = (typeof BUCKETS)[number];

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
 * US-26. Picks the baseline the life expectancy estimate starts from. Two
 * options because that is what RIG's profile sheet and the period life tables
 * the estimate leans on both use.
 */
export const GENDERS = ['MALE', 'FEMALE'] as const;
export type Gender = (typeof GENDERS)[number];

/**
 * Where a person's life expectancy age came from (US-28): an AI estimate the
 * advisor accepted, or a figure the advisor typed or changed.
 */
export const LIFE_EXPECTANCY_SOURCES = ['AI', 'ADVISOR'] as const;
export type LifeExpectancySource = (typeof LIFE_EXPECTANCY_SOURCES)[number];

export const MONEY_CYCLE_PHASES = ['ACCUMULATION', 'PRESERVATION', 'DISTRIBUTION'] as const;
export type MoneyCyclePhase = (typeof MONEY_CYCLE_PHASES)[number];

/**
 * US-25: the stages of life that belong to each money cycle phase (Blake,
 * Sept 23: pick Distribution and only go-go, slow-go, and no-go show).
 */
export const LIFE_STAGES_BY_PHASE: Readonly<Record<MoneyCyclePhase, readonly LifeStage[]>> = {
  ACCUMULATION: ['ACCUMULATION_YOUNG_PROFESSIONAL', 'ACCUMULATION_PEAK_EARNINGS'],
  PRESERVATION: ['PRESERVATION'],
  DISTRIBUTION: ['DISTRIBUTION_GO_GO', 'DISTRIBUTION_SLOW_GO', 'DISTRIBUTION_NO_GO'],
};

export const ACCOUNT_TYPES = ['SINGLE', 'JOINT', 'IRA', 'ROTH_IRA', 'OTHER'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/**
 * The three tax treatments RIG sorts money into ("tax funnels"): after-tax
 * money in a taxable account, pre-tax money (IRA, 401k), and tax-free (Roth).
 */
export const TAX_FUNNELS = ['TAXABLE', 'PRE_TAX', 'TAX_FREE'] as const;
export type TaxFunnel = (typeof TAX_FUNNELS)[number];

/** What a new account of each type starts as. "Other" is a guess the advisor should check. */
export const DEFAULT_TAX_FUNNEL: Record<AccountType, TaxFunnel> = {
  SINGLE: 'TAXABLE',
  JOINT: 'TAXABLE',
  IRA: 'PRE_TAX',
  ROTH_IRA: 'TAX_FREE',
  OTHER: 'TAXABLE',
};

/** Federal marginal brackets, as whole percents. Pending RIG's version of the profile sheet. */
export const TAX_BRACKETS = [10, 12, 22, 24, 32, 35, 37] as const;

/**
 * The concerns an advisor can tick for one person (US-27). A person carries any
 * combination of them, so there is no 'NONE' — an empty list is how "nothing
 * reported" is written down.
 */
export const HEALTH_CONCERNS = ['CANCER', 'STROKE', 'HEART', 'OTHER'] as const;
export type HealthConcern = (typeof HEALTH_CONCERNS)[number];

export const ASSET_CLASSES = [
  'CASH',
  'FIXED_INCOME',
  'EQUITY',
  'REAL_ASSET',
  'ALTERNATIVE',
] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export interface Person {
  readonly role: 'CLIENT' | 'SPOUSE';
  /** Year only. Age is all the planning needs; a full date of birth is PII. */
  readonly birthYear: number | null;
  /** Null until the advisor picks one. */
  readonly gender: Gender | null;
  /** Any combination, kept in HEALTH_CONCERNS order. Empty means nothing reported. */
  readonly healthConcerns: readonly HealthConcern[];
  /**
   * What OTHER means for this person, so US-28 can pass it to the life
   * expectancy estimate. Empty unless OTHER is selected. A description of a
   * condition and nothing else — never anything identifying (ADR 0006).
   */
  readonly healthConcernOther: string;
  /** The age the plan has to last to. Null until estimated or typed. */
  readonly lifeExpectancyAge: number | null;
  /** Null exactly when lifeExpectancyAge is. */
  readonly lifeExpectancySource: LifeExpectancySource | null;
}

/**
 * Everything the life expectancy estimate is given (US-28). Age rather than
 * birth year, and nothing that identifies the person: no case number, no
 * initials (ADR 0006).
 */
export interface LifeExpectancyRequest {
  readonly age: number;
  readonly gender: Gender;
  readonly healthConcerns: readonly HealthConcern[];
  /** The OTHER description, or ''. */
  readonly healthConcernOther: string;
}

export interface LifeExpectancyEstimate {
  readonly lifeExpectancyAge: number;
  /** One or two sentences from the model on how it got there. */
  readonly explanation: string;
  /** The model that answered, for the record. */
  readonly model: string;
}

/**
 * How a bucket's money is invested (US-23). Blake, Sept 23: "a dropdown where
 * you basically either click model or manual."
 */
export const SLEEVE_MODES = ['MODEL', 'MANUAL'] as const;
export type SleeveMode = (typeof SLEEVE_MODES)[number];

/** One ticker in a manual bucket. Basis points, the same unit a model uses. */
export interface SleeveLine {
  readonly tickerSymbol: string;
  readonly weightBps: number;
}

/**
 * The part of one account's balance that sits in one bucket, and what that
 * money follows. The advisor types the amount (RIG: "for now, it is entered
 * manually for each account") and then either picks a model or lists symbols.
 */
export interface BucketSleeve {
  readonly bucket: BucketType;
  readonly amountCents: Cents;
  /** MODEL follows `modelId`. MANUAL follows `lines`. */
  readonly mode: SleeveMode;
  /** A ModelPortfolio id, or null when none is chosen. Always null under MANUAL. */
  readonly modelId: string | null;
  /**
   * The advisor's own symbols and weights. Used under MANUAL, empty under
   * MODEL. Unlike a model these need not add up to 100%, so a half-finished
   * case can still be saved; positions appear once they do add up.
   */
  readonly lines: readonly SleeveLine[];
}

export interface Account {
  readonly id: string;
  readonly accountType: AccountType;
  readonly taxFunnel: TaxFunnel;
  /** Last four only, as RIG masks them today. */
  readonly maskedNumber: string;
  /** Typed by the advisor, as on RIG's profile sheet. */
  readonly balanceCents: Cents;
  /**
   * Exactly three, Now then Soon then Later. Their amounts should add up to the
   * balance; anything left over shows as unallocated. Not enforced, so a
   * half-finished case can still be saved.
   */
  readonly sleeves: readonly BucketSleeve[];
  /**
   * Whole share counts locked in for this account's proposal (US-21). Empty
   * until the advisor locks the proposal in; not recalculated on save.
   */
  readonly proposalShares: readonly ProposalShare[];
}

/**
 * One locked-in position: how many whole shares of a ticker the proposal puts
 * in one bucket of one account, and the price they were worked out at.
 */
export interface ProposalShare {
  readonly bucket: BucketType;
  readonly tickerSymbol: string;
  readonly shares: number;
  /** Price per share when locked in. Today's value uses the ticker's current price. */
  readonly priceCents: Cents;
}

/** One ticker in a model. Basis points: 100 is 1%, and a model's lines add up to 10000. */
export interface ModelLine {
  readonly tickerSymbol: string;
  readonly weightBps: number;
}

/**
 * A model portfolio: which tickers, in what proportions, for money in one
 * bucket. RIG's vendor models change quarterly, so these are data an
 * administrator edits. A "custom model" is just another one of these.
 */
export interface ModelPortfolio {
  readonly id: string;
  readonly name: string;
  readonly bucket: BucketType;
  /** The funnel this model is meant for, or null for any. Only used to sort the dropdown. */
  readonly taxFunnel: TaxFunnel | null;
  readonly lines: readonly ModelLine[];
}

/**
 * One position the app works out from a sleeve's amount and its model. Derived
 * every time, never stored or sent to the API (decision D2).
 */
export interface Holding {
  readonly accountId: string;
  readonly bucket: BucketType;
  /** The model the position came from, or null when the bucket is manual. */
  readonly modelId: string | null;
  readonly tickerSymbol: string;
  readonly marketValueCents: Cents;
}

export interface Ticker {
  readonly symbol: string;
  readonly assetClass: AssetClass;
  readonly defaultBucket: BucketType;
  /**
   * Price per share (US-21), typed on the Tickers screen until RIG picks a
   * price provider. Null when nobody has entered one; shares cannot be worked
   * out for this ticker until then.
   */
  readonly priceCents: Cents | null;
  /** The day the price was last changed, YYYY-MM-DD. Set by the server. */
  readonly priceAsOf: string | null;
}

/**
 * One row of RIG's advisory fee schedule (US-19). A balance at or above
 * `minBalanceCents`, and below the next row's, is charged `rateBps` on all of
 * it. The schedule always has a row starting at 0.
 */
export interface AdvisoryFeeTier {
  readonly minBalanceCents: Cents;
  /** Basis points: 125 is 1.25%. */
  readonly rateBps: number;
}

export interface BucketDefinition {
  readonly bucket: BucketType;
  readonly label: string;
  readonly horizonMonths: number;
  readonly purposeText: string;
}

/**
 * The target split for one client.
 *
 * Computed from that client's worksheet inputs, not looked up from a table per
 * life stage. RIG confirmed this by email: "This will be calculated using the
 * inputs we provided on the attached spreadsheet."
 *
 * Life stage does not scale the result. It describes which inputs are non-zero:
 * an early accumulator has no income gap, no Social Security bridge, and no
 * forced withdrawals, so Soon comes out small on its own.
 *
 * The spike report's conceptual model has AllocationTarget as a stored table
 * keyed by life stage. That predates RIG's answer and is superseded by this.
 */
export interface AllocationTarget {
  readonly lifeStage: LifeStage;
  readonly nowCents: Cents;
  readonly soonCents: Cents;
  readonly laterCents: Cents;
  readonly nowPct: number;
  readonly soonPct: number;
  readonly laterPct: number;
}

export interface PlannedExpense {
  readonly id: string;
  readonly label: string;
  readonly costCents: Cents;
}

/** An annual amount held for a number of years. `multiplier` is the 1.15 tax gross-up. */
export interface GapEntry {
  readonly id: string;
  readonly label: string;
  readonly annualAmountCents: Cents;
  readonly years: number;
  readonly multiplier: number;
}

export interface NowInputs {
  readonly monthlyIncomeDrawCents: Cents;
  readonly incomeDrawMonths: number;
  readonly bankReserveCents: Cents;
  readonly plannedExpenses: readonly PlannedExpense[];
}

export interface SoonInputs {
  readonly annualIncomeGapCents: Cents;
  readonly incomeGapYears: number;
  readonly socialSecurityBridges: readonly GapEntry[];
  readonly healthcareGaps: readonly GapEntry[];
  readonly miscellaneousCosts: readonly PlannedExpense[];
  readonly forcedWithdrawals: readonly GapEntry[];
  readonly conservativeReserveCents: Cents;
}

export interface ClientCase {
  readonly clientNumber: string;
  /** Display label only, never a key. */
  readonly initials: string;
  readonly planNumber: number;
  readonly people: readonly Person[];
  readonly moneyCyclePhase: MoneyCyclePhase;
  readonly lifeStage: LifeStage;
  /** A value from TAX_BRACKETS, or null if not entered. */
  readonly taxBracketPct: number | null;
  readonly accounts: readonly Account[];
  readonly cashOnHandCents: Cents;
  readonly spareTireCents: Cents;
  readonly nowInputs: NowInputs;
  readonly soonInputs: SoonInputs;
  /**
   * When the advisor last locked in the proposal's share counts (US-21), or
   * null if never. Each account's proposalShares hold what was locked.
   */
  readonly proposalLockedAt: string | null;
  readonly updatedAt: string;
}

export interface ClientSummary {
  readonly clientNumber: string;
  readonly initials: string;
  readonly lifeStage: LifeStage;
  readonly updatedAt: string;
}
