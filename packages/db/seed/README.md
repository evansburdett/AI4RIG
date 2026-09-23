# Seed data

`.sql` files here are loaded, in filename order, by `npm run db:seed` — and by
`npm run db:reset`, right after the migrations run.

This is **development sample data**, so that everyone opens the app and sees
something rather than an empty screen. It is not a fixture library and it is
not a backup.

## Rules

- **No real client data. No personally identifying information. Ever.** Not a
  real name, not a partial one, not an address, birth date, account number, or
  anything traceable to a person. Clients are identified by a generated client
  number (`1042`). This holds for seed data, tests, and fixtures alike —
  see `docs/decisions/0006-no-pii-anywhere.md`.
- **Money is integer cents.** `250000` is $2,500.00.
- Seeds must be re-runnable against a freshly migrated database. Use explicit
  primary keys and `INSERT OR REPLACE` so `db:seed` twice is not an error.
  For rows other tables point at with `ON DELETE RESTRICT` (tickers), use
  `INSERT ... ON CONFLICT DO UPDATE` instead: REPLACE deletes first.
- Naming follows the migrations: `0001_sample_clients.sql`.

## What is here

| File | What it loads |
|---|---|
| `0001_placeholder_tickers.sql` | Ten broad ETFs standing in for RIG's approved universe until they send the Common Investments list |
| `0002_placeholder_models.sql` | Four model portfolios built from those tickers, standing in for RIG's vendor models |
| `0003_sample_cases.sql` | Two client cases (1042 and 2317). 1042 uses the figures from RIG's workbook and lands exactly on its bucket totals |

The sample cases use ids in the 9000s so they do not collide with cases you
create in the UI. The bucket definitions are not here: they live in migration
`0002` because the app needs them to exist.
