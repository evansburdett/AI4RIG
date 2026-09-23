-- Reshape 0001 into the shape the screens need, and add the tables that were
-- missing (holdings, tickers, bucket definitions, the Now and Soon worksheet
-- lines).
--
-- What changed from 0001, and why:
--   plans     -> client_cases   One row per client case: the household, its
--                               cash figures, and the scalar worksheet inputs.
--                               plan_number becomes client_number (the
--                               generated ID from US-02). plan_number is kept
--                               as a plain counter for "plan 1, plan 2".
--   clients   -> people         One row per person on the case (client and
--                               spouse). The per-person client_number is gone:
--                               the case is what gets a number, not the person.
--   accounts  -> accounts       balance_cents dropped. A balance is the sum of
--                               the account's holdings (decision D2: derived,
--                               never stored). masked_number added.
--
-- Every table is rebuilt rather than ALTERed because SQLite cannot add CHECK
-- constraints or drop UNIQUE columns in place. Existing rows are copied over.
-- The runner wraps this file in one transaction, so it applies completely or
-- not at all.
--
-- Money is INTEGER cents. year and month counts are REAL because the worksheet
-- uses half years (a 1.5-year Social Security bridge). Neither is money.

-- ---------------------------------------------------------------------------
-- Client cases
-- ---------------------------------------------------------------------------

CREATE TABLE client_cases (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    client_number               TEXT    NOT NULL UNIQUE,
    plan_number                 INTEGER NOT NULL DEFAULT 1,
    -- Display label only, never a key. Initials collide.
    initials                    TEXT    NOT NULL DEFAULT '',
    money_cycle_phase           TEXT    NOT NULL DEFAULT 'ACCUMULATION'
        CHECK (money_cycle_phase IN ('ACCUMULATION', 'PRESERVATION', 'DISTRIBUTION')),
    life_stage                  TEXT    NOT NULL DEFAULT 'ACCUMULATION_YOUNG_PROFESSIONAL'
        CHECK (life_stage IN (
            'ACCUMULATION_YOUNG_PROFESSIONAL',
            'ACCUMULATION_PEAK_EARNINGS',
            'PRESERVATION',
            'DISTRIBUTION_GO_GO',
            'DISTRIBUTION_SLOW_GO',
            'DISTRIBUTION_NO_GO'
        )),
    cash_on_hand_cents          INTEGER NOT NULL DEFAULT 0,
    spare_tire_cents            INTEGER NOT NULL DEFAULT 0,

    -- Now worksheet (RIG workbook, Inputs tab, E6 and E9)
    monthly_income_draw_cents   INTEGER NOT NULL DEFAULT 0,
    income_draw_months          REAL    NOT NULL DEFAULT 12 CHECK (income_draw_months >= 0),
    bank_reserve_cents          INTEGER NOT NULL DEFAULT 0,

    -- Soon worksheet (E23 and E51)
    annual_income_gap_cents     INTEGER NOT NULL DEFAULT 0,
    income_gap_years            REAL    NOT NULL DEFAULT 10 CHECK (income_gap_years >= 0),
    conservative_reserve_cents  INTEGER NOT NULL DEFAULT 0,

    created_at                  TEXT    NOT NULL,
    updated_at                  TEXT    NOT NULL
);

INSERT INTO client_cases (id, client_number, cash_on_hand_cents, spare_tire_cents, created_at, updated_at)
SELECT id, plan_number, cash_on_hand_cents, extra_spare_tire_cents, created_at, created_at
FROM plans;

-- ---------------------------------------------------------------------------
-- People on a case
-- ---------------------------------------------------------------------------

CREATE TABLE people (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    client_case_id       INTEGER NOT NULL REFERENCES client_cases (id) ON DELETE CASCADE,
    role                 TEXT    NOT NULL CHECK (role IN ('CLIENT', 'SPOUSE')),
    -- Year only. Age drives bucket weighting; a full date of birth is PII.
    birth_year           INTEGER,
    health_concern       TEXT    NOT NULL DEFAULT 'NONE'
        CHECK (health_concern IN ('NONE', 'CANCER', 'STROKE', 'HEART', 'OTHER')),
    life_expectancy_age  INTEGER,
    UNIQUE (client_case_id, role)
);

INSERT OR IGNORE INTO people (client_case_id, role, birth_year, health_concern, life_expectancy_age)
SELECT
    plan_id,
    CASE is_spouse WHEN 1 THEN 'SPOUSE' ELSE 'CLIENT' END,
    year_of_birth,
    CASE
        WHEN health_concerns IS NULL OR trim(health_concerns) = '' THEN 'NONE'
        WHEN upper(health_concerns) IN ('NONE', 'CANCER', 'STROKE', 'HEART') THEN upper(health_concerns)
        ELSE 'OTHER'
    END,
    life_expectancy_age
FROM clients;

-- ---------------------------------------------------------------------------
-- Accounts and holdings
-- ---------------------------------------------------------------------------

CREATE TABLE accounts_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    client_case_id  INTEGER NOT NULL REFERENCES client_cases (id) ON DELETE CASCADE,
    -- Display order on the profile screen.
    position        INTEGER NOT NULL DEFAULT 0,
    account_type    TEXT    NOT NULL
        CHECK (account_type IN ('SINGLE', 'JOINT', 'IRA', 'ROTH_IRA', 'OTHER')),
    -- Last four only, the way RIG masks them today. Never a full number.
    masked_number   TEXT    NOT NULL DEFAULT '' CHECK (length(masked_number) <= 4)
);

