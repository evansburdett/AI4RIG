# 0005 — The calculation engine does no I/O

**Status:** Accepted · 2026-09-08

## Context

`packages/engine` holds the bucket-planning calculations — the part of this
project that has to be provably right, because it is what gets compared against
RIG's spreadsheet.

The convenient thing for a function that needs a client's accounts is to go get
them: import the database, run a query, compute. It is convenient exactly once,
and then every consequence is bad.

## Decision

**The engine is pure functions over plain data.** It takes values in and
returns values out.

Not allowed inside `packages/engine`:

- importing `@ai4rig/db` or `better-sqlite3`
- `node:fs`, `node:http`, `node:net`, `fetch`
- importing `express`
- reading `process.env`
- `Date.now()` or `new Date()` for anything that affects a result — a
  calculation that depends on "today" takes the date as a parameter

The caller — an API route — reads what it needs from SQLite and passes it in.

ESLint enforces the import and global restrictions; the rule lives in
`eslint.config.mjs` and points back at this file. The rest is review's job
(see `CONTRIBUTING.md`).

## Consequences

- **Testing against the spreadsheet is trivial.** A test is a literal input and
  an expected output. No database to set up, no fixtures to load, no ordering
  between suites. When an advisor sends a case where the numbers disagree, it
  becomes a test case in about a minute.
- **Failures are unambiguous.** A wrong number is a wrong function, not a
  question of what the database happened to contain.
- **The same code runs unchanged inside Electron**, in a worker, or in a test
  harness, because it has no environment to depend on.
- The API carries more weight: routes are responsible for gathering data and
  assembling the arguments. That is the right place for it — reading the
  database is exactly what the API layer is for.
- Some calls end up with long argument lists. When that happens the fix is to
  group them into a named input type, not to hand the engine a database
  connection.

## Alternatives considered

**Engine queries the database directly.** Fastest to write, and it makes the
engine untestable without a database and unusable anywhere else. Rejected.

**Dependency injection — pass a repository interface into the engine.** Better
than a direct import, but it still makes the engine asynchronous and still
requires a fake to test. Rejected: the engine's inputs are small enough to pass
as data, so there is nothing to gain by making it a caller of anything.
