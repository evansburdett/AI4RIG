-- Placeholder model portfolios, one or two per bucket, built from the
-- placeholder tickers. NOT RIG's models. Replace with the vendor models RIG
-- sends (US-14). Weights are basis points: 6000 is 60%.

INSERT INTO model_portfolios (id, name, bucket, tax_funnel, updated_at) VALUES
    (9001, 'Placeholder Now: Cash',            'NOW',   NULL,       '2026-09-22T00:00:00.000Z'),
    (9002, 'Placeholder Soon: Core bonds',     'SOON',  NULL,       '2026-09-22T00:00:00.000Z'),
    (9003, 'Placeholder Later: Broad equity',  'LATER', NULL,       '2026-09-22T00:00:00.000Z'),
    (9004, 'Placeholder Later: Roth growth',   'LATER', 'TAX_FREE', '2026-09-22T00:00:00.000Z')
ON CONFLICT (id) DO UPDATE SET
    name = excluded.name,
    bucket = excluded.bucket,
    tax_funnel = excluded.tax_funnel,
    updated_at = excluded.updated_at;

DELETE FROM model_lines WHERE model_id IN (9001, 9002, 9003, 9004);

INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps) VALUES
    (9001, 0, 'SGOV', 6000),
    (9001, 1, 'BIL',  4000),
    (9002, 0, 'BND',  5000),
    (9002, 1, 'SHY',  3000),
    (9002, 2, 'TIP',  2000),
    (9003, 0, 'VTI',  5000),
    (9003, 1, 'VOO',  2000),
    (9003, 2, 'VXUS', 2000),
    (9003, 3, 'VNQ',  1000),
    (9004, 0, 'VTI',  6000),
    (9004, 1, 'VXUS', 4000);
