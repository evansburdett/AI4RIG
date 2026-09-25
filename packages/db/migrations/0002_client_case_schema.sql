-- Reshape 0001 into the shape the screens need, and add the tables that were
-- missing (bucket slices, model portfolios, tickers, bucket definitions, the
-- Now and Soon worksheet lines).
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
--   accounts  -> accounts       Keeps balance_cents (the advisor types the
--                               balance, as on RIG's profile sheet). Adds
--                               tax_funnel and masked_number.
--
-- New:
--   account_sleeves      Each account's balance split into Now, Soon, and
--                        Later dollar amounts, each with an optional model.
--   model_portfolios     A named list of tickers and weights for one bucket.
--   model_lines          The tickers and weights in a model.
--   tickers, bucket_definitions, planned_expenses, gap_entries
--
-- There is no holdings table. RIG's flow is: enter the account balance, decide
-- how much of it goes in each bucket, pick a model, and let the app work out
-- the symbols and amounts. Those positions are derived from the model every
-- time (decision D2), never stored.
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
    -- Marginal federal bracket as a whole percent, e.g. 22. Added at RIG's
    -- request (Sept 16); what it drives is not decided yet.
    tax_bracket_pct             INTEGER CHECK (tax_bracket_pct BETWEEN 0 AND 100),
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
    -- Year only. Age is all the planning needs; a full date of birth is PII.
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
-- Accounts
-- ---------------------------------------------------------------------------

CREATE TABLE accounts_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    client_case_id  INTEGER NOT NULL REFERENCES client_cases (id) ON DELETE CASCADE,
    -- Display order on the profile screen.
    position        INTEGER NOT NULL DEFAULT 0,
    account_type    TEXT    NOT NULL
        CHECK (account_type IN ('SINGLE', 'JOINT', 'IRA', 'ROTH_IRA', 'OTHER')),
    -- Which tax treatment the money gets. Defaults from account_type
    -- (Single and Joint taxable, IRA pre-tax, Roth tax-free) but is stored,
    -- because "Other" can be any of the three.
    tax_funnel      TEXT    NOT NULL DEFAULT 'TAXABLE'
        CHECK (tax_funnel IN ('TAXABLE', 'PRE_TAX', 'TAX_FREE')),
    -- Last four only, the way RIG masks them today. Never a full number.
    masked_number   TEXT    NOT NULL DEFAULT '' CHECK (length(masked_number) <= 4),
    balance_cents   INTEGER NOT NULL DEFAULT 0
);

INSERT INTO accounts_new (id, client_case_id, position, account_type, tax_funnel, balance_cents)
SELECT
    id,
    plan_id,
    id,
    kind,
    CASE kind WHEN 'IRA' THEN 'PRE_TAX' WHEN 'ROTH_IRA' THEN 'TAX_FREE' ELSE 'TAXABLE' END,
    balance_cents
FROM (
    SELECT
        id,
        plan_id,
        balance_cents,
        CASE
            WHEN upper(replace(account_type, ' ', '_')) IN ('SINGLE', 'JOINT', 'IRA', 'ROTH_IRA')
                THEN upper(replace(account_type, ' ', '_'))
            WHEN upper(account_type) = 'ROTH' THEN 'ROTH_IRA'
            ELSE 'OTHER'
        END AS kind
    FROM accounts
);

-- Children first, so dropping plans cascades into nothing.
DROP TABLE accounts;
DROP TABLE clients;
DROP TABLE plans;

ALTER TABLE accounts_new RENAME TO accounts;

CREATE INDEX accounts_client_case_id ON accounts (client_case_id);

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

-- A model portfolio: tickers and weights for money in one bucket (US-14).
-- RIG's models come from vendors and change quarterly, so they are data the
-- advisor edits, never code. A custom model is just another row.
CREATE TABLE model_portfolios (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    bucket      TEXT    NOT NULL CHECK (bucket IN ('NOW', 'SOON', 'LATER')),
    -- NULL means the model suits any tax funnel.
    tax_funnel  TEXT    CHECK (tax_funnel IN ('TAXABLE', 'PRE_TAX', 'TAX_FREE')),
    updated_at  TEXT    NOT NULL
);

-- Weights are basis points (1% = 100) so they are whole numbers and a model
-- adds up to exactly 10000. The API refuses a model that does not.
CREATE TABLE model_lines (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id       INTEGER NOT NULL REFERENCES model_portfolios (id) ON DELETE CASCADE,
    position       INTEGER NOT NULL DEFAULT 0,
    -- A ticker in a model cannot be deleted from the universe until it is
    -- taken out of every model.
    ticker_symbol  TEXT    NOT NULL REFERENCES tickers (symbol) ON UPDATE CASCADE ON DELETE RESTRICT,
    weight_bps     INTEGER NOT NULL CHECK (weight_bps > 0 AND weight_bps <= 10000),
    UNIQUE (model_id, ticker_symbol)
);

CREATE INDEX model_lines_model_id ON model_lines (model_id);

-- How much of an account's balance sits in each bucket, and which model that
-- money follows. Always three rows per account. Entered by the advisor
-- (RIG: "for now, it is entered manually for each account").
CREATE TABLE account_sleeves (
    account_id    INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    bucket        TEXT    NOT NULL CHECK (bucket IN ('NOW', 'SOON', 'LATER')),
    amount_cents  INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
    -- Deleting a model leaves the money in the bucket with no model chosen.
    model_id      INTEGER REFERENCES model_portfolios (id) ON DELETE SET NULL,
    PRIMARY KEY (account_id, bucket)
);

-- Accounts carried over from 0001 get their three empty sleeves.
INSERT INTO account_sleeves (account_id, bucket)
SELECT a.id, b.bucket
FROM accounts a
CROSS JOIN (SELECT 'NOW' AS bucket UNION ALL SELECT 'SOON' UNION ALL SELECT 'LATER') b;

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
