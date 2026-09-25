-- Two sample client cases. Client numbers and initials are invented. The
-- figures on case 1042 come from RIG's Bucket Plan Deliverable workbook:
-- $3,000,000 investable, and the accounts are split so the buckets land
-- exactly on the worksheet's $190,000 / $914,700 / $1,895,300. Case 2317 is an
-- early accumulator whose split is deliberately off target, with $15,000 not
-- yet placed in any bucket and one slice with no model chosen.
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

INSERT OR REPLACE INTO people (id, client_case_id, role, birth_year, health_concern, life_expectancy_age) VALUES
    (9001, 9001, 'CLIENT', 1960, 'NONE',  88),
    (9002, 9001, 'SPOUSE', 1963, 'HEART', 85),
    (9003, 9002, 'CLIENT', 1988, 'NONE',  90);

INSERT OR REPLACE INTO accounts (id, client_case_id, position, account_type, tax_funnel, masked_number, balance_cents) VALUES
    (9001, 9001, 0, 'JOINT',    'TAXABLE',  '4417', 120000000),
    (9002, 9001, 1, 'IRA',      'PRE_TAX',  '8830', 150000000),
    (9003, 9001, 2, 'ROTH_IRA', 'TAX_FREE', '2291',  30000000),
    (9004, 9002, 0, 'SINGLE',   'TAXABLE',  '1005',  28000000),
    (9005, 9002, 1, 'ROTH_IRA', 'TAX_FREE', '7742',  24000000);

INSERT OR REPLACE INTO account_sleeves (account_id, bucket, amount_cents, model_id) VALUES
    -- 1042: Now 190,000 / Soon 400,000 + 514,700 / Later 610,000 + 985,300 + 300,000
    (9001, 'NOW',    19000000, 9001),
    (9001, 'SOON',   40000000, 9002),
    (9001, 'LATER',  61000000, 9003),
    (9002, 'NOW',           0, NULL),
    (9002, 'SOON',   51470000, 9002),
    (9002, 'LATER',  98530000, 9003),
    (9003, 'NOW',           0, NULL),
    (9003, 'SOON',          0, NULL),
    (9003, 'LATER',  30000000, 9004),
    -- 2317: $15,000 of the Single account is not in any bucket yet, and the
    -- Roth's Soon money has no model chosen.
    (9004, 'NOW',     2500000, 9001),
    (9004, 'SOON',          0, NULL),
    (9004, 'LATER',  24000000, 9003),
    (9005, 'NOW',           0, NULL),
    (9005, 'SOON',    6000000, NULL),
    (9005, 'LATER',  18000000, 9004);

INSERT OR REPLACE INTO planned_expenses (id, client_case_id, kind, position, label, cost_cents) VALUES
    (9001, 9001, 'NOW_PLANNED',        0, 'Roof replacement', 4000000),
    (9002, 9001, 'SOON_MISCELLANEOUS', 0, 'Boat',             5000000);

INSERT OR REPLACE INTO gap_entries (id, client_case_id, kind, position, label, annual_amount_cents, years, multiplier) VALUES
    (9001, 9001, 'SOCIAL_SECURITY_BRIDGE', 0, 'Client', 3840000, 3,   1),
    (9002, 9001, 'SOCIAL_SECURITY_BRIDGE', 1, 'Spouse', 1800000, 1.5, 1);