INSERT INTO accounts_new (id, client_case_id, position, account_type)
SELECT
    id,
    plan_id,
    id,
    CASE
        WHEN upper(replace(account_type, ' ', '_')) IN ('SINGLE', 'JOINT', 'IRA', 'ROTH_IRA')
            THEN upper(replace(account_type, ' ', '_'))
        WHEN upper(account_type) = 'ROTH' THEN 'ROTH_IRA'
        ELSE 'OTHER'
    END
FROM accounts;

-- Children first, so dropping plans cascades into nothing.
DROP TABLE accounts;
DROP TABLE clients;
DROP TABLE plans;

ALTER TABLE accounts_new RENAME TO accounts;

CREATE INDEX accounts_client_case_id ON accounts (client_case_id);

CREATE TABLE holdings (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id          INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    position            INTEGER NOT NULL DEFAULT 0,
    -- Deliberately not a foreign key to tickers. An advisor can enter a symbol
    -- that is not in the approved universe yet; the UI flags it as unknown
    -- instead of refusing to save the case.
    ticker_symbol       TEXT    NOT NULL DEFAULT '',
    market_value_cents  INTEGER NOT NULL DEFAULT 0,
    -- What the advisor chose. The ticker's default_bucket is only the starting
    -- suggestion (decision D1).
    assigned_bucket     TEXT    NOT NULL CHECK (assigned_bucket IN ('NOW', 'SOON', 'LATER'))
);

CREATE INDEX holdings_account_id ON holdings (account_id);

-- ---------------------------------------------------------------------------
-- Now and Soon worksheet lines
-- ---------------------------------------------------------------------------

-- One-off costs. NOW_PLANNED is "large upcoming planned expenses" (E15);
-- SOON_MISCELLANEOUS is "miscellaneous costs" (E43).
CREATE TABLE planned_expenses (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    client_case_id  INTEGER NOT NULL REFERENCES client_cases (id) ON DELETE CASCADE,
    kind            TEXT    NOT NULL CHECK (kind IN ('NOW_PLANNED', 'SOON_MISCELLANEOUS')),
    position        INTEGER NOT NULL DEFAULT 0,
    label           TEXT    NOT NULL DEFAULT '',
    cost_cents      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX planned_expenses_client_case_id ON planned_expenses (client_case_id);

-- An annual amount held for some number of years, times a gross-up
-- multiplier (1.15 for forced withdrawals). E33, E38, E48.
CREATE TABLE gap_entries (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    client_case_id       INTEGER NOT NULL REFERENCES client_cases (id) ON DELETE CASCADE,
    kind                 TEXT    NOT NULL
        CHECK (kind IN ('SOCIAL_SECURITY_BRIDGE', 'HEALTHCARE_GAP', 'FORCED_WITHDRAWAL')),
    position             INTEGER NOT NULL DEFAULT 0,
    label                TEXT    NOT NULL DEFAULT '',
    annual_amount_cents  INTEGER NOT NULL DEFAULT 0,
    years                REAL    NOT NULL DEFAULT 0 CHECK (years >= 0),
    multiplier           REAL    NOT NULL DEFAULT 1 CHECK (multiplier > 0)
);

CREATE INDEX gap_entries_client_case_id ON gap_entries (client_case_id);

-- ---------------------------------------------------------------------------
-- Reference data: the ticker universe and the bucket definitions
-- ---------------------------------------------------------------------------

-- RIG's approved investment universe (US-06). Rows come from seed data until
-- RIG sends the Common Investments list.
CREATE TABLE tickers (
    symbol          TEXT PRIMARY KEY
        CHECK (symbol = upper(symbol) AND length(symbol) BETWEEN 1 AND 10),
    asset_class     TEXT NOT NULL
        CHECK (asset_class IN ('CASH', 'FIXED_INCOME', 'EQUITY', 'REAL_ASSET', 'ALTERNATIVE')),
    default_bucket  TEXT NOT NULL CHECK (default_bucket IN ('NOW', 'SOON', 'LATER'))
);

-- Editable wording for each bucket (US-08). The three rows are part of the
-- schema, not sample data: the app needs them to exist.
CREATE TABLE bucket_definitions (
    bucket          TEXT    PRIMARY KEY CHECK (bucket IN ('NOW', 'SOON', 'LATER')),
    label           TEXT    NOT NULL,
    horizon_months  INTEGER NOT NULL CHECK (horizon_months >= 0),
    purpose_text    TEXT    NOT NULL DEFAULT ''
);

INSERT INTO bucket_definitions (bucket, label, horizon_months, purpose_text) VALUES
    ('NOW', 'Now', 12,
     'Money spent in the next twelve months: income draw, cash held at the bank, and known large expenses.'),
    ('SOON', 'Soon', 120,
     'Preservation. Income gap, inflation hedge, Social Security bridge, and anything held conservatively.'),
    ('LATER', 'Later', 360,
     'Long-term growth. Market dependent, and absorbs whatever Now and Soon do not claim.');
