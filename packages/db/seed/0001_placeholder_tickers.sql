-- Placeholder investment universe: broad ETFs so the screens have something to
-- classify. NOT RIG's approved list. Replace with the Common Investments tab
-- when RIG sends it (US-06).

INSERT OR REPLACE INTO tickers (symbol, asset_class, default_bucket) VALUES
    ('SGOV', 'CASH',         'NOW'),
    ('BIL',  'CASH',         'NOW'),
    ('SHY',  'FIXED_INCOME', 'SOON'),
    ('BND',  'FIXED_INCOME', 'SOON'),
    ('TIP',  'FIXED_INCOME', 'SOON'),
    ('VTI',  'EQUITY',       'LATER'),
    ('VOO',  'EQUITY',       'LATER'),
    ('VXUS', 'EQUITY',       'LATER'),
    ('VNQ',  'REAL_ASSET',   'LATER'),
    ('GLD',  'REAL_ASSET',   'SOON');
