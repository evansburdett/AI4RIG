-- Prices are maintained manually in whole cents per share. Actual holdings
-- are stored separately from model target weights.

ALTER TABLE tickers
ADD COLUMN price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0);

CREATE TABLE account_positions (
    account_id    INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    bucket        TEXT    NOT NULL CHECK (bucket IN ('NOW', 'SOON', 'LATER')),
    ticker_symbol TEXT    NOT NULL REFERENCES tickers (symbol) ON UPDATE CASCADE ON DELETE RESTRICT,
    shares_micros INTEGER NOT NULL DEFAULT 0 CHECK (shares_micros >= 0),
    PRIMARY KEY (account_id, bucket, ticker_symbol)
);

CREATE INDEX account_positions_ticker ON account_positions (ticker_symbol);

-- Existing records contain dollar totals and target allocations, not verified
-- shares. Do not infer a share count from them.
UPDATE accounts SET balance_cents = 0;
