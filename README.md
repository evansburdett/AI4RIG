# AI4RIG

Advisor-facing bucket planning tool for Railroad Investment Group.
Auburn University Senior Design, Team 22.

## Quick start

Requires **Node 22 LTS** (see `.nvmrc`). No Docker, no database server.

```bash
git clone https://github.com/<org>/AI4RIG.git
cd AI4RIG
npm run setup
npm run dev
```

Then open <http://localhost:5173>. You should see the API, the database, and
the front end reporting that they are connected.

Something not working? `npm run doctor` checks your machine and prints the
exact fix.

Full instructions, including Windows: **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**.

## Layout

```
apps/web           React + Vite front end, port 5173 — the primary dev target
apps/api           Express API, port 3001 — owns the database
apps/desktop       Electron shell — empty until packaging, late in the project
packages/engine    Pure bucket calculations, no I/O
packages/db        SQLite connection, migration runner, seed loader
  migrations/      Numbered .sql files — the shared schema
  seed/            Sample data (no real client data, ever)
docs/DEVELOPMENT.md    Setup, daily workflow, troubleshooting
docs/decisions/        Architecture decision records
docs/uml/              PlantUML source and rendered diagrams
scripts/               doctor, setup, dev
CONTRIBUTING.md        Branches, commits, PRs, what a reviewer rejects
```

## Commands

All from the repo root. Full table in
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#command-reference).

| | |
|---|---|
| `npm run setup` | Fresh clone: `.env`, install, database, doctor |
| `npm run doctor` | Check this machine and print fixes |
| `npm run dev` | API + web app together |
| `npm run db:reset` | Delete and rebuild your local database |
| `npm run check` | typecheck + lint + test — run before every push |

## How it fits together

The front end talks to the API over HTTP. The API owns the SQLite database and
calls the engine. The engine is pure functions — the API reads the data and
passes it in.

That HTTP boundary is the same one the shipped product uses: at RIG, one host
machine runs the API with `API_HOST=0.0.0.0` and advisor workstations connect
to it over the office LAN. Electron wraps this at the end; it is not something
the code knows about.

## Decisions

These are settled. The reasoning is in [docs/decisions/](docs/decisions/).

- **TypeScript, Node 22, npm workspaces** — Electron bundles Node, not Python,
  so packaging stays trivial. ([0001](docs/decisions/0001-typescript-monorepo.md))
- **SQLite in development, test, and production** — production is SQLite
  embedded in Electron, so developing against anything else means testing a
  database we never deploy. ([0002](docs/decisions/0002-sqlite-everywhere.md))
- **Electron is a packaging step, not an architecture** — build a web app on
  localhost; add the shell at the end. ([0003](docs/decisions/0003-electron-is-packaging.md))
- **Money is integer cents** — penny parity with RIG's spreadsheet is how
  correctness is judged. ([0004](docs/decisions/0004-money-as-integer-cents.md))
- **The engine does no I/O** — callers read data and pass it in.
  ([0005](docs/decisions/0005-engine-does-no-io.md))
- **No PII anywhere** — clients are a generated client number.
  ([0006](docs/decisions/0006-no-pii-anywhere.md))

## Contributing

Branch, PR, one approval, squash merge. See
[CONTRIBUTING.md](CONTRIBUTING.md) — including the five things a reviewer must
reject.

## Diagrams

PlantUML source is in `docs/uml/src`, rendered PNGs in `docs/uml/png`.

```bash
./scripts/render-uml.sh    # needs plantuml.jar and a JRE
```
