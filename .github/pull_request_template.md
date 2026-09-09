## What this changes

<!-- One or two sentences. What does main do after this that it did not before? -->

## Why

<!-- The reason, or a link to the issue / requirement / ADR. -->

## How to check it

<!-- What should the reviewer run or click to see this working?
     e.g. npm run db:reset && npm run dev, then open http://localhost:5173 -->

---

## Author checklist

- [ ] `npm run check` passes (typecheck, lint, tests)
- [ ] Branch is `initials/short-description` and branched from an up-to-date `main`
- [ ] New dependency? It is in the right workspace and `package-lock.json` is committed
- [ ] New env var? It is in `.env.example` with a comment, and I said so above
- [ ] New migration? `npm run db:reset` succeeds from empty, and it is a **new** file

## Reviewer checklist — reject if any of these are true

Each of these has an ADR behind it. See [CONTRIBUTING.md](../CONTRIBUTING.md).

- [ ] **No hardcoded API address** — no literal `localhost` / `127.0.0.1` / `:3001`
      outside `apps/web/src/api.ts`; the API bind address comes from `API_HOST`
      ([ADR 0003](../docs/decisions/0003-electron-is-packaging.md))
- [ ] **No float money** — no `REAL`/`FLOAT` columns, no dollar-valued numbers;
      integer cents in `*_cents` columns, and any rounding is explicit
      ([ADR 0004](../docs/decisions/0004-money-as-integer-cents.md))
- [ ] **No real client data or PII** — no names, addresses, emails, phones, birth
      dates, SSNs, or real account numbers in schema, seeds, tests, fixtures, or
      screenshots ([ADR 0006](../docs/decisions/0006-no-pii-anywhere.md))
- [ ] **Engine does no I/O** — nothing in `packages/engine` imports `@ai4rig/db`,
      `better-sqlite3`, `node:fs`, `node:http`, or `express`, calls `fetch`, or
      reads `process.env` ([ADR 0005](../docs/decisions/0005-engine-does-no-io.md))
- [ ] **No migration edited** — files already in `packages/db/migrations` on `main`
      are unchanged; schema changes are a new numbered file
      ([migrations README](../packages/db/migrations/README.md))

## Merging

One teammate approval required. **Squash merge** — the PR title becomes the
commit message on `main`. Delete the branch afterwards.
