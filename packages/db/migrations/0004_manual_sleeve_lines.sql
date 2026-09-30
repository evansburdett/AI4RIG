-- US-23: model or manual for each account's bucket.
--
-- Blake, Sept 23 (14:14): "a dropdown where you basically either click model or
-- manual." A sleeve either follows a saved model portfolio or carries its own
-- list of symbols and percentages, chosen for this client and nowhere else.
--
-- Why manual lines get their own table rather than a private model_portfolios
-- row: model_portfolios.name is UNIQUE NOT NULL, so every manual sleeve would
-- need a synthetic name that then has to be hidden from the Models screen; and
-- model_portfolios has no link to an account, so deleting an account would
-- leave its private model behind. A table hanging off the sleeve cascades on
-- its own and keeps the Models screen meaning one thing: RIG's reusable
-- models. Going the other way -- turning a manual sleeve into a reusable model
-- -- stays an explicit "save as a model" action in the app.
--
-- Weights are basis points here too (1% = 100), the same unit model_lines
-- uses, so the same engine function splits a bucket's dollars either way.
-- Unlike a model, these are NOT required to add up to 10000: a half-finished
-- case has to be savable, and the screen shows what is still unplaced. The
-- app derives no positions from a sleeve that does not add up.

ALTER TABLE account_sleeves
    ADD COLUMN mode TEXT NOT NULL DEFAULT 'MODEL'
        CHECK (mode IN ('MODEL', 'MANUAL') AND (mode = 'MODEL' OR model_id IS NULL));

CREATE TABLE sleeve_lines (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id     INTEGER NOT NULL,
    bucket         TEXT    NOT NULL,
    -- Display order on the account card.
    position       INTEGER NOT NULL DEFAULT 0,
    -- A ticker cannot be dropped from the universe while a case still holds
    -- it, and renaming one follows through. This foreign key is also what
    -- makes an unknown symbol fail loudly, which is where US-24 hooks in.
    ticker_symbol  TEXT    NOT NULL REFERENCES tickers (symbol) ON UPDATE CASCADE ON DELETE RESTRICT,
    weight_bps     INTEGER NOT NULL CHECK (weight_bps > 0 AND weight_bps <= 10000),
    FOREIGN KEY (account_id, bucket) REFERENCES account_sleeves (account_id, bucket) ON DELETE CASCADE,
    -- One row per symbol: two lines for the same ticker is a mis-click.
    UNIQUE (account_id, bucket, ticker_symbol)
);

CREATE INDEX sleeve_lines_sleeve ON sleeve_lines (account_id, bucket);
