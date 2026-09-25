-- Placeholder investment universe: broad ETFs so the models have something to
-- be built from. NOT RIG's approved list. Replace with the Common Investments tab
-- when RIG sends it (US-06).

INSERT INTO tickers (symbol, asset_class, default_bucket) VALUES
    ('SGOV', 'CASH',         'NOW'),
    ('BIL',  'CASH',         'NOW'),
    ('SHY',  'FIXED_INCOME', 'SOON'),
    ('BND',  'FIXED_INCOME', 'SOON'),
    ('TIP',  'FIXED_INCOME', 'SOON'),
    ('VTI',  'EQUITY',       'LATER'),
    ('VOO',  'EQUITY',       'LATER'),
    ('VXUS', 'EQUITY',       'LATER'),
    ('VNQ',  'REAL_ASSET',   'LATER'),
    ('GLD',  'REAL_ASSET',   'SOON')
ON CONFLICT (symbol) DO UPDATE SET
    asset_class = excluded.asset_class,
    default_bucket = excluded.default_bucket;

-- An upsert rather than INSERT OR REPLACE: REPLACE deletes the row first, and
-- a ticker used in a model cannot be deleted.
