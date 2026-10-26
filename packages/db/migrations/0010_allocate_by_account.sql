-- RIG allocates by account, not by bucket (10/26 session).
--
-- Each account has a balance. Its advisory fee is held as cash, which the app
-- works out (it is not stored). What is left is invested in funds: usually
-- filled from one model, then adjusted fund by fund and topped up with extra
-- funds. Which bucket a fund counts toward comes from the ticker's default
-- bucket, so the Now / Soon / Later totals are added up from the funds rather
-- than typed per account.
--
-- So:
--   account_lines       the money in each fund in an account, in cents. Dollars
--                       rather than weights, because the advisor can type
--                       either and a typed dollar amount must stay exact.
--   accounts.model_id   the model the account was filled from, for its label
--                       and for filling it again. Deleting the model leaves
--                       the funds where they are.
--
-- account_sleeves and sleeve_lines (an amount, model, or hand-picked symbols
-- per bucket) go. Models no longer belong to one bucket, so their bucket
-- column goes too.

ALTER TABLE accounts ADD COLUMN model_id INTEGER REFERENCES model_portfolios (id) ON DELETE SET NULL;

CREATE TABLE account_lines (
    account_id     INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    -- Display order on the account card.
    position       INTEGER NOT NULL DEFAULT 0,
    ticker_symbol  TEXT    NOT NULL REFERENCES tickers (symbol) ON UPDATE CASCADE ON DELETE RESTRICT,
    amount_cents   INTEGER NOT NULL CHECK (amount_cents >= 0),
    PRIMARY KEY (account_id, ticker_symbol)
);

CREATE INDEX account_lines_ticker ON account_lines (ticker_symbol);

-- Carry every existing case over: each bucket's amount split across the
-- model or hand-picked symbols it followed, summed per fund. Rounding down
-- can leave a few cents unallocated, which the account card shows. Money in
-- a bucket that followed nothing also shows as unallocated.
INSERT INTO account_lines (account_id, position, ticker_symbol, amount_cents)
SELECT
    account_id,
    ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY ticker_symbol) - 1,
    ticker_symbol,
    SUM(amount_cents)
FROM (
    SELECT s.account_id, ml.ticker_symbol, s.amount_cents * ml.weight_bps / 10000 AS amount_cents
    FROM account_sleeves s
    JOIN model_lines ml ON ml.model_id = s.model_id
    WHERE s.mode = 'MODEL' AND s.amount_cents > 0
    UNION ALL
    SELECT s.account_id, l.ticker_symbol, s.amount_cents * l.weight_bps / 10000
    FROM account_sleeves s
    JOIN sleeve_lines l ON l.account_id = s.account_id AND l.bucket = s.bucket
    WHERE s.mode = 'MANUAL' AND s.amount_cents > 0
)
GROUP BY account_id, ticker_symbol;

DROP TABLE sleeve_lines;
DROP TABLE account_sleeves;

ALTER TABLE model_portfolios DROP COLUMN bucket;
