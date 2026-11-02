# 0009 — Every fund holds shares, however it got into the account

**Status:** Accepted · 2026-11-02

## Context

A fund could get into an account from a model, by hand, or from an imported
statement, and those behaved as two different things. Model and hand-added funds
stored dollars, with weight and dollars editable and shares only displayed.
Imported funds stored shares, with only shares editable. One imported fund
flipped the whole account: its balance stopped being typed, and its fee stopped
being set aside. So nobody could type shares by hand, and typing $50,000 into a
fund in an imported account raised the balance by $50,000.

RIG asked for weight, dollars, and shares at different times because they use
them at different times. They plan in dollars and weights, and they maintain in
shares: "the share quantity really usually doesn't change" (Blake, 10/22).

## Decision

**One kind of fund, with weight, dollars, and shares all editable. Shares are
the record, and dollars are shares at today's price.** One function,
`atCurrentPrices`, applies the rule to every account:

- **Dollars or a weight** place money inside the balance. They become shares at
  today's price, and the balance does not move.
- **Shares** are what the client owns, so the balance follows them.
- **A price change** moves dollars and the balance, and leaves shares and cash
  alone.
- **The balance** is funds plus cash not in a fund. Typing it sets the cash.
- **The fee** comes from that cash first, then from cash funds. The screen warns
  if the two together fall short.
- **With no price**, a fund holds its dollars until there is one.

Mutual funds and cash funds are bought in fractions, and stocks and ETFs in whole
shares. What whole shares cannot use stays as cash and counts toward Now. RIG has
not confirmed this split yet.

There is no schema change. `account_lines.shares_micros` already exists, and cash
is the balance less the funds.

## Consequences

- An account on a model shows "differs from model" once prices move unevenly,
  not only after an edit. Those look the same from the numbers, and both mean
  the advisor may want to refill. A new balance no longer refills it.
- A fund can read $29,998.67 after $30,000 was typed, because that is what whole
  shares cost. A case that used to land exactly on target can now show a small
  Now variance for the same reason.
- A case saved before this converts to shares at today's price the first time it
  is opened, and that is saved straight away, so its "last saved" time moves once.
- Funds in dollars become shares in the working copy, not only on screen. If they
  stayed in dollars, each new price would change the share count and never the
  balance.
- Typing shares to fine-tune a plan changes its balance. To stay inside the
  balance, type dollars or a weight.
