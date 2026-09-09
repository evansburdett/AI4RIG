# Architecture Decision Records

One file per decision that would otherwise get re-argued in week 10. Each one
is short on purpose: context, decision, consequences, alternatives.

An ADR is a record of what we decided **and why at the time**. It does not get
edited when circumstances change — if we change our minds, we write a new ADR
that supersedes the old one and add a line at the top of the old one pointing
at it. The point is that in December we can still see why September made the
call it made.

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-typescript-monorepo.md) | TypeScript everywhere, Node 22 LTS, npm workspaces | Accepted |
| [0002](0002-sqlite-everywhere.md) | SQLite in development, test, and production; no Docker | Accepted |
| [0003](0003-electron-is-packaging.md) | Electron is a packaging step, not an architecture | Accepted |
| [0004](0004-money-as-integer-cents.md) | Money is integer cents everywhere | Accepted |
| [0005](0005-engine-does-no-io.md) | The calculation engine does no I/O | Accepted |
| [0006](0006-no-pii-anywhere.md) | No personally identifying information anywhere | Accepted |

New ADR: copy the shape of an existing one, take the next number, add a row
above.
