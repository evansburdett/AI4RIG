-- RIG's vendor model portfolios (Models.xlsx, from Ari on 10/26), so every
-- install has them after updating, without anyone importing the file.
--
-- Generated from that spreadsheet by the app's own importer
-- (apps/web/src/domain/importModels.ts), with the tickers' asset classes and
-- buckets from apps/web/src/domain/tickerGuesses.ts: best guesses, which RIG
-- can change on the Tickers screen. The importer's notes on the file:
--   American Funds Growth Model Portfolio is listed twice; loaded once.
--   First Trust Moderate Growth lists FEX at 0%; left out.
--   JPMorgan 100/0 Tactical & American Funds Growth Model has weights finer
--   than 0.01% (17.125%); rounded, still adding up to exactly 100%.
-- A model's "USD CASH" line is the CASH ticker, always worth $1.
--
-- Only adds: a ticker already in the universe keeps RIG's own settings, and a
-- model RIG already has by that name (say, imported from the same file) is
-- left as it is. Prices are not included; they come from a statement import
-- or the Tickers screen.

INSERT INTO tickers (symbol, name, asset_class, default_bucket, price_cents, price_micros, price_as_of) VALUES
    ('ABNFX', 'American Funds Bond Fund of America F-2', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('AFLG', 'First Trust Active Factor Large Cap ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('AGVGX', 'American Funds Global Insight Fund F-2', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('AHIFX', 'American Funds American High-Income Trust F-2', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('AMBFX', 'American Funds American Balanced Fund F-2', 'EQUITY', 'SOON', NULL, NULL, NULL),
    ('AMCFX', 'American Funds AMCAP Fund F-2', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('AMEFX', 'American Funds Income Fund of America F-2', 'EQUITY', 'SOON', NULL, NULL, NULL),
    ('AMRFX', 'American Funds American Mutual Fund F-2', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('ANBFX', 'American Funds Strategic Bond Fund F-2', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('ANWFX', 'American Funds New Perspective Fund F-2', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('AVEAX', 'Ave Maria Growth Focused Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('AVEDX', 'Ave Maria Rising Dividend Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('AVEFX', 'Ave Maria Bond Fund', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('AVERX', 'Ave Maria Value Focused Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('BBHY', 'JPMorgan BetaBuilders USD High Yield Corporate Bond ETF', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('BBJP', 'JPMorgan BetaBuilders Japan ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('BBUS', 'JPMorgan BetaBuilders U.S. Equity ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('CAIFX', 'American Funds Capital Income Builder F-2', 'EQUITY', 'SOON', NULL, NULL, NULL),
    ('CASH', 'Cash (USD)', 'CASH', 'NOW', 100, 1000000, '2026-10-26'),
    ('CGDG', 'Capital Group Dividend Growers ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('CGDV', 'Capital Group Dividend Value ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('CGGE', 'Capital Group Global Equity ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('CGGO', 'Capital Group Global Growth Equity ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('CGHM', 'Capital Group Municipal High-Income ETF', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('CGMM', 'Capital Group U.S. Small and Mid Cap ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('CGMU', 'Capital Group Municipal Income ETF', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('CGNG', 'Capital Group New Geography Equity ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('CGUS', 'Capital Group Core Equity ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('DMXF', 'iShares ESG Advanced MSCI EAFE ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('DSI', 'iShares MSCI KLD 400 Social ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('EAGG', 'iShares ESG Aware U.S. Aggregate Bond ETF', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('EBNFX', 'American Funds Emerging Markets Bond Fund F-2', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('ELCV', 'Eventide High Dividend ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('EMREX', NULL, 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('ESGE', 'iShares ESG Aware MSCI EM ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('ESGU', 'iShares ESG Aware MSCI USA ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('ESUM', 'Eventide US Market ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('ETIBX', 'Eventide Limited-Term Bond Fund I', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('ETIDX', 'Eventide Dividend Opportunities Fund I', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('ETIHX', 'Eventide Healthcare & Life Sciences Fund I', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('ETILX', 'Eventide Gilead Fund I', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('ETIMX', 'Eventide Balanced Fund I', 'EQUITY', 'SOON', NULL, NULL, NULL),
    ('ETIRX', 'Eventide Core Bond Fund I', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('ETLIX', 'Eventide Large Cap Focus Fund I', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('EUSB', 'iShares ESG Advanced Total USD Bond Market ETF', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('FAI', 'First Trust Bloomberg Artificial Intelligence ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FBKWX', NULL, 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('FCBIX', 'Fidelity Advisor Corporate Bond Fund I', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('FCNWX', 'Fidelity Advisor Conservative Income Bond Fund I', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('FCNYX', 'Fidelity Advisor Conservative Income Bond Fund Z', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('FDN', 'First Trust Dow Jones Internet Index Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FDT', 'First Trust Developed Markets ex-US AlphaDEX Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FEM', 'First Trust Emerging Markets AlphaDEX Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FEP', 'First Trust Europe AlphaDEX Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FEPIX', 'Fidelity Advisor Total Bond Fund I', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('FGBPX', 'Fidelity Advisor Investment Grade Bond Fund I', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('FIEZX', NULL, 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FIIG', 'First Trust Intermediate Duration Investment Grade Corporate ETF', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('FIIMX', 'Fidelity Advisor Mid Cap II Fund I', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FIMVX', 'Fidelity Mid Cap Value Index Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FINFX', 'American Funds Fundamental Investors F-2', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FIQKX', NULL, 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FIVQX', 'Fidelity Advisor International Value Fund I', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FIXD', 'First Trust TCW Opportunistic Fixed Income ETF', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('FJP', 'First Trust Japan AlphaDEX Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FLCOX', 'Fidelity Large Cap Value Index Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FMSCX', 'Fidelity Advisor Mortgage Securities Fund I', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('FNCMX', 'Fidelity Nasdaq Composite Index Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FOTHX', 'Fidelity Advisor OTC Fund I', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FOTJX', 'Fidelity Advisor OTC Fund Z', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FSFNX', 'Fidelity Advisor Focused Stock Fund I', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FSFOX', 'Fidelity Advisor Focused Stock Fund Z', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FSGGX', 'Fidelity Global ex U.S. Index Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FSIG', 'First Trust Limited Duration Investment Grade Corporate ETF', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('FSMDX', 'Fidelity Mid Cap Index Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FSPGX', 'Fidelity Large Cap Growth Index Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FSSNX', 'Fidelity Small Cap Index Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FTA', 'First Trust Large Cap Value AlphaDEX Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FTCB', 'First Trust Core Investment Grade ETF', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('FTCS', 'First Trust Capital Strength ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FTEIX', 'Fidelity Advisor Total International Equity Fund I', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FTGS', 'First Trust Growth Strength ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FTRIX', 'Fidelity Advisor Mega Cap Stock Fund I', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FTXO', 'First Trust Nasdaq Bank ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FUAMX', 'Fidelity Intermediate Treasury Bond Index Fund', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('FVD', 'First Trust Value Line Dividend Index Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FVDNX', NULL, 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FVDOX', NULL, 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FWGIX', 'American Funds Capital World Growth and Income F-3', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FXAIX', 'Fidelity 500 Index Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FXH', 'First Trust Health Care AlphaDEX Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FXNAX', 'Fidelity U.S. Bond Index Fund', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('FXR', 'First Trust Industrials/Producer Durables AlphaDEX Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FZALX', 'Fidelity Advisor Mega Cap Stock Fund Z', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('FZAMX', 'Fidelity Advisor Mid Cap II Fund Z', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('GBLFX', 'American Funds Global Balanced Fund F-2', 'EQUITY', 'SOON', NULL, NULL, NULL),
    ('GFFFX', 'American Funds Growth Fund of America F-2', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('GVTFX', 'American Funds U.S. Government Securities Fund F-2', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('HIMFX', 'American High-Income Municipal Bond Fund F-3', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('HLIPX', NULL, 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('HLQVX', NULL, 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('ICAFX', 'American Funds Investment Company of America F-2', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('IGFFX', 'American Funds International Growth and Income F-2', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('JBND', 'JPMorgan Active Bond ETF', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('JEMSX', 'JPMorgan Emerging Markets Equity Fund I', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('JIG', 'JPMorgan International Growth ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('JIRE', 'JPMorgan International Research Enhanced Equity ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('JIVE', 'JPMorgan International Value ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('JMSIX', NULL, 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('JUESX', 'JPMorgan U.S. Equity Fund I', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('JUSA', 'JPMorgan U.S. Research Enhanced Large Cap ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('LALT', 'First Trust Multi-Strategy Alternative ETF', 'ALTERNATIVE', 'SOON', NULL, NULL, NULL),
    ('LCTD', 'BlackRock World ex U.S. Carbon Transition Readiness ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('LCTU', 'BlackRock U.S. Carbon Transition Readiness ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('LGOV', 'First Trust Long Duration Opportunities ETF', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('LMBS', 'First Trust Low Duration Opportunities ETF', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('MIAYX', 'American Funds Multi-Sector Income Fund F-2', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('NEFFX', 'American Funds New Economy Fund F-2', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('NFFFX', 'American Funds New World Fund F-2', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('QTEC', 'First Trust NASDAQ-100 Technology Sector Index Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('RDVY', 'First Trust Rising Dividend Achievers ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('SEEGX', 'JPMorgan Large Cap Growth Fund I', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('SFCWX', 'American Funds SMALLCAP World Fund F-3', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('SMCFX', 'American Funds SMALLCAP World Fund F-2', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('SUSB', 'iShares ESG Aware 1-5 Year USD Corporate Bond ETF', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('SUSC', 'iShares ESG Aware USD Corporate Bond ETF', 'FIXED_INCOME', 'SOON', NULL, NULL, NULL),
    ('TDIV', 'First Trust NASDAQ Technology Dividend Index Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('USXF', 'iShares ESG Advanced MSCI USA ETF', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('WGIFX', 'American Funds Capital World Growth and Income F-2', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('WMFFX', 'American Funds Washington Mutual F-2', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('XLC', 'Communication Services Select Sector SPDR Fund', 'EQUITY', 'LATER', NULL, NULL, NULL),
    ('XLK', 'Technology Select Sector SPDR Fund', 'EQUITY', 'LATER', NULL, NULL, NULL)
ON CONFLICT (symbol) DO NOTHING;

-- American Funds Growth Model Portfolio
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'American Funds Growth Model Portfolio', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'American Funds Growth Model Portfolio' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'AMCFX' AS symbol, 1000 AS weight_bps
    UNION ALL SELECT 1 AS position, 'GFFFX' AS symbol, 2100 AS weight_bps
    UNION ALL SELECT 2 AS position, 'FINFX' AS symbol, 1000 AS weight_bps
    UNION ALL SELECT 3 AS position, 'ICAFX' AS symbol, 1000 AS weight_bps
    UNION ALL SELECT 4 AS position, 'WMFFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 5 AS position, 'NEFFX' AS symbol, 1000 AS weight_bps
    UNION ALL SELECT 6 AS position, 'ANWFX' AS symbol, 1500 AS weight_bps
    UNION ALL SELECT 7 AS position, 'NFFFX' AS symbol, 400 AS weight_bps
    UNION ALL SELECT 8 AS position, 'SMCFX' AS symbol, 1500 AS weight_bps
) v
WHERE m.name = 'American Funds Growth Model Portfolio' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- Fidelity Target Allocation 100/0 (I) Model Portfolio
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'Fidelity Target Allocation 100/0 (I) Model Portfolio', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'Fidelity Target Allocation 100/0 (I) Model Portfolio' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'FXAIX' AS symbol, 1300 AS weight_bps
    UNION ALL SELECT 1 AS position, 'FTRIX' AS symbol, 1000 AS weight_bps
    UNION ALL SELECT 2 AS position, 'FLCOX' AS symbol, 700 AS weight_bps
    UNION ALL SELECT 3 AS position, 'FVDNX' AS symbol, 400 AS weight_bps
    UNION ALL SELECT 4 AS position, 'FSPGX' AS symbol, 700 AS weight_bps
    UNION ALL SELECT 5 AS position, 'FNCMX' AS symbol, 1200 AS weight_bps
    UNION ALL SELECT 6 AS position, 'FSFNX' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 7 AS position, 'FOTHX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 8 AS position, 'FIIMX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 9 AS position, 'FIMVX' AS symbol, 300 AS weight_bps
    UNION ALL SELECT 10 AS position, 'FIVQX' AS symbol, 900 AS weight_bps
    UNION ALL SELECT 11 AS position, 'FSGGX' AS symbol, 1700 AS weight_bps
    UNION ALL SELECT 12 AS position, 'FTEIX' AS symbol, 400 AS weight_bps
    UNION ALL SELECT 13 AS position, 'CASH' AS symbol, 200 AS weight_bps
) v
WHERE m.name = 'Fidelity Target Allocation 100/0 (I) Model Portfolio' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- Fidelity Target Allocation 40/60 (I) Model Portfolio
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'Fidelity Target Allocation 40/60 (I) Model Portfolio', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'Fidelity Target Allocation 40/60 (I) Model Portfolio' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'FXAIX' AS symbol, 800 AS weight_bps
    UNION ALL SELECT 1 AS position, 'FTRIX' AS symbol, 600 AS weight_bps
    UNION ALL SELECT 2 AS position, 'FLCOX' AS symbol, 300 AS weight_bps
    UNION ALL SELECT 3 AS position, 'FNCMX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 4 AS position, 'FSFNX' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 5 AS position, 'FOTHX' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 6 AS position, 'FIIMX' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 7 AS position, 'FIVQX' AS symbol, 600 AS weight_bps
    UNION ALL SELECT 8 AS position, 'FSGGX' AS symbol, 600 AS weight_bps
    UNION ALL SELECT 9 AS position, 'FCBIX' AS symbol, 400 AS weight_bps
    UNION ALL SELECT 10 AS position, 'FEPIX' AS symbol, 1700 AS weight_bps
    UNION ALL SELECT 11 AS position, 'FUAMX' AS symbol, 1500 AS weight_bps
    UNION ALL SELECT 12 AS position, 'FGBPX' AS symbol, 700 AS weight_bps
    UNION ALL SELECT 13 AS position, 'FCNWX' AS symbol, 1300 AS weight_bps
    UNION ALL SELECT 14 AS position, 'FMSCX' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 15 AS position, 'CASH' AS symbol, 200 AS weight_bps
) v
WHERE m.name = 'Fidelity Target Allocation 40/60 (I) Model Portfolio' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- Fidelity Target Allocation Blended 85/15 (Z) Model Portfolio
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'Fidelity Target Allocation Blended 85/15 (Z) Model Portfolio', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'Fidelity Target Allocation Blended 85/15 (Z) Model Portfolio' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'FZALX' AS symbol, 800 AS weight_bps
    UNION ALL SELECT 1 AS position, 'FXAIX' AS symbol, 1400 AS weight_bps
    UNION ALL SELECT 2 AS position, 'FVDOX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 3 AS position, 'FLCOX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 4 AS position, 'FSFOX' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 5 AS position, 'FOTJX' AS symbol, 400 AS weight_bps
    UNION ALL SELECT 6 AS position, 'FSPGX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 7 AS position, 'FNCMX' AS symbol, 1000 AS weight_bps
    UNION ALL SELECT 8 AS position, 'FZAMX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 9 AS position, 'FIMVX' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 10 AS position, 'FIQKX' AS symbol, 900 AS weight_bps
    UNION ALL SELECT 11 AS position, 'FIEZX' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 12 AS position, 'FSGGX' AS symbol, 1400 AS weight_bps
    UNION ALL SELECT 13 AS position, 'FBKWX' AS symbol, 700 AS weight_bps
    UNION ALL SELECT 14 AS position, 'FUAMX' AS symbol, 600 AS weight_bps
    UNION ALL SELECT 15 AS position, 'CASH' AS symbol, 200 AS weight_bps
) v
WHERE m.name = 'Fidelity Target Allocation Blended 85/15 (Z) Model Portfolio' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- Fidelity Target Allocation Index-Focused 70/30 Model Portfolio
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'Fidelity Target Allocation Index-Focused 70/30 Model Portfolio', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'Fidelity Target Allocation Index-Focused 70/30 Model Portfolio' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'FXAIX' AS symbol, 4300 AS weight_bps
    UNION ALL SELECT 1 AS position, 'FSMDX' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 2 AS position, 'FSSNX' AS symbol, 400 AS weight_bps
    UNION ALL SELECT 3 AS position, 'FSGGX' AS symbol, 2100 AS weight_bps
    UNION ALL SELECT 4 AS position, 'FXNAX' AS symbol, 2500 AS weight_bps
    UNION ALL SELECT 5 AS position, 'FCNYX' AS symbol, 300 AS weight_bps
    UNION ALL SELECT 6 AS position, 'CASH' AS symbol, 200 AS weight_bps
) v
WHERE m.name = 'Fidelity Target Allocation Index-Focused 70/30 Model Portfolio' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- Fidelity Target Allocation Index-Focused 85/15 Model Portfolio
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'Fidelity Target Allocation Index-Focused 85/15 Model Portfolio', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'Fidelity Target Allocation Index-Focused 85/15 Model Portfolio' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'FXAIX' AS symbol, 5300 AS weight_bps
    UNION ALL SELECT 1 AS position, 'FSMDX' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 2 AS position, 'FSSNX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 3 AS position, 'FSGGX' AS symbol, 2500 AS weight_bps
    UNION ALL SELECT 4 AS position, 'FXNAX' AS symbol, 1300 AS weight_bps
    UNION ALL SELECT 5 AS position, 'CASH' AS symbol, 200 AS weight_bps
) v
WHERE m.name = 'Fidelity Target Allocation Index-Focused 85/15 Model Portfolio' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- Fidelity Target Allocation Index-Focused 50/50 Model Portfolio
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'Fidelity Target Allocation Index-Focused 50/50 Model Portfolio', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'Fidelity Target Allocation Index-Focused 50/50 Model Portfolio' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'FXAIX' AS symbol, 3200 AS weight_bps
    UNION ALL SELECT 1 AS position, 'FSSNX' AS symbol, 300 AS weight_bps
    UNION ALL SELECT 2 AS position, 'FSGGX' AS symbol, 1500 AS weight_bps
    UNION ALL SELECT 3 AS position, 'FXNAX' AS symbol, 4000 AS weight_bps
    UNION ALL SELECT 4 AS position, 'FCNYX' AS symbol, 800 AS weight_bps
    UNION ALL SELECT 5 AS position, 'CASH' AS symbol, 200 AS weight_bps
) v
WHERE m.name = 'Fidelity Target Allocation Index-Focused 50/50 Model Portfolio' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- Fidelity Target Allocation Index-Focused 60/40 Model Portfolio
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'Fidelity Target Allocation Index-Focused 60/40 Model Portfolio', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'Fidelity Target Allocation Index-Focused 60/40 Model Portfolio' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'FXNAX' AS symbol, 3500 AS weight_bps
    UNION ALL SELECT 1 AS position, 'FCNYX' AS symbol, 300 AS weight_bps
    UNION ALL SELECT 2 AS position, 'FSGGX' AS symbol, 1800 AS weight_bps
    UNION ALL SELECT 3 AS position, 'FXAIX' AS symbol, 3700 AS weight_bps
    UNION ALL SELECT 4 AS position, 'FSSNX' AS symbol, 300 AS weight_bps
    UNION ALL SELECT 5 AS position, 'FSMDX' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 6 AS position, 'CASH' AS symbol, 200 AS weight_bps
) v
WHERE m.name = 'Fidelity Target Allocation Index-Focused 60/40 Model Portfolio' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- Fidelity Target Allocation 85/15 (I) Model Portfolio
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'Fidelity Target Allocation 85/15 (I) Model Portfolio', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'Fidelity Target Allocation 85/15 (I) Model Portfolio' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'FXAIX' AS symbol, 1400 AS weight_bps
    UNION ALL SELECT 1 AS position, 'FTRIX' AS symbol, 800 AS weight_bps
    UNION ALL SELECT 2 AS position, 'FLCOX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 3 AS position, 'FVDNX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 4 AS position, 'FSPGX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 5 AS position, 'FNCMX' AS symbol, 1000 AS weight_bps
    UNION ALL SELECT 6 AS position, 'FSFNX' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 7 AS position, 'FOTHX' AS symbol, 400 AS weight_bps
    UNION ALL SELECT 8 AS position, 'FIIMX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 9 AS position, 'FIMVX' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 10 AS position, 'FIVQX' AS symbol, 900 AS weight_bps
    UNION ALL SELECT 11 AS position, 'FSGGX' AS symbol, 1400 AS weight_bps
    UNION ALL SELECT 12 AS position, 'FTEIX' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 13 AS position, 'FEPIX' AS symbol, 700 AS weight_bps
    UNION ALL SELECT 14 AS position, 'FUAMX' AS symbol, 600 AS weight_bps
    UNION ALL SELECT 15 AS position, 'CASH' AS symbol, 200 AS weight_bps
) v
WHERE m.name = 'Fidelity Target Allocation 85/15 (I) Model Portfolio' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- American Funds Tax-Aware Moderate Growth and Income Model Portfolio
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'American Funds Tax-Aware Moderate Growth and Income Model Portfolio', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'American Funds Tax-Aware Moderate Growth and Income Model Portfolio' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'CGGO' AS symbol, 800 AS weight_bps
    UNION ALL SELECT 1 AS position, 'CGDG' AS symbol, 700 AS weight_bps
    UNION ALL SELECT 2 AS position, 'CGGE' AS symbol, 1400 AS weight_bps
    UNION ALL SELECT 3 AS position, 'CGNG' AS symbol, 300 AS weight_bps
    UNION ALL SELECT 4 AS position, 'CGUS' AS symbol, 1500 AS weight_bps
    UNION ALL SELECT 5 AS position, 'CGDV' AS symbol, 1500 AS weight_bps
    UNION ALL SELECT 6 AS position, 'CGMM' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 7 AS position, 'CGMU' AS symbol, 1500 AS weight_bps
    UNION ALL SELECT 8 AS position, 'CGHM' AS symbol, 1800 AS weight_bps
) v
WHERE m.name = 'American Funds Tax-Aware Moderate Growth and Income Model Portfolio' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- American Funds Moderate Growth Model Portfolio
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'American Funds Moderate Growth Model Portfolio', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'American Funds Moderate Growth Model Portfolio' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'AMCFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 1 AS position, 'GFFFX' AS symbol, 1500 AS weight_bps
    UNION ALL SELECT 2 AS position, 'FINFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 3 AS position, 'ICAFX' AS symbol, 800 AS weight_bps
    UNION ALL SELECT 4 AS position, 'WMFFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 5 AS position, 'AGVGX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 6 AS position, 'WGIFX' AS symbol, 1500 AS weight_bps
    UNION ALL SELECT 7 AS position, 'SMCFX' AS symbol, 1000 AS weight_bps
    UNION ALL SELECT 8 AS position, 'NFFFX' AS symbol, 400 AS weight_bps
    UNION ALL SELECT 9 AS position, 'AMBFX' AS symbol, 1300 AS weight_bps
    UNION ALL SELECT 10 AS position, 'GBLFX' AS symbol, 1300 AS weight_bps
    UNION ALL SELECT 11 AS position, 'EBNFX' AS symbol, 200 AS weight_bps
) v
WHERE m.name = 'American Funds Moderate Growth Model Portfolio' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- American Funds Retirement Income Model Portfolio - Enhanced
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'American Funds Retirement Income Model Portfolio - Enhanced', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'American Funds Retirement Income Model Portfolio - Enhanced' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'AMCFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 1 AS position, 'AMRFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 2 AS position, 'WGIFX' AS symbol, 600 AS weight_bps
    UNION ALL SELECT 3 AS position, 'IGFFX' AS symbol, 400 AS weight_bps
    UNION ALL SELECT 4 AS position, 'CAIFX' AS symbol, 2000 AS weight_bps
    UNION ALL SELECT 5 AS position, 'GBLFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 6 AS position, 'AMEFX' AS symbol, 1600 AS weight_bps
    UNION ALL SELECT 7 AS position, 'AMBFX' AS symbol, 2000 AS weight_bps
    UNION ALL SELECT 8 AS position, 'MIAYX' AS symbol, 900 AS weight_bps
    UNION ALL SELECT 9 AS position, 'AHIFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 10 AS position, 'ABNFX' AS symbol, 500 AS weight_bps
) v
WHERE m.name = 'American Funds Retirement Income Model Portfolio - Enhanced' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- American Funds Retirement Income Model Portfolio - Moderate
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'American Funds Retirement Income Model Portfolio - Moderate', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'American Funds Retirement Income Model Portfolio - Moderate' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'AMRFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 1 AS position, 'WGIFX' AS symbol, 700 AS weight_bps
    UNION ALL SELECT 2 AS position, 'CAIFX' AS symbol, 1800 AS weight_bps
    UNION ALL SELECT 3 AS position, 'GBLFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 4 AS position, 'AMEFX' AS symbol, 2000 AS weight_bps
    UNION ALL SELECT 5 AS position, 'AMBFX' AS symbol, 1500 AS weight_bps
    UNION ALL SELECT 6 AS position, 'MIAYX' AS symbol, 900 AS weight_bps
    UNION ALL SELECT 7 AS position, 'ANBFX' AS symbol, 600 AS weight_bps
    UNION ALL SELECT 8 AS position, 'ABNFX' AS symbol, 800 AS weight_bps
    UNION ALL SELECT 9 AS position, 'GVTFX' AS symbol, 700 AS weight_bps
) v
WHERE m.name = 'American Funds Retirement Income Model Portfolio - Moderate' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- First Trust All Equity
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'First Trust All Equity', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'First Trust All Equity' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'FTGS' AS symbol, 900 AS weight_bps
    UNION ALL SELECT 1 AS position, 'FTCS' AS symbol, 600 AS weight_bps
    UNION ALL SELECT 2 AS position, 'AFLG' AS symbol, 1100 AS weight_bps
    UNION ALL SELECT 3 AS position, 'FVD' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 4 AS position, 'FTA' AS symbol, 850 AS weight_bps
    UNION ALL SELECT 5 AS position, 'RDVY' AS symbol, 800 AS weight_bps
    UNION ALL SELECT 6 AS position, 'TDIV' AS symbol, 900 AS weight_bps
    UNION ALL SELECT 7 AS position, 'QTEC' AS symbol, 700 AS weight_bps
    UNION ALL SELECT 8 AS position, 'FDN' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 9 AS position, 'FTXO' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 10 AS position, 'FAI' AS symbol, 300 AS weight_bps
    UNION ALL SELECT 11 AS position, 'FXH' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 12 AS position, 'FXR' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 13 AS position, 'FDT' AS symbol, 700 AS weight_bps
    UNION ALL SELECT 14 AS position, 'FEP' AS symbol, 450 AS weight_bps
    UNION ALL SELECT 15 AS position, 'FJP' AS symbol, 400 AS weight_bps
    UNION ALL SELECT 16 AS position, 'FEM' AS symbol, 700 AS weight_bps
) v
WHERE m.name = 'First Trust All Equity' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- First Trust Aggressive Growth
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'First Trust Aggressive Growth', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'First Trust Aggressive Growth' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'FTA' AS symbol, 700 AS weight_bps
    UNION ALL SELECT 1 AS position, 'FVD' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 2 AS position, 'RDVY' AS symbol, 700 AS weight_bps
    UNION ALL SELECT 3 AS position, 'FTCS' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 4 AS position, 'FTGS' AS symbol, 750 AS weight_bps
    UNION ALL SELECT 5 AS position, 'AFLG' AS symbol, 950 AS weight_bps
    UNION ALL SELECT 6 AS position, 'FDN' AS symbol, 250 AS weight_bps
    UNION ALL SELECT 7 AS position, 'TDIV' AS symbol, 750 AS weight_bps
    UNION ALL SELECT 8 AS position, 'QTEC' AS symbol, 750 AS weight_bps
    UNION ALL SELECT 9 AS position, 'FTXO' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 10 AS position, 'FAI' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 11 AS position, 'FXH' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 12 AS position, 'FXR' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 13 AS position, 'FEP' AS symbol, 350 AS weight_bps
    UNION ALL SELECT 14 AS position, 'FDT' AS symbol, 550 AS weight_bps
    UNION ALL SELECT 15 AS position, 'FJP' AS symbol, 350 AS weight_bps
    UNION ALL SELECT 16 AS position, 'FEM' AS symbol, 600 AS weight_bps
    UNION ALL SELECT 17 AS position, 'LALT' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 18 AS position, 'FIXD' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 19 AS position, 'FTCB' AS symbol, 500 AS weight_bps
) v
WHERE m.name = 'First Trust Aggressive Growth' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- First Trust Moderate Growth
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'First Trust Moderate Growth', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'First Trust Moderate Growth' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'FTA' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 1 AS position, 'FVD' AS symbol, 250 AS weight_bps
    UNION ALL SELECT 2 AS position, 'RDVY' AS symbol, 550 AS weight_bps
    UNION ALL SELECT 3 AS position, 'FTCS' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 4 AS position, 'FTGS' AS symbol, 600 AS weight_bps
    UNION ALL SELECT 5 AS position, 'AFLG' AS symbol, 800 AS weight_bps
    UNION ALL SELECT 6 AS position, 'FDN' AS symbol, 300 AS weight_bps
    UNION ALL SELECT 7 AS position, 'TDIV' AS symbol, 800 AS weight_bps
    UNION ALL SELECT 8 AS position, 'QTEC' AS symbol, 450 AS weight_bps
    UNION ALL SELECT 9 AS position, 'FTXO' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 10 AS position, 'FAI' AS symbol, 250 AS weight_bps
    UNION ALL SELECT 11 AS position, 'FXH' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 12 AS position, 'FXR' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 13 AS position, 'FEP' AS symbol, 250 AS weight_bps
    UNION ALL SELECT 14 AS position, 'FDT' AS symbol, 400 AS weight_bps
    UNION ALL SELECT 15 AS position, 'FJP' AS symbol, 300 AS weight_bps
    UNION ALL SELECT 16 AS position, 'FEM' AS symbol, 450 AS weight_bps
    UNION ALL SELECT 17 AS position, 'LALT' AS symbol, 1000 AS weight_bps
    UNION ALL SELECT 18 AS position, 'FIXD' AS symbol, 300 AS weight_bps
    UNION ALL SELECT 19 AS position, 'FIIG' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 20 AS position, 'FTCB' AS symbol, 1200 AS weight_bps
) v
WHERE m.name = 'First Trust Moderate Growth' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- First Trust Balanced Growth
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'First Trust Balanced Growth', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'First Trust Balanced Growth' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'FTA' AS symbol, 400 AS weight_bps
    UNION ALL SELECT 1 AS position, 'FVD' AS symbol, 250 AS weight_bps
    UNION ALL SELECT 2 AS position, 'RDVY' AS symbol, 550 AS weight_bps
    UNION ALL SELECT 3 AS position, 'FTCS' AS symbol, 450 AS weight_bps
    UNION ALL SELECT 4 AS position, 'FTGS' AS symbol, 400 AS weight_bps
    UNION ALL SELECT 5 AS position, 'AFLG' AS symbol, 550 AS weight_bps
    UNION ALL SELECT 6 AS position, 'FDN' AS symbol, 250 AS weight_bps
    UNION ALL SELECT 7 AS position, 'TDIV' AS symbol, 800 AS weight_bps
    UNION ALL SELECT 8 AS position, 'FAI' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 9 AS position, 'FXR' AS symbol, 150 AS weight_bps
    UNION ALL SELECT 10 AS position, 'FEP' AS symbol, 300 AS weight_bps
    UNION ALL SELECT 11 AS position, 'FDT' AS symbol, 150 AS weight_bps
    UNION ALL SELECT 12 AS position, 'FJP' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 13 AS position, 'FEM' AS symbol, 350 AS weight_bps
    UNION ALL SELECT 14 AS position, 'LALT' AS symbol, 1200 AS weight_bps
    UNION ALL SELECT 15 AS position, 'FSIG' AS symbol, 400 AS weight_bps
    UNION ALL SELECT 16 AS position, 'FIXD' AS symbol, 600 AS weight_bps
    UNION ALL SELECT 17 AS position, 'FIIG' AS symbol, 600 AS weight_bps
    UNION ALL SELECT 18 AS position, 'LGOV' AS symbol, 300 AS weight_bps
    UNION ALL SELECT 19 AS position, 'FTCB' AS symbol, 1900 AS weight_bps
) v
WHERE m.name = 'First Trust Balanced Growth' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- First Trust Conservative Growth
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'First Trust Conservative Growth', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'First Trust Conservative Growth' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'FTA' AS symbol, 300 AS weight_bps
    UNION ALL SELECT 1 AS position, 'FVD' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 2 AS position, 'RDVY' AS symbol, 300 AS weight_bps
    UNION ALL SELECT 3 AS position, 'FTCS' AS symbol, 400 AS weight_bps
    UNION ALL SELECT 4 AS position, 'FTGS' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 5 AS position, 'AFLG' AS symbol, 400 AS weight_bps
    UNION ALL SELECT 6 AS position, 'TDIV' AS symbol, 700 AS weight_bps
    UNION ALL SELECT 7 AS position, 'FDT' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 8 AS position, 'FEM' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 9 AS position, 'LALT' AS symbol, 1000 AS weight_bps
    UNION ALL SELECT 10 AS position, 'LMBS' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 11 AS position, 'FSIG' AS symbol, 250 AS weight_bps
    UNION ALL SELECT 12 AS position, 'FIXD' AS symbol, 600 AS weight_bps
    UNION ALL SELECT 13 AS position, 'FIIG' AS symbol, 1300 AS weight_bps
    UNION ALL SELECT 14 AS position, 'LGOV' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 15 AS position, 'FTCB' AS symbol, 2350 AS weight_bps
) v
WHERE m.name = 'First Trust Conservative Growth' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- American Funds Growth and Income Model Portfolio
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'American Funds Growth and Income Model Portfolio', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'American Funds Growth and Income Model Portfolio' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'AGVGX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 1 AS position, 'WGIFX' AS symbol, 1500 AS weight_bps
    UNION ALL SELECT 2 AS position, 'SMCFX' AS symbol, 800 AS weight_bps
    UNION ALL SELECT 3 AS position, 'NFFFX' AS symbol, 300 AS weight_bps
    UNION ALL SELECT 4 AS position, 'GFFFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 5 AS position, 'ICAFX' AS symbol, 1200 AS weight_bps
    UNION ALL SELECT 6 AS position, 'FINFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 7 AS position, 'WMFFX' AS symbol, 1000 AS weight_bps
    UNION ALL SELECT 8 AS position, 'CAIFX' AS symbol, 1000 AS weight_bps
    UNION ALL SELECT 9 AS position, 'AMBFX' AS symbol, 1000 AS weight_bps
    UNION ALL SELECT 10 AS position, 'MIAYX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 11 AS position, 'ANBFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 12 AS position, 'ABNFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 13 AS position, 'EBNFX' AS symbol, 200 AS weight_bps
) v
WHERE m.name = 'American Funds Growth and Income Model Portfolio' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- Fidelity Target Allocation Index-Focused 100/0 Model Portfolio
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'Fidelity Target Allocation Index-Focused 100/0 Model Portfolio', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'Fidelity Target Allocation Index-Focused 100/0 Model Portfolio' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'FXAIX' AS symbol, 6100 AS weight_bps
    UNION ALL SELECT 1 AS position, 'FSMDX' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 2 AS position, 'FSSNX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 3 AS position, 'FSGGX' AS symbol, 3000 AS weight_bps
    UNION ALL SELECT 4 AS position, 'CASH' AS symbol, 200 AS weight_bps
) v
WHERE m.name = 'Fidelity Target Allocation Index-Focused 100/0 Model Portfolio' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- Fidelity Target Allocation Index-Focused 100/0 Model Portfolio & American Funds Growth Model Portfolio
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'Fidelity Target Allocation Index-Focused 100/0 Model Portfolio & American Funds Growth Model Portfolio', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'Fidelity Target Allocation Index-Focused 100/0 Model Portfolio & American Funds Growth Model Portfolio' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'AMCFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 1 AS position, 'GFFFX' AS symbol, 1050 AS weight_bps
    UNION ALL SELECT 2 AS position, 'FINFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 3 AS position, 'ICAFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 4 AS position, 'FXAIX' AS symbol, 3050 AS weight_bps
    UNION ALL SELECT 5 AS position, 'WMFFX' AS symbol, 250 AS weight_bps
    UNION ALL SELECT 6 AS position, 'FSMDX' AS symbol, 100 AS weight_bps
    UNION ALL SELECT 7 AS position, 'FSSNX' AS symbol, 250 AS weight_bps
    UNION ALL SELECT 8 AS position, 'NEFFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 9 AS position, 'ANWFX' AS symbol, 750 AS weight_bps
    UNION ALL SELECT 10 AS position, 'NFFFX' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 11 AS position, 'SMCFX' AS symbol, 750 AS weight_bps
    UNION ALL SELECT 12 AS position, 'FSGGX' AS symbol, 1500 AS weight_bps
    UNION ALL SELECT 13 AS position, 'CASH' AS symbol, 100 AS weight_bps
) v
WHERE m.name = 'Fidelity Target Allocation Index-Focused 100/0 Model Portfolio & American Funds Growth Model Portfolio' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- JPMorgan Tactical 60/40 Model
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'JPMorgan Tactical 60/40 Model', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'JPMorgan Tactical 60/40 Model' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'BBUS' AS symbol, 1925 AS weight_bps
    UNION ALL SELECT 1 AS position, 'JUESX' AS symbol, 475 AS weight_bps
    UNION ALL SELECT 2 AS position, 'JUSA' AS symbol, 875 AS weight_bps
    UNION ALL SELECT 3 AS position, 'SEEGX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 4 AS position, 'HLQVX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 5 AS position, 'XLC' AS symbol, 100 AS weight_bps
    UNION ALL SELECT 6 AS position, 'XLK' AS symbol, 100 AS weight_bps
    UNION ALL SELECT 7 AS position, 'JIRE' AS symbol, 650 AS weight_bps
    UNION ALL SELECT 8 AS position, 'JIG' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 9 AS position, 'JIVE' AS symbol, 300 AS weight_bps
    UNION ALL SELECT 10 AS position, 'BBJP' AS symbol, 150 AS weight_bps
    UNION ALL SELECT 11 AS position, 'EMREX' AS symbol, 275 AS weight_bps
    UNION ALL SELECT 12 AS position, 'JEMSX' AS symbol, 250 AS weight_bps
    UNION ALL SELECT 13 AS position, 'HLIPX' AS symbol, 1325 AS weight_bps
    UNION ALL SELECT 14 AS position, 'JBND' AS symbol, 1725 AS weight_bps
    UNION ALL SELECT 15 AS position, 'JMSIX' AS symbol, 250 AS weight_bps
    UNION ALL SELECT 16 AS position, 'BBHY' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 17 AS position, 'CASH' AS symbol, 200 AS weight_bps
) v
WHERE m.name = 'JPMorgan Tactical 60/40 Model' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- JPMorgan Tactical 100/0 Model
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'JPMorgan Tactical 100/0 Model', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'JPMorgan Tactical 100/0 Model' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'BBUS' AS symbol, 3425 AS weight_bps
    UNION ALL SELECT 1 AS position, 'JUESX' AS symbol, 750 AS weight_bps
    UNION ALL SELECT 2 AS position, 'JUSA' AS symbol, 1125 AS weight_bps
    UNION ALL SELECT 3 AS position, 'SEEGX' AS symbol, 775 AS weight_bps
    UNION ALL SELECT 4 AS position, 'HLQVX' AS symbol, 775 AS weight_bps
    UNION ALL SELECT 5 AS position, 'XLC' AS symbol, 100 AS weight_bps
    UNION ALL SELECT 6 AS position, 'XLK' AS symbol, 100 AS weight_bps
    UNION ALL SELECT 7 AS position, 'JIRE' AS symbol, 1125 AS weight_bps
    UNION ALL SELECT 8 AS position, 'JIG' AS symbol, 250 AS weight_bps
    UNION ALL SELECT 9 AS position, 'JIVE' AS symbol, 350 AS weight_bps
    UNION ALL SELECT 10 AS position, 'BBJP' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 11 AS position, 'EMREX' AS symbol, 400 AS weight_bps
    UNION ALL SELECT 12 AS position, 'JEMSX' AS symbol, 425 AS weight_bps
    UNION ALL SELECT 13 AS position, 'CASH' AS symbol, 200 AS weight_bps
) v
WHERE m.name = 'JPMorgan Tactical 100/0 Model' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- American Funds Tax-Aware Moderate Growth and Income Model Portfolio & Target Allocation ESG 40/60
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'American Funds Tax-Aware Moderate Growth and Income Model Portfolio & Target Allocation ESG 40/60', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'American Funds Tax-Aware Moderate Growth and Income Model Portfolio & Target Allocation ESG 40/60' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'CGDV' AS symbol, 1000 AS weight_bps
    UNION ALL SELECT 1 AS position, 'CGUS' AS symbol, 750 AS weight_bps
    UNION ALL SELECT 2 AS position, 'DSI' AS symbol, 450 AS weight_bps
    UNION ALL SELECT 3 AS position, 'ESGU' AS symbol, 175 AS weight_bps
    UNION ALL SELECT 4 AS position, 'LCTU' AS symbol, 625 AS weight_bps
    UNION ALL SELECT 5 AS position, 'USXF' AS symbol, 450 AS weight_bps
    UNION ALL SELECT 6 AS position, 'CGGO' AS symbol, 250 AS weight_bps
    UNION ALL SELECT 7 AS position, 'CGDG' AS symbol, 250 AS weight_bps
    UNION ALL SELECT 8 AS position, 'FWGIX' AS symbol, 750 AS weight_bps
    UNION ALL SELECT 9 AS position, 'LCTD' AS symbol, 175 AS weight_bps
    UNION ALL SELECT 10 AS position, 'DMXF' AS symbol, 175 AS weight_bps
    UNION ALL SELECT 11 AS position, 'ESGE' AS symbol, 150 AS weight_bps
    UNION ALL SELECT 12 AS position, 'SFCWX' AS symbol, 250 AS weight_bps
    UNION ALL SELECT 13 AS position, 'CGMU' AS symbol, 750 AS weight_bps
    UNION ALL SELECT 14 AS position, 'SUSB' AS symbol, 75 AS weight_bps
    UNION ALL SELECT 15 AS position, 'EAGG' AS symbol, 700 AS weight_bps
    UNION ALL SELECT 16 AS position, 'EUSB' AS symbol, 900 AS weight_bps
    UNION ALL SELECT 17 AS position, 'SUSC' AS symbol, 1025 AS weight_bps
    UNION ALL SELECT 18 AS position, 'HIMFX' AS symbol, 1000 AS weight_bps
    UNION ALL SELECT 19 AS position, 'CASH' AS symbol, 100 AS weight_bps
) v
WHERE m.name = 'American Funds Tax-Aware Moderate Growth and Income Model Portfolio & Target Allocation ESG 40/60' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- JPMorgan 100/0 Tactical & American Funds Growth Model
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'JPMorgan 100/0 Tactical & American Funds Growth Model', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'JPMorgan 100/0 Tactical & American Funds Growth Model' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'AMCFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 1 AS position, 'GFFFX' AS symbol, 1050 AS weight_bps
    UNION ALL SELECT 2 AS position, 'FINFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 3 AS position, 'ICAFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 4 AS position, 'WMFFX' AS symbol, 250 AS weight_bps
    UNION ALL SELECT 5 AS position, 'NEFFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 6 AS position, 'ANWFX' AS symbol, 750 AS weight_bps
    UNION ALL SELECT 7 AS position, 'NFFFX' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 8 AS position, 'SMCFX' AS symbol, 750 AS weight_bps
    UNION ALL SELECT 9 AS position, 'BBUS' AS symbol, 1713 AS weight_bps
    UNION ALL SELECT 10 AS position, 'JUESX' AS symbol, 375 AS weight_bps
    UNION ALL SELECT 11 AS position, 'JUSA' AS symbol, 563 AS weight_bps
    UNION ALL SELECT 12 AS position, 'SEEGX' AS symbol, 388 AS weight_bps
    UNION ALL SELECT 13 AS position, 'HLQVX' AS symbol, 387 AS weight_bps
    UNION ALL SELECT 14 AS position, 'XLC' AS symbol, 50 AS weight_bps
    UNION ALL SELECT 15 AS position, 'XLK' AS symbol, 50 AS weight_bps
    UNION ALL SELECT 16 AS position, 'JIRE' AS symbol, 562 AS weight_bps
    UNION ALL SELECT 17 AS position, 'JIG' AS symbol, 125 AS weight_bps
    UNION ALL SELECT 18 AS position, 'JIVE' AS symbol, 175 AS weight_bps
    UNION ALL SELECT 19 AS position, 'BBJP' AS symbol, 100 AS weight_bps
    UNION ALL SELECT 20 AS position, 'EMREX' AS symbol, 200 AS weight_bps
    UNION ALL SELECT 21 AS position, 'JEMSX' AS symbol, 212 AS weight_bps
    UNION ALL SELECT 22 AS position, 'CASH' AS symbol, 100 AS weight_bps
) v
WHERE m.name = 'JPMorgan 100/0 Tactical & American Funds Growth Model' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

-- Faith Based Model
INSERT INTO model_portfolios (name, tax_funnel, updated_at)
SELECT 'Faith Based Model', NULL, '2026-10-26T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM model_portfolios WHERE name = 'Faith Based Model' COLLATE NOCASE);
INSERT INTO model_lines (model_id, position, ticker_symbol, weight_bps)
SELECT m.id, v.position, v.symbol, v.weight_bps
FROM model_portfolios m, (
    SELECT 0 AS position, 'ESUM' AS symbol, 750 AS weight_bps
    UNION ALL SELECT 1 AS position, 'ETLIX' AS symbol, 400 AS weight_bps
    UNION ALL SELECT 2 AS position, 'AVEDX' AS symbol, 750 AS weight_bps
    UNION ALL SELECT 3 AS position, 'ELCV' AS symbol, 800 AS weight_bps
    UNION ALL SELECT 4 AS position, 'ETIDX' AS symbol, 700 AS weight_bps
    UNION ALL SELECT 5 AS position, 'AVERX' AS symbol, 400 AS weight_bps
    UNION ALL SELECT 6 AS position, 'ETILX' AS symbol, 700 AS weight_bps
    UNION ALL SELECT 7 AS position, 'ETIHX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 8 AS position, 'ETIMX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 9 AS position, 'AVEFX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 10 AS position, 'ETIBX' AS symbol, 500 AS weight_bps
    UNION ALL SELECT 11 AS position, 'ETIRX' AS symbol, 3000 AS weight_bps
    UNION ALL SELECT 12 AS position, 'AVEAX' AS symbol, 500 AS weight_bps
) v
WHERE m.name = 'Faith Based Model' COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM model_lines WHERE model_id = m.id);

