-- From the 11/2 meeting with RIG.
--
--   accounts.model_filled_at  When the account's funds were last filled from
--                             its model. A model saved after this is a model
--                             the account has not caught up with, which the
--                             account shows as "Model updated". NULL for an
--                             account filled before this column existed.
--   app_settings              Per-computer settings the advisor can change:
--                             the cash and drift thresholds behind the alerts.
--   client_reports            Each bucket report as it was generated, kept
--                             unchanged so an earlier quarter can be reread.
--                             The body is the report's own numbers as JSON,
--                             not a copy of the case.

ALTER TABLE accounts ADD COLUMN model_filled_at TEXT;

CREATE TABLE app_settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);

CREATE TABLE client_reports (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    client_case_id  INTEGER NOT NULL REFERENCES client_cases (id) ON DELETE CASCADE,
    created_at      TEXT    NOT NULL,
    body            TEXT    NOT NULL CHECK (length(body) <= 500000)
);

CREATE INDEX client_reports_client_case_id ON client_reports (client_case_id);
