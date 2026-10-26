# 0007 — How the desktop app is packaged and updated

**Status:** Accepted · 2026-10-22
**Builds on:** [0003](0003-electron-is-packaging.md), which said Electron
would wrap the web app at the end.

## Context

RIG will install AI4RIG on their own laptops at the 10/26 in-person session
and use it at home. Earlier the team ruled out a hosted or shared database: each
install has its own API and its own SQLite file, and Ari is essentially the
only user. They will not have a terminal, a `.env` file, or IT staff, and RIG
is affiliated with LPL, so their laptops may be managed. Updates have to reach
them without anyone visiting.

## Decision

- **Electron, with electron-builder.** `apps/desktop` bundles the main process,
  the API, and the database code into one file with esbuild, and packages a
  staging folder holding only that bundle, the built front end, the
  migrations, the reference seeds, and two runtime dependencies. The
  workspaces never get installed into the app.
- **One origin.** The API serves the built front end. The window loads
  `http://127.0.0.1:<free port>`, so there is no fixed port to collide and no
  cross-origin setup. The page has no Node or Electron access, and a content
  security policy limits it to that address.
- **Data in the user's own app-data folder.** Migrations run on every start,
  so a newer version upgrades the data in place. Placeholder tickers and
  models load only into a brand-new database. Sample cases never ship.
- **The OpenAI key goes in the app**, on a Settings screen, encrypted with the
  operating system's keychain through Electron's `safeStorage`. The API reads
  keys through a `SecretStore`, so development still uses `.env`.
- **No native rebuilds.** better-sqlite3 13 ships prebuilt binaries for every
  platform against Node's stable native interface. Each installer keeps only
  its own platform's binary.
- **Unsigned, honestly.** Windows is not code-signed. The Mac app is signed ad
  hoc so Apple silicon runs it. Both show a one-time warning, which we walk RIG
  through.
- **Per-user Windows install** (no administrator rights), which suits a
  managed laptop.
- **Updates from GitHub Releases**, made by a GitHub Actions workflow on a
  version tag, as drafts that a person publishes. Windows updates itself
  (electron-updater). The Mac app cannot replace itself without a paid Apple
  Developer ID, so it says an update exists and opens the download page.
- **Every build is smoke-tested.** CI starts the packaged app on real Windows
  and macOS machines and checks the API, front end, database, and shutdown.

## Consequences

- RIG gets a normal install with a Start menu entry or an Applications icon,
  with no setup beyond pasting the key.
- Releasing is: bump the version, tag, publish the draft.
- First launch shows a security warning on both platforms until we pay for
  signing: about $99/year for Apple, more for a Windows certificate.
- Mac updates are a manual download until the app is signed.
- Each laptop's data is separate. Sharing cases means revisiting hosting,
  which was tabled.
- Any program running on that laptop could reach the local API port. That is
  acceptable for a single-user tool holding no PII; the port is bound to
  127.0.0.1 only, so nothing on the network can.

## Alternatives considered

**Tauri.** Already rejected in 0003: a Rust toolchain on four laptops.

**Electron Forge.** Equally capable. electron-builder's NSIS per-user install,
DMG, and GitHub Releases updates are configured in one file and are what most
guidance assumes.

**Bundling a Node runtime and opening the browser.** Smaller, but a terminal
window plus a browser tab is not something RIG should have to manage, and
updates would be entirely manual.

**A hosted web app.** Deferred by RIG on 9/23 (single user, no PII, no vendor
review). The HTTP boundary means it is still possible later.
