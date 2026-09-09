# @ai4rig/engine

The bucket-planning calculations. **This package is the team's work — what is
here now is a placeholder that exists to prove the build, type-check, and test
plumbing works.** Replace it.

Two constraints are not placeholders:

## The engine does no I/O

No database import, no `fetch`, no filesystem, no `process.env`. A function
here takes plain data and returns plain data. The caller (the API) reads from
SQLite and passes the values in.

That is what makes the engine testable against RIG's spreadsheet without
standing anything up, and it is what lets the same code run unchanged inside
Electron later. ESLint enforces it: importing `@ai4rig/db`, `better-sqlite3`,
`node:fs`, `node:http`, or `express` from this package is a lint error.

See `docs/decisions/0005-engine-does-no-io.md`.

## Money is integer cents

Never a float, never a dollars-as-number. `0.1 + 0.2 !== 0.3` in every language
with IEEE-754 doubles, and correctness on this project is judged by matching
RIG's spreadsheet to the penny. Amounts are whole numbers of cents; conversion
to a display string happens at the edge, in the front end.

See `docs/decisions/0004-money-as-integer-cents.md`.
