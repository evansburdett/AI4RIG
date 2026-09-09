# 0002 — SQLite in development, test, and production; no Docker

**Status:** Accepted · 2026-09-08
**Replaces:** the `docker-compose.yml` Postgres + Adminer setup from the
initial scaffold, now deleted.

## Context

The original scaffold ran Postgres 16 in Docker for development. That is the
default choice for a web project and it is the wrong one here.

Production for AI4RIG is **SQLite embedded inside an Electron application**.
RIG has around eight employees and no IT staff. Nobody there is going to
install, back up, patch, or restart a database server. The deployment design
(see `docs/uml/src/07_deployment.puml`) is one designated host machine running
the app with the database as a file next to it, and other workstations
connecting to that host over the office LAN. That was true before this ADR —
the deployment diagram already said SQLite while docker-compose said Postgres.

So the question is not which database to deploy. It is whether to *develop*
against a database we will never deploy.

## Decision

**SQLite in development, in test, and in production.** The same database engine
at every stage. `docker-compose.yml` is deleted and Docker is no longer a
prerequisite for working on this project.

Each developer has their own SQLite file at `DATABASE_PATH` (default
`./data/ai4rig.db`). It is gitignored and disposable: `npm run db:reset`
deletes it and rebuilds it from the migrations.

## Consequences

- **Every SQL difference surfaces immediately, not in week 13.** Postgres and
  SQLite disagree about a lot: type affinity versus strict types, `SERIAL`
  versus `INTEGER PRIMARY KEY AUTOINCREMENT`, `RETURNING` support, `BOOLEAN`,
  date and time functions, `ILIKE`, `ALTER TABLE` capabilities. Developing on
  one and shipping the other means discovering all of it during packaging,
  which is exactly when there is no time left.
- **Setup is `npm run setup`.** No Docker Desktop install, no container that
  will not start, no port 5432 conflict, no "did you run `docker compose up`?"
  Four laptops, one command.
- **Tests are fast and isolated.** A test opens a temp file (or `:memory:`),
  runs the migrations, and throws it away. No shared server, no test-database
  cleanup, no ordering problems between suites.
- We accept SQLite's real limits: one writer at a time, and a smaller SQL
  surface. For roughly eight users doing advisory planning, one writer is not a
  constraint. WAL mode is on so readers are never blocked by the writer.
- If the project ever genuinely outgrows SQLite, that is a migration with a
  clear trigger — not a reason to develop against the wrong database now.

## Alternatives considered

**Postgres in Docker for development, SQLite in production.** The scaffold's
original approach. Rejected: it means the database we test against is not the
database we ship, so every difference becomes a packaging-week surprise, and it
adds Docker Desktop as a prerequisite for four students on mixed hardware.

**Postgres in production too.** Would require RIG to run and maintain a
database server. There is no one there to do that, and it contradicts the
"no cloud account, no server, no IT staff" requirement the deployment diagram
is built around.

**An ORM to abstract the difference.** Rejected: an abstraction that lets you
pretend two databases are the same is exactly how the differences stay hidden
until they cannot be. It also adds a dependency for the sake of a portability
we do not want.
