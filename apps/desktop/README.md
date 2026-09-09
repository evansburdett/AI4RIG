# apps/desktop

Intentionally empty.

Electron is a **packaging step at the end of the project, not an
architecture**. We build a web app on localhost; late in the semester an
Electron shell gets added here that boots the API in-process and points a
window at the built front end.

Nothing in `apps/api`, `apps/web`, or `packages/` should know Electron exists.
If you find yourself importing `electron` outside this folder, the design has
drifted.

See `docs/decisions/0003-electron-is-packaging.md`.
