
CREATE TABLE plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_number TEXT NOT NULL UNIQUE,
    cash_on_hand_cents INTEGER NOT NULL DEFAULT 0,
    extra_spare_tire_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL 
);

-- No names or SSNs here to follow the "No PII" rule
CREATE TABLE clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    client_number TEXT NOT NULL UNIQUE, 
    is_spouse INTEGER NOT NULL DEFAULT 0,
    year_of_birth INTEGER,
    health_concerns TEXT,
    life_expectancy_age INTEGER,
    money_cycle_phase TEXT,
    CONSTRAINT fk_plans
      FOREIGN KEY (plan_id)
      REFERENCES plans (id)
      ON DELETE CASCADE
);

-- Create a table for the different accounts (IRA, Roth, Joint, etc.)
-- Again, balances are stored in integer cents!
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    account_type TEXT NOT NULL,
    balance_cents INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT fk_plans
      FOREIGN KEY (plan_id)
      REFERENCES plans (id)
      ON DELETE CASCADE
);