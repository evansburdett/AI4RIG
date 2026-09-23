-- Two sample client cases. Client numbers and initials are invented. The
-- figures on case 1042 come from RIG's workbook so the screens can be checked
-- against it; case 2317 is an early accumulator.
--
-- These are the same two cases as apps/web/src/fixtures/clients.ts, which the
-- front-end unit tests use. Keep them in step if you change either.
--
-- Explicit ids in the 9000s keep these clear of cases you create by hand, and
-- INSERT OR REPLACE makes "npm run db:seed" safe to run twice. Replacing a case
-- cascades to its children, which are then re-inserted below.

INSERT OR REPLACE INTO client_cases (
    id, client_number, plan_number, initials, money_cycle_phase, life_stage,
    cash_on_hand_cents, spare_tire_cents,
    monthly_income_draw_cents, income_draw_months, bank_reserve_cents,
    annual_income_gap_cents, income_gap_years, conservative_reserve_cents,
    created_at, updated_at
) VALUES
    (9001, '1042', 1, 'A.B.', 'DISTRIBUTION', 'DISTRIBUTION_GO_GO',
     8500000, 2500000,
     500000, 10, 10000000,
     6000000, 10, 10000000,
     '2026-09-15T14:02:00.000Z', '2026-09-15T14:02:00.000Z'),
    (9002, '2317', 1, 'C.D.', 'ACCUMULATION', 'ACCUMULATION_PEAK_EARNINGS',
     4000000, 1000000,
     0, 12, 3000000,
     0, 10, 7500000,
     '2026-09-11T09:20:00.000Z', '2026-09-11T09:20:00.000Z');

INSERT OR REPLACE INTO people (id, client_case_id, role, birth_year, health_concern, life_expectancy_age) VALUES
    (9001, 9001, 'CLIENT', 1960, 'NONE',  88),
    (9002, 9001, 'SPOUSE', 1963, 'HEART', 85),
    (9003, 9002, 'CLIENT', 1988, 'NONE',  90);

INSERT OR REPLACE INTO accounts (id, client_case_id, position, account_type, masked_number) VALUES
    (9001, 9001, 0, 'JOINT',    '4417'),
    (9002, 9001, 1, 'IRA',      '8830'),
    (9003, 9001, 2, 'ROTH_IRA', '2291'),
    (9004, 9002, 0, 'SINGLE',   '1005'),
    (9005, 9002, 1, 'ROTH_IRA', '7742');

INSERT OR REPLACE INTO holdings (id, account_id, position, ticker_symbol, market_value_cents, assigned_bucket) VALUES
    (9001, 9001, 0, 'SGOV', 19000000, 'NOW'),
    (9002, 9001, 1, 'BND',  40000000, 'SOON'),
    (9003, 9001, 2, 'VTI',  61000000, 'LATER'),
    (9004, 9002, 0, 'SHY',  31470000, 'SOON'),
    (9005, 9002, 1, 'VOO',  98530000, 'LATER'),
    -- Parked in Soon against its LATER default, to exercise the override badge.
    (9006, 9002, 2, 'VXUS', 20000000, 'SOON'),
    (9007, 9003, 0, 'GLD',  10000000, 'SOON'),
    (9008, 9003, 1, 'VNQ',  20000000, 'LATER'),
    (9009, 9004, 0, 'BIL',   2500000, 'NOW'),
    (9010, 9004, 1, 'VTI',  24000000, 'LATER'),
    -- Not in the placeholder universe. Exercises the unknown-symbol notice.
    (9011, 9004, 2, 'ZZZZ',  1500000, 'LATER'),
    (9012, 9005, 0, 'TIP',   6000000, 'SOON'),
    (9013, 9005, 1, 'VOO',  18000000, 'LATER');

INSERT OR REPLACE INTO planned_expenses (id, client_case_id, kind, position, label, cost_cents) VALUES
    (9001, 9001, 'NOW_PLANNED',        0, 'Roof replacement', 4000000),
    (9002, 9001, 'SOON_MISCELLANEOUS', 0, 'Boat',             5000000);

INSERT OR REPLACE INTO gap_entries (id, client_case_id, kind, position, label, annual_amount_cents, years, multiplier) VALUES
    (9001, 9001, 'SOCIAL_SECURITY_BRIDGE', 0, 'Client', 3840000, 3,   1),
    (9002, 9001, 'SOCIAL_SECURITY_BRIDGE', 1, 'Spouse', 1800000, 1.5, 1);
