# 0006 — No personally identifying information anywhere

**Status:** Accepted · 2026-09-08

## Context

This is a tool for a financial advisory firm. The data it is modeled on is
about real people's retirement money — the most sensitive category of personal
information short of medical records.

It is also a student project. The code lives in a GitHub repository. Four
students clone it onto personal laptops. Screenshots go into design reviews,
progress reports, and a final presentation. Test fixtures get pasted into issue
comments. None of those are places real client data can safely go, and none of
them are reliably reversible once it has.

## Decision

**No personally identifying information in the schema, seed data, tests,
fixtures, screenshots, or commit history.**

- Clients are identified by a **generated client number** (`RIG-0001`). That
  number is the primary human-readable identifier throughout the system.
- The schema has **no column** for name, address, email, phone number, date of
  birth, Social Security number, or account number at a real institution. Not
  nullable, not optional, not "we'll leave it empty for now" — the column does
  not exist. A column that exists will eventually be filled.
- Seed and test data is invented. Not anonymized real data, not "a real case
  with the name changed" — invented. Amounts are round numbers that are
  obviously synthetic.
- If RIG shares a real case to check the numbers against, it is used by
  transcribing the **amounts and dates only** into a fixture keyed by a client
  number. The source document does not enter the repository.

## Consequences

- The repository can be public, shown in a presentation, or handed to the
  course staff without a review pass first.
- Screenshots are safe by construction. Nobody has to remember to blur
  anything.
- A leak of the repository is not a leak of anyone's financial information.
- If RIG later needs real names in the shipped product, that is a change made
  once, deliberately, in their deployment — with the encryption and access
  questions actually considered. It is not something that arrives by accident
  because a `client_name` column was there from week 3.
- The trade-off: demo screens show `RIG-0001` rather than a name, which reads
  as less polished. That is a presentation problem, and a cheap one.

## Alternatives considered

**Realistic fake names from a generator.** Nicer demos. Rejected: it makes the
schema PII-shaped, so the day someone loads a real case there is nothing —
no missing column, no failing check — to stop them. The absence of the column
is the control.

**Real data with access controls on the repository.** A private repo is not a
security boundary for a four-person student team on personal laptops, and it
does nothing about screenshots in a slide deck.
