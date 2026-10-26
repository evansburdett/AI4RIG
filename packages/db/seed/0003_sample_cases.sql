-- Two sample client cases. Client numbers and initials are invented. The
-- figures on case 1042 come from RIG's Bucket Plan Deliverable workbook:
-- $3,000,000 investable, and the accounts' funds land the buckets exactly on
-- the plan: the worksheet's $190,000 Now plus $30,000 of advisory fee cash
-- held in each account (US-19: $3,000,000 in all is RIG's 1.00% tier, so
-- $12,000 + $15,000 + $3,000), $910,200 Soon (with RIG's 3% inflation hedge),
-- and $1,869,800 Later. Case 2317 is an early accumulator whose funds are
-- deliberately off target, with $15,000 of one account not yet allocated.
--
-- These match apps/web/src/fixtures/clients.ts, which the front-end unit tests
-- use. Keep the two in step if you change either.
--
-- Explicit ids in the 9000s keep these clear of cases you create by hand, and
-- INSERT OR REPLACE makes "npm run db:seed" safe to run twice. Replacing a case
-- cascades to its children, which are then re-inserted below.

INSERT OR REPLACE INTO client_cases (
    id, client_number, plan_number, initials, money_cycle_phase, life_stage, tax_bracket_pct,
    cash_on_hand_cents, spare_tire_cents,
    monthly_income_draw_cents, income_draw_months, bank_reserve_cents,
    annual_income_gap_cents, income_gap_years, conservative_reserve_cents,
    created_at, updated_at
) VALUES
    (9001, '1042', 1, 'A.B.', 'DISTRIBUTION', 'DISTRIBUTION_GO_GO', 22,
     8500000, 2500000,
     500000, 10, 10000000,
     6000000, 10, 10000000,
     '2026-09-15T14:02:00.000Z', '2026-09-15T14:02:00.000Z'),
    (9002, '2317', 1, 'C.D.', 'ACCUMULATION', 'ACCUMULATION_PEAK_EARNINGS', 32,
     4000000, 1000000,
     0, 12, 3000000,
     0, 10, 7500000,
     '2026-09-11T09:20:00.000Z', '2026-09-11T09:20:00.000Z');

-- The spouse's 85 stands in for an accepted AI estimate (US-28); the others
-- were typed by the advisor.
INSERT OR REPLACE INTO people (
    id, client_case_id, role, birth_year, gender, health_concern_other,
    life_expectancy_age, life_expectancy_source
) VALUES
    (9001, 9001, 'CLIENT', 1960, 'MALE',   '',                      88, 'ADVISOR'),
    (9002, 9001, 'SPOUSE', 1963, 'FEMALE', 'Managed hypertension',  85, 'AI'),
    (9003, 9002, 'CLIENT', 1988, 'FEMALE', '',                      90, 'ADVISOR');

-- US-27: a person carries any combination of concerns, so these are rows
-- rather than a column. No rows means nothing reported. The spouse on case
-- 1042 has two, one of them the free-text OTHER above.
-- Re-running the seed replaces the people first, which cascades these away,
-- so they have to be inserted after.
INSERT OR REPLACE INTO person_health_concerns (person_id, concern) VALUES
    (9002, 'HEART'),
    (9002, 'OTHER');

INSERT OR REPLACE INTO accounts (id, client_case_id, position, account_type, tax_funnel, masked_number, balance_cents, model_id) VALUES
    (9001, 9001, 0, 'JOINT',    'TAXABLE',  '4417', 120000000, NULL),
    (9002, 9001, 1, 'IRA',      'PRE_TAX',  '8830', 150000000, NULL),
    (9003, 9001, 2, 'ROTH_IRA', 'TAX_FREE', '2291',  30000000, 9004),
    (9004, 9002, 0, 'SINGLE',   'TAXABLE',  '1005',  28000000, 9003),
    (9005, 9002, 1, 'ROTH_IRA', 'TAX_FREE', '7742',  24000000, 9004);

-- The money in each fund. Each account's advisory fee is held as cash on top
-- of these (household tier: 1.00% for 1042, 1.50% for 2317), so a fully
-- placed account's funds add up to its balance less its fee.
--
-- 1042, all placed: Now 190,000 in cash funds + 30,000 fee cash = 220,000;
-- Soon 400,000 + 510,200 = 910,200; Later 598,000 + 974,800 + 297,000 =
-- 1,869,800. The Roth is exactly the Roth growth model; the other two were
-- picked fund by fund.
INSERT OR REPLACE INTO account_lines (account_id, position, ticker_symbol, amount_cents) VALUES
    -- Joint: 1,200,000 less 12,000 fee = 1,188,000
    (9001, 0, 'SGOV', 11400000),
    (9001, 1, 'BIL',   7600000),
    (9001, 2, 'BND',  20000000),
    (9001, 3, 'SHY',  12000000),
    (9001, 4, 'TIP',   8000000),
    (9001, 5, 'VTI',  29900000),
    (9001, 6, 'VOO',  11960000),
    (9001, 7, 'VXUS', 11960000),
    (9001, 8, 'VNQ',   5980000),
    -- IRA: 1,500,000 less 15,000 fee = 1,485,000
    (9002, 0, 'BND',  25510000),
    (9002, 1, 'SHY',  15306000),
    (9002, 2, 'TIP',  10204000),
    (9002, 3, 'VTI',  48740000),
    (9002, 4, 'VOO',  19496000),
    (9002, 5, 'VXUS', 19496000),
    (9002, 6, 'VNQ',   9748000),
    -- Roth: 300,000 less 3,000 fee = 297,000, Roth growth 60/40
    (9003, 0, 'VTI',  17820000),
    (9003, 1, 'VXUS', 11880000),
    -- 2317 Single: 280,000 less 4,200 fee = 275,800; Balanced 60/40 on 260,800,
    -- leaving 15,000 still to allocate.
    (9004, 0, 'VTI',   9128000),
    (9004, 1, 'VOO',   2608000),
    (9004, 2, 'VXUS',  3912000),
    (9004, 3, 'BND',   6520000),
    (9004, 4, 'SHY',   2608000),
    (9004, 5, 'TIP',   1304000),
    -- 2317 Roth: 240,000 less 3,600 fee = 236,400, Roth growth 60/40
    (9005, 0, 'VTI',  14184000),
    (9005, 1, 'VXUS',  9456000);

INSERT OR REPLACE INTO planned_expenses (id, client_case_id, kind, position, label, cost_cents) VALUES
    (9001, 9001, 'NOW_PLANNED',        0, 'Roof replacement', 4000000),
    (9002, 9001, 'SOON_MISCELLANEOUS', 0, 'Boat',             5000000);

INSERT OR REPLACE INTO gap_entries (id, client_case_id, kind, position, label, annual_amount_cents, years, multiplier) VALUES
    (9001, 9001, 'SOCIAL_SECURITY_BRIDGE', 0, 'Client', 3840000, 3,   1),
    (9002, 9001, 'SOCIAL_SECURITY_BRIDGE', 1, 'Spouse', 1800000, 1.5, 1);
