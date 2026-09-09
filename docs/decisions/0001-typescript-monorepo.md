# 0001 — TypeScript everywhere, Node 22 LTS, npm workspaces

**Status:** Accepted · 2026-09-08

## Context

The project has three runnable pieces — a React front end, an HTTP API, and a
bucket-planning calculation engine — plus an Electron shell at the end. Four
developers on mixed macOS and Windows laptops have to run all of it.

The engine is the part that most invites a different language. Financial
calculation work has an obvious pull toward Python: pandas, numpy, a REPL that
suits spreadsheet-shaped work.

The deciding constraint is what ships. The deliverable is an Electron
application that RIG installs on office machines with no IT staff. **Electron
bundles Node. It does not bundle Python.** A Python engine means either
shipping an interpreter and its dependencies inside the installer, or standing
up a second process the Electron app has to launch, supervise, and talk to —
during the same weeks we should be validating numbers against RIG's
spreadsheet.

## Decision

- **Node 22 LTS**, pinned in `.nvmrc` and enforced by `npm run doctor`. LTS
  because it is supported past the end of the project; pinned because a native
  module (better-sqlite3) is compiled against a specific Node ABI and a
  mismatched major produces confusing failures.
- **TypeScript** in the front end, the API, and the engine. One language, one
  toolchain, one set of types shared across the boundary between them. Types
  matter most in the engine, where a number that is secretly dollars instead of
  cents is the bug we most want the compiler to catch.
- **npm workspaces** for the monorepo: `apps/api`, `apps/web`, `apps/desktop`,
  `packages/engine`, `packages/db`. npm ships with Node, so there is no extra
  package manager to install on four laptops.

## Consequences

- One `npm install` at the root installs everything; one lockfile pins every
  version for everyone.
- `packages/engine` is imported directly as TypeScript source by `apps/api`.
  No build step between workspaces during development.
- Packaging later is "bundle a Node app", which Electron does natively.
- We give up the Python data-analysis ecosystem. For the arithmetic this
  project actually does — integer cents, bucket allocation over a time
  horizon — that ecosystem is not needed.
- Everyone has to be able to read TypeScript. That is a smaller cost than
  everyone having to debug a two-runtime installer in week 13.

## Alternatives considered

**Python engine behind a FastAPI service, TypeScript front end.** Best
libraries for the calculation work, and clean separation. Rejected on
packaging: Electron would have to ship and supervise a Python runtime, and the
first time we would find out how badly that goes is the week we are trying to
demo.

**One language, but Python end to end.** Would mean a Python desktop toolkit
instead of Electron, giving up the web-app development model that lets four
people work on the UI in a browser.

**Separate repositories per piece.** Rejected: four people, one semester,
coordinated changes across API and front end most weeks. A monorepo means one
pull, one install, one branch.
