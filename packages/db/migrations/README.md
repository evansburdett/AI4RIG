# Migrations

Every change to the database schema is a numbered `.sql` file in this folder.
There is no other way the schema changes — no hand-edited tables, no
`sqlite3` prompt, no "just run this on your machine."

## Naming

    NNNN_short_description.sql

Four digits, an underscore, lowercase words separated by underscores.

    0001_create_client.sql
    0002_create_bucket.sql
    0003_add_bucket_target_cents.sql

The number is the order the file is applied in, so the zero padding matters —
plain filename sort has to give the right order. The runner rejects any name
that does not match this pattern, so a typo fails immediately rather than
sorting into the wrong place.

## How the runner works

`npm run db:migrate` (also run for you by `npm run db:reset` and
`npm run setup`):

1. Creates `schema_migrations` if it does not exist.
2. Lists the `.sql` files here in filename order.
3. Skips any file already recorded in `schema_migrations`.
4. Applies each remaining file **inside a transaction**, then records the
   filename, a SHA-256 checksum of the file, and the timestamp.

Because step 3 skips what is already recorded, running it twice does nothing
the second time. Run it after every `git pull` without thinking about it.

Because step 4 is one transaction per file, a migration that fails halfway
leaves the database exactly as it was and records nothing. Fix the SQL and run
again.

## The rule: a migration on main is frozen

**Once a migration file has been merged to `main`, never edit it.** Write a new
migration instead.

Your teammates have already applied that file. Their `schema_migrations` says
it ran. Editing the file does not re-run it on their machines — it just means
their database and your database now have different shapes while both claim to
be up to date. That is the kind of bug that eats an afternoon.

The runner enforces this: it stores a checksum, and if a recorded file's
contents no longer match, `db:migrate` fails and tells you to write a new
migration.

Still iterating on a migration you have **not** pushed yet? Edit it freely and
run `npm run db:reset`, which throws your local database away and rebuilds it
from scratch. Local databases are disposable.

## Writing one

- Money is **integer cents**. `amount_cents INTEGER NOT NULL`, never `REAL`
  and never a dollars column. See `docs/decisions/0004-money-as-integer-cents.md`.
- No personally identifying information in any column. Clients are identified
  by a generated client number. See `docs/decisions/0006-no-pii-anywhere.md`.
- Declare foreign keys. The runner turns `PRAGMA foreign_keys` on, so they are
  actually enforced.
- SQLite's `ALTER TABLE` is limited — it can add a column and rename, not much
  else. To change a column's type or constraints, create the new table, copy
  the rows, drop the old table, rename. Put all of that in one migration file
  and the transaction makes it safe.
- Prefer `TEXT` for dates in ISO-8601 (`YYYY-MM-DD`), which sorts correctly.

## Checklist before you push a migration

- [ ] Filename matches `NNNN_short_description.sql` and the number is unused on
      `main` (check `git log main -- packages/db/migrations` if unsure)
- [ ] `npm run db:reset` succeeds from an empty database
- [ ] `npm run db:migrate` a second time reports "up to date"
- [ ] No `REAL`/`FLOAT` money columns, no PII
