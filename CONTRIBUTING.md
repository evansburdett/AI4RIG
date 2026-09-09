# Contributing

Four people, one repository, one semester. These rules exist so `main` always
works and so nobody's laptop quietly drifts away from everyone else's.

Setup and day-to-day commands are in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
Why things are the way they are is in [docs/decisions/](docs/decisions/).

---

## Branches

Never commit to `main`. Every change goes through a branch and a pull request.

```
<your-initials>/<short-description>
```

```
eb/bucket-allocation-endpoint
jm/client-list-table
ks/fix-migration-ordering
tw/adr-electron-packaging
```

Initials so everyone can see at a glance whose branch it is. Lowercase,
hyphens, a few words — enough that a teammate reading `git branch -r` knows
what it is without opening it.

Branch from an up-to-date `main`:

```bash
git checkout main && git pull && npm install && npm run db:migrate
git checkout -b eb/bucket-allocation-endpoint
```

Keep branches short-lived. A branch open for two weeks is a merge conflict
waiting to happen. If a piece of work is big, land it in reviewable pieces.

---

## Commits

Present-tense summary of what the commit does, under about 70 characters, no
trailing period:

```
Add bucket allocation endpoint
Fix off-by-one in migration ordering warning
Document the frozen-migration rule
```

Not `wip`, `fixes`, `updates`, or `asdf`.

If the *why* is not obvious from the summary, add a blank line and a paragraph
explaining it. The diff shows what changed; the message is where the reason
lives.

Commit in logical units. A commit that renames forty files and also changes
behaviour is a commit nobody can review.

---

## Pull requests

- **One teammate's approval is required.** Not the author's own.
- **Squash merge.** The PR becomes one commit on `main` with the PR title as
  the message, so `main`'s history is one line per change instead of a trail of
  "fix typo" commits. Write a real PR title.
- **`npm run check` must pass before you ask for review.** Typecheck, lint, and
  tests. Do not make a reviewer be your test runner.
- Fill in the template. It is short and it is the checklist below.
- Open it as a draft early if the work is in progress. A draft PR tells the
  team what you are building before you have built the wrong thing.
- Delete the branch after merge.

### Reviewing

Reviewing is a real task, not a rubber stamp. Pull the branch and run it if the
change is not trivial. "Looks good to me" on a change you did not read is how
`main` breaks.

Say what you want changed, plainly, and say what is a blocker versus a
suggestion. Approve when it is right — not when it is perfect.

---

## What a reviewer must reject

These five are not style opinions. Each one has an ADR behind it, and each one
causes a specific failure later. Request changes; do not approve with a
comment.

### 1. A hardcoded API address

Any literal `localhost`, `127.0.0.1`, or `:3001` in the front end outside
`apps/web/src/api.ts`. Any bind address hardcoded in the API instead of read
from `API_HOST`.

**Why it matters:** at RIG the host machine binds `0.0.0.0` and advisor
workstations connect to it over the LAN. Every hardcoded address is a place
that silently keeps pointing at the developer's own laptop. Finding them during
deployment week means grepping a codebase under time pressure.

`npm run lint` catches this in `apps/web/src`. It cannot catch it everywhere.
See [ADR 0003](docs/decisions/0003-electron-is-packaging.md).

### 2. Float money

A `REAL`, `FLOAT`, or `NUMERIC` money column. A dollars-valued `number`. Any
arithmetic that multiplies or divides money without an explicit, documented
rounding decision.

**Why it matters:** correctness on this project is judged by penny-level parity
with RIG's spreadsheet. `0.1 + 0.2 !== 0.3`, and the error compounds across
every line of a plan. Money is a whole number of cents, in columns named
`*_cents`.

See [ADR 0004](docs/decisions/0004-money-as-integer-cents.md).

### 3. Real client data or any PII

A name, address, email, phone number, birth date, SSN, or real account number —
in a migration, a seed file, a test, a fixture, a comment, or a screenshot.
Including "anonymized" real data and realistic fake names.

**Why it matters:** this repository is cloned to four personal laptops and
screenshotted into presentations. The schema has no PII columns *at all*, which
is the control that makes a mistake impossible rather than merely discouraged.
Clients are identified by a generated client number.

If a column would hold PII, the fix is to remove the column, not to leave it
empty.

See [ADR 0006](docs/decisions/0006-no-pii-anywhere.md).

### 4. The engine importing the database

Anything under `packages/engine` that imports `@ai4rig/db`, `better-sqlite3`,
`node:fs`, `node:http`, `express`, or calls `fetch`, or reads `process.env`, or
uses `new Date()` in a way that changes a result.

**Why it matters:** the engine is the part that has to be provably right, and
the way we prove it is a test that is a literal input and an expected output.
An engine that reads the database needs a database to test, which means it does
not get tested against the spreadsheet cases that actually matter. The caller
reads the data and passes it in.

`npm run lint` catches the imports. Reviewers catch the rest.

See [ADR 0005](docs/decisions/0005-engine-does-no-io.md).

### 5. Editing a migration that is already on `main`

Any diff that modifies an existing file in `packages/db/migrations/` rather
than adding a new one.

**Why it matters:** your teammates have already applied that migration. Their
`schema_migrations` table records it as done, so editing the file does not
re-run anything on their machines — it just makes their schema differ from
yours while both claim to be up to date. The correct change is a new migration.

The runner enforces this with a checksum, so a merged edit will break every
teammate's next `db:migrate` with a confusing error. Catch it in review
instead.

See `packages/db/migrations/README.md`.

---

## Adding a dependency

- Add it to the workspace that uses it, not the root:
  `npm install <pkg> --workspace apps/api`. Shared tooling (TypeScript, ESLint,
  Vitest) goes at the root.
- **Commit `package-lock.json`.** It is what makes four machines install
  identical versions.
- Never delete and regenerate the lockfile to resolve a conflict. Resolve the
  conflict in `package.json`, then run `npm install` and commit the lockfile it
  produces.
- Say in the PR why the dependency is worth it. Every one is something that can
  fail to install on somebody's laptop the week before a demo.

## Adding an environment variable

- Add it to `.env.example` **in the same commit**, with a comment explaining
  what it is for. `npm run doctor` fails when `.env` is missing a key that
  `.env.example` lists, so this is what tells your teammates to add it.
- Say so in the PR description. It means everyone runs `npm run doctor` after
  pulling.
- Never commit `.env`. Never put a secret in a `VITE_`-prefixed variable —
  those are compiled into the browser bundle.

## Adding a decision

If a discussion ends in a decision that would otherwise get re-argued in
week 10, write an ADR: copy the shape of an existing file in
`docs/decisions/`, take the next number, add a row to the index.

ADRs are not edited when we change our minds. Write a new one that supersedes
the old, and add a pointer at the top of the old one.
