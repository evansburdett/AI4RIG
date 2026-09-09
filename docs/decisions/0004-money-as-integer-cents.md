# 0004 — Money is integer cents everywhere

**Status:** Accepted · 2026-09-08

## Context

How this project is judged: the numbers the tool produces have to match the
spreadsheet RIG's advisors use today, **to the penny**. Not approximately. A
one-cent difference in a bucket total is a bug report, and worse, it is a
reason for an advisor not to trust the tool.

JavaScript numbers are IEEE-754 doubles. `0.1 + 0.2 === 0.30000000000000004`.
Dollars-as-floats accumulate error across every addition, every allocation,
every percentage split. A rounding difference of a fraction of a cent, repeated
across a plan with dozens of line items, is exactly the kind of drift that
turns into "your tool says $412,338.71 and mine says $412,338.69" in a demo.

## Decision

**Money is always a whole number of cents, stored and passed as an integer.**

- Database: `INTEGER` columns, named with a `_cents` suffix
  (`balance_cents`, `target_cents`). **No `REAL`, no `FLOAT`, no `NUMERIC`
  money columns.** SQLite's type affinity will happily store a float in a
  column you called `INTEGER`, so the naming convention is what makes a wrong
  value obvious in review.
- Engine and API: `Cents` (an alias for `number`) in signatures. `assertCents`
  guards anything arriving from outside — a request body, a spreadsheet
  import, a database column that should have been INTEGER.
- Front end: cents are converted to a display string at the edge, in the
  component that renders them. Nothing computes in dollars.
- Percentages and ratios are handled at the point of use with an explicit
  rounding rule, and the rounding rule is written down where it is applied.
  Allocations that must sum to a total distribute the remainder deliberately
  rather than letting each part round independently.

## Consequences

- Addition and subtraction are exact. `addCents` in `packages/engine` rejects
  anything that is not a whole number, so a float that leaked in fails at the
  boundary instead of silently propagating.
- Multiplication and division still need thought — a 3.5% rate applied to a
  balance produces a fraction of a cent, and someone has to decide where it
  goes. Integer cents does not make that decision for us; it makes it *visible*
  and forces it to be made once, explicitly, instead of being scattered through
  float arithmetic.
- Safe-integer range is ±9,007,199,254,740,991 cents, about $90 trillion.
  Not a constraint here, and `assertCents` checks it anyway.
- Reading raw database rows takes a moment's translation. Worth it.

## Alternatives considered

**Floating-point dollars.** The default, and wrong for money. Rejected on the
penny-parity requirement.

**A decimal library (decimal.js, big.js).** Correct, but adds a dependency, and
every value becomes an object that has to be serialized across the HTTP
boundary and back. Integers do the same job here because the smallest unit
this domain cares about is the cent.

**SQLite `NUMERIC` columns.** SQLite has no true fixed-point decimal type;
`NUMERIC` is affinity, not a guarantee, and values still come back to
JavaScript as doubles.
