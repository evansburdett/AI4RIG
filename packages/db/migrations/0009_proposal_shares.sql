-- US-21: shares and prices, the way RIG described them on Sept 23. A
-- holding's percentage becomes dollars, the dollars become whole shares at
-- the ticker's price, and the share counts are kept, so when the client comes
-- back months later the same shares are valued at current prices and nobody
-- retypes anything.
--
-- The app builds a PROPOSED portfolio; it does not track what a client holds
-- today. Share counts are therefore written only when the advisor locks in
-- the proposal (proposal_locked_at), not recalculated on every save.
--
-- 0006 added account_positions for typed-in "actual" holdings and derived
-- each account's balance from them, zeroing every existing balance on the
-- way. That is the tracking model RIG said it did not want, so the table
-- goes. Balances 0006 zeroed cannot be recovered here: `npm run db:seed`
-- restores the sample cases, and any case typed by hand needs its balances
-- typed again.
--
-- tickers.price_cents (from 0006) stays: it is the price shares are worked
-- out at. price_as_of records when it was last changed, so a stale price is
-- visible. Prices are typed on the Tickers screen until RIG picks a data
-- provider.

DROP TABLE account_positions;

ALTER TABLE tickers ADD COLUMN price_as_of TEXT;
UPDATE tickers SET price_as_of = date('now') WHERE price_cents IS NOT NULL;

ALTER TABLE client_cases ADD COLUMN proposal_locked_at TEXT;

CREATE TABLE proposal_positions (
    account_id    INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    bucket        TEXT    NOT NULL CHECK (bucket IN ('NOW', 'SOON', 'LATER')),
    ticker_symbol TEXT    NOT NULL REFERENCES tickers (symbol) ON UPDATE CASCADE ON DELETE RESTRICT,
    shares        INTEGER NOT NULL CHECK (shares >= 0),
    -- The price the shares were worked out at, kept so today's value can be
    -- set beside the value the client was shown.
    price_cents   INTEGER NOT NULL CHECK (price_cents > 0),
    PRIMARY KEY (account_id, bucket, ticker_symbol)
);

CREATE INDEX proposal_positions_ticker ON proposal_positions (ticker_symbol);
