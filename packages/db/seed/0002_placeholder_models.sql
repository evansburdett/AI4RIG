-- Placeholder model portfolios built from the placeholder tickers. NOT RIG's
-- models; replace them with the YCharts models RIG sends (US-14). A model
-- covers a whole account: each ticker's default bucket decides whether its
-- money counts toward Now, Soon, or Later. Weights are basis points: 6000 is
-- 60%.

INSERT INTO model_portfolios (id, name, tax_funnel, updated_at) VALUES
    (9001, 'Placeholder Cash reserve',   NULL,       '2026-10-26T00:00:00.000Z'),
    (9002, 'Placeholder Income 30/70',   NULL,       '2026-10-26T00:00:00.000Z'),
    (9003, 'Placeholder Balanced 60/40', NULL,       '2026-10-26T00:00:00.000Z'),
    (9004, 'Placeholder Roth growth',    'TAX_FREE', '2026-10-26T00:00:00.000Z')
ON CONFLICT (id) DO UPDATE SET
    name = excluded.name,
    tax_funnel = excluded.tax_funnel,
    updated_at = excluded.updated_at;

DELETE FROM model_lines WHERE model_id IN (9001, 9002, 9003, 9004);

INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps) VALUES
    -- Cash reserve: all Now.
    (9001, 0, 'SGOV', 6000),
    (9001, 1, 'BIL',  4000),
    -- Income 30/70: 30% stocks (Later), 70% bonds (Soon).
    (9002, 0, 'VTI',  2000),
    (9002, 1, 'VXUS', 1000),
    (9002, 2, 'BND',  4000),
    (9002, 3, 'SHY',  2000),
    (9002, 4, 'TIP',  1000),
    -- Balanced 60/40: 60% stocks (Later), 40% bonds (Soon).
    (9003, 0, 'VTI',  3500),
    (9003, 1, 'VOO',  1000),
    (9003, 2, 'VXUS', 1500),
    (9003, 3, 'BND',  2500),
    (9003, 4, 'SHY',  1000),
    (9003, 5, 'TIP',   500),
    -- Roth growth: all Later.
    (9004, 0, 'VTI',  6000),
    (9004, 1, 'VXUS', 4000);
