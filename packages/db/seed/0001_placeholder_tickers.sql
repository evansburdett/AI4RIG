-- Placeholder investment universe: broad ETFs so the models have something to
-- be built from. NOT RIG's approved list. Replace with the Common Investments tab
-- when RIG sends it (US-06).

-- Prices are round placeholders so shares can be worked out and a proposal
-- locked in during development (US-21). They are NOT quotes; RIG has not picked
-- a price provider, and real prices are typed on the Tickers screen.
INSERT INTO tickers (symbol, asset_class, default_bucket, price_cents, price_micros, price_as_of) VALUES
    ('SGOV', 'CASH',         'NOW',   10000, 100000000, '2026-10-21'),
    ('BIL',  'CASH',         'NOW',    9150, 91500000, '2026-10-21'),
    ('SHY',  'FIXED_INCOME', 'SOON',   8200, 82000000, '2026-10-21'),
    ('BND',  'FIXED_INCOME', 'SOON',   7300, 73000000, '2026-10-21'),
    ('TIP',  'FIXED_INCOME', 'SOON',  11000, 110000000, '2026-10-21'),
    ('VTI',  'EQUITY',       'LATER', 30000, 300000000, '2026-10-21'),
    ('VOO',  'EQUITY',       'LATER', 55000, 550000000, '2026-10-21'),
    ('VXUS', 'EQUITY',       'LATER',  6500, 65000000, '2026-10-21'),
    ('VNQ',  'REAL_ASSET',   'LATER',  9000, 90000000, '2026-10-21'),
    ('GLD',  'REAL_ASSET',   'SOON',  25000, 250000000, '2026-10-21')
ON CONFLICT (symbol) DO UPDATE SET
    asset_class = excluded.asset_class,
    default_bucket = excluded.default_bucket,
    price_cents = excluded.price_cents,
    price_micros = excluded.price_micros,
    price_as_of = excluded.price_as_of;

-- An upsert rather than INSERT OR REPLACE: REPLACE deletes the row first, and
-- a ticker used in a model cannot be deleted.
