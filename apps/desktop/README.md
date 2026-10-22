# apps/desktop

The Electron shell that turns AI4RIG into a desktop app RIG installs on their
own laptops. It starts the API and the built front end inside the app, on
127.0.0.1, and shows them in a window. Each install has its own database.

```bash
npm run desktop:start              # run it from source in a window
npm run desktop:dist -- --mac      # build the Mac installers into release/
npm run desktop:smoke              # start the packaged app and check it works
```

Everything else (installing for RIG, where data lives, backups, and releasing
updates) is in [docs/DESKTOP.md](../../docs/DESKTOP.md). The reasoning is in
[ADR 0007](../../docs/decisions/0007-desktop-packaging-and-updates.md).

Only this folder may import `electron` (ADR 0003). `src/server.ts` and
`src/secretStore.ts` deliberately don't, so they are tested in plain Node with
the rest of the suite.
