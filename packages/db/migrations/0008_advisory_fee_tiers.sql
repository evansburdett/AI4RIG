-- US-19: RIG's advisory fee schedule, as data an administrator can edit
-- rather than a number in the code. Ari sent it on Sept 23.
--
-- It is a breakpoint schedule, not a marginal one: the row a balance falls in
-- sets the rate for the whole balance. Each row runs from its minimum up to
-- the next row's. Rates are basis points (125 = 1.25%); minimums are cents.
--
-- These rows are reference data the app needs to work, like the bucket
-- definitions in 0002, so they ship with the schema rather than as a seed.

CREATE TABLE advisory_fee_tiers (
    min_balance_cents INTEGER PRIMARY KEY CHECK (min_balance_cents >= 0),
    rate_bps          INTEGER NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000)
);

INSERT INTO advisory_fee_tiers (min_balance_cents, rate_bps) VALUES
    (        0, 195),  -- $0 to $249,999.99            1.95%
    ( 25000000, 175),  -- $250,000 to $499,999.99      1.75%
    ( 50000000, 150),  -- $500,000 to $999,999.99      1.50%
    (100000000, 125),  -- $1,000,000 to $2,499,999.99  1.25%
    (250000000, 100),  -- $2,500,000 to $4,999,999.99  1.00%
    (500000000,  85);  -- $5,000,000 and up            0.85%
