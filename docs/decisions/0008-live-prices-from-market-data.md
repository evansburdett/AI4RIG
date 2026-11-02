# 0008 — Live prices from Market Data, looked up on demand

**Status:** Accepted · 2026-11-02

## Context

RIG tracks shares, not dollars: from quarter to quarter the share counts barely
move, and the value should follow the market without anyone retyping it
(Blake and Ari, 10/22). That needs a price for every fund they hold, and most of
what they hold is mutual funds, which only publish a price once a day.

Barron's and YCharts have no API included with a normal subscription, and LPL
has none for them. Free tiers would not survive several advisors refreshing many
clients in a short span, since each install has its own database and cannot
share what another has looked up. RIG chose **Market Data** (marketdata.app),
Starter plan, and holds the key. All 132 funds in their models returned a price
when tested on 10/28.

## Decision

**The API looks prices up on demand and saves them on the ticker.** There is no
background polling.

- The key is pasted into Settings and kept like the OpenAI key (ADR 0007's
  encrypted file, `.env` in development). Only the API process uses it, and only
  ticker symbols are sent (ADR 0006).
- Opening a case looks up its funds, skipping any already looked up today. The
  button looks now.
- A price's date is the trading day it is from, read in New York, not the day it
  was looked up.
- A symbol with no answer keeps its old price and is named on screen. A cash fund
  with no answer is $1.00, since some money markets are not covered (VXPXX).
- The lookup is one function type, `PriceSource`, so another provider is one new
  function. Tiingo is the fallback.

## Consequences

- Without a key the app works as before: prices come from a statement or are
  typed. Nothing fails until someone presses the button, and then it says why.
- A failed lookup changes nothing, so a bad key or no internet cannot blank
  anyone's prices.
- Which funds were looked up today is held in memory. A restart looks each up
  once more, which costs a few requests against a 10,000-a-day plan.
