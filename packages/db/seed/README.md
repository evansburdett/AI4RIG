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
  number (`RIG-0001`). This holds for seed data, tests, and fixtures alike —
  see `docs/decisions/0006-no-pii-anywhere.md`.
- **Money is integer cents.** `250000` is $2,500.00.
- Seeds must be re-runnable against a freshly migrated database. Use explicit
  primary keys and `INSERT OR REPLACE` so `db:seed` twice is not an error.
- Naming follows the migrations: `0001_sample_clients.sql`.

Nothing here yet — the schema does not exist. It is the team's to design.
