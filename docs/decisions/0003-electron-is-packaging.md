# 0003 — Electron is a packaging step, not an architecture

**Status:** Accepted · 2026-09-08

## Context

The deliverable is a desktop application. The tempting move is to start with
Electron on day one — scaffold a main process, a renderer, IPC channels between
them — and build the features inside that shell.

That front-loads the slowest, least pleasant part of the stack. Electron's
reload cycle is worse than Vite's. Debugging spans two processes. Every UI
change gets tested through a shell instead of a browser. And crucially, four
developers cannot all be productive at once when the thing they run is a
desktop app that has to be rebuilt.

## Decision

**Build a web app that runs on localhost. Add Electron at the end.**

- `apps/web` is a Vite React app on port 5173. It is the primary development
  target and it runs in a browser.
- `apps/api` is an Express server on port 3001. It owns the database.
- The two talk over HTTP, exactly as they will in the shipped product where the
  Electron renderer talks to the API in the host machine's main process.
- **`apps/desktop` stays empty** until packaging. When it is filled in, it
  boots the API in-process and points a window at the built front end.

Nothing outside `apps/desktop` may import `electron` or assume it exists.

## Consequences

- Development is a browser refresh. React DevTools, the network tab, and
  responsive testing all work normally.
- Four people can run the whole stack independently without an Electron build.
- The HTTP boundary is real from day one, so the eventual client-mode
  deployment (advisor workstations connecting to a host over the LAN) is
  already the shape the code has. It is a change to `API_HOST` and
  `VITE_API_BASE_URL` in `.env`, not a rewrite. See
  `docs/decisions/0002-sqlite-everywhere.md` for the deployment picture.
- The risk we take on: Electron packaging is not proven until we do it. We
  mitigate it by keeping the front end a plain static build with no Node
  APIs, and the API a plain Node process with no browser assumptions — which
  is the boring case Electron handles well. Packaging is scheduled with time
  left, not as the last commit.

## Alternatives considered

**Electron from day one.** Rejected: slow feedback loop, harder debugging, and
it makes every feature branch depend on the shell working.

**Ship a web app and skip Electron.** Rejected: it contradicts the requirement
that RIG runs this with no server and no IT staff. Someone would have to host
it.

**Tauri instead of Electron.** Smaller binaries, but a Rust toolchain on four
student laptops and a much smaller body of "how do I fix this" material. Not
worth the risk on a semester timeline.
