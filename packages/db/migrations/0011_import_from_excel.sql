-- Importing RIG's spreadsheets (10/26 email from Ari): their vendor model
-- portfolios, and a custodian export of what an account holds.
--
--   tickers.name                The fund's name, so "FXAIX" can read as
--                               "Fidelity 500 Index Fund". From the import
--                               (a model's best guess, or the export's own
--                               description). Optional.
--   account_lines.shares_micros The shares the account actually holds of a
--                               fund, in millionths of a share, when they
--                               came from an export. Statements hold
--                               fractional shares (3.796 of a mutual fund,
--                               93,572.35 of a money market), which whole
--                               shares cannot carry. NULL for a fund the
--                               advisor allocated by dollars or weight; the
--                               app works out whole shares to buy for those.

ALTER TABLE tickers ADD COLUMN name TEXT CHECK (name IS NULL OR length(name) BETWEEN 1 AND 200);

ALTER TABLE account_lines ADD COLUMN shares_micros INTEGER CHECK (shares_micros IS NULL OR shares_micros >= 0);
