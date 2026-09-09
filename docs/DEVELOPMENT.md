# Development

How to run AI4RIG on your laptop, and how four people keep four laptops
identical.

- [How the database works](#how-the-database-works)
- [First-time setup — macOS](#first-time-setup--macos)
- [First-time setup — Windows](#first-time-setup--windows)
- [Before you start work](#before-you-start-work)
- [End of day](#end-of-day)
- [Command reference](#command-reference)
- [Adding a migration](#adding-a-migration)
- [Troubleshooting](#troubleshooting)

---

## How the database works

This is the part that confuses people first, so it goes first.

**Everyone has their own database file. Nobody shares one. The files are
identical in shape and different in content, and that is on purpose.**

Your database lives at `data/ai4rig.db` (set by `DATABASE_PATH` in `.env`). It
is gitignored. It never gets committed, never gets pushed, and nobody else ever
sees it.

What *is* shared is `packages/db/migrations/` — a folder of numbered `.sql`
files that describe the schema. When you run `npm run db:migrate`, the runner
applies every migration you have not applied yet, in order, and records it. Run
it after every `git pull` and your database has the same **shape** as everyone
else's, because it was built from the same instructions.

So:

| | Shared via git | Yours alone |
|---|---|---|
| Schema (`migrations/*.sql`) | yes | |
| Sample data (`seed/*.sql`) | yes | |
| The `.db` file itself | | yes |
| Rows you created while clicking around | | yes |

### Your local database is disposable

Nothing you care about lives in it. Every row in it came from either a
migration, a seed file, or five minutes of you clicking around in the UI.

That means **`npm run db:reset` is a cheap, safe first move** whenever
something is confusing. It deletes the file and rebuilds it from migrations and
seeds. You do not need to ask anyone. You do not need to back anything up. If
you are three commits into debugging something weird about the schema, reset
first and see if it is still weird.

Treating the database as disposable is what makes the migration workflow work
at all. The moment someone's local database contains something irreplaceable,
they stop resetting, they start hand-patching their schema, and within a week
their machine is the only one where the tests pass.

### The one rule that keeps this honest

**A migration that has been merged to `main` is frozen. Never edit it.**

Your teammates have already run that file. Their `schema_migrations` table says
it was applied. Editing the file does not re-run anything on their machines —
it just means your schema and their schema are now different while both claim
to be up to date.

The runner enforces this: it stores a checksum of every migration it applies,
and refuses to run if a file that was already applied has changed.

Still iterating on a migration you have **not pushed yet**? Edit it as much as
you like and run `npm run db:reset`. That is the whole point of the file being
disposable.

---

## First-time setup — macOS

### 1. Install Node 22 LTS

The repo pins a version in `.nvmrc`. Use `nvm` so you can switch per project:

```bash
brew install nvm
```

Follow the instructions `brew` prints to add nvm to your `~/.zshrc`, then open
a new terminal and:

```bash
nvm install
nvm use
node --version
```

`nvm install` with no argument reads `.nvmrc` — but only once you are inside
the repo, so clone first if you have not.

You probably do not need anything else. `better-sqlite3` is a native module,
but it ships a prebuilt binary for macOS on both Intel and Apple silicon, so
nothing gets compiled during install. If it ever does need to compile, you will
need the Xcode command line tools:

```bash
xcode-select --install
```

### 2. Clone and set up

```bash
git clone https://github.com/<org>/AI4RIG.git
cd AI4RIG
nvm use
npm run setup
```

`npm run setup` creates `.env` from `.env.example`, installs dependencies,
builds your database, and runs `npm run doctor` to confirm all of it worked.

### 3. Run it

```bash
npm run dev
```

Open <http://localhost:5173>. You should see "Front end, API, and database are
connected" with your database path and a migration count.

If you do not, run `npm run doctor` — it prints what is wrong and the exact
command to fix it.

---

## First-time setup — Windows

Use **PowerShell**, not Command Prompt. All commands below assume PowerShell.

### 1. Install Node 22 LTS

Install [nvm-windows](https://github.com/coreybutler/nvm-windows/releases)
(download `nvm-setup.exe`), then **open a new PowerShell window** so the `nvm`
command is on your PATH:

```powershell
nvm install 22.23.2
nvm use 22.23.2
node --version
```

nvm-windows does not read `.nvmrc` automatically. The version is in that file —
check it matches what you installed:

```powershell
Get-Content .nvmrc
```

### 2. C++ build tools — probably not needed

`better-sqlite3` is a native module, but it ships prebuilt binaries for Windows
on x64 and arm64, so a normal install compiles nothing.

Skip this step. If the install does fail on `better-sqlite3`, come back and
install **Visual Studio Build Tools** with the **"Desktop development with
C++"** workload — see
[the troubleshooting section](#better-sqlite3-fails-to-install-or-build-usually-windows):

<https://visualstudio.microsoft.com/visual-cpp-build-tools/>

### 3. Let git use LF line endings

The repo has a `.gitattributes` that normalises everything to LF, which handles
this for you. Confirm git is not fighting it:

```powershell
git config --global core.autocrlf false
```

Setting `core.autocrlf` to `true` makes git rewrite line endings on checkout,
which produces whole-file diffs that make your pull requests unreviewable. See
[Line-ending problems](#line-ending-problems) below.

### 4. Clone and set up

```powershell
git clone https://github.com/<org>/AI4RIG.git
cd AI4RIG
npm run setup
```

If PowerShell refuses to run `npm` with a script-execution error:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### 5. Run it

```powershell
npm run dev
```

Open <http://localhost:5173>. Windows Firewall may ask whether to allow Node to
accept connections — **Cancel / Allow on private networks only** is fine.
Nothing here needs to accept connections from outside your machine in
development.

---

## Before you start work

Four commands. They take under a minute and they prevent most of the
"it works on my machine" conversations.

```bash
git checkout main
git pull                # 1
npm install             # 2
npm run db:migrate      # 3
git checkout -b eb/bucket-allocation-endpoint   # 4
```

**1. `git pull`** — get everyone's merged work. Starting a branch from a stale
`main` means your pull request will contain other people's commits and be
unreviewable.

**2. `npm install`** — someone else's merge may have added a dependency. Your
`node_modules` is not in git; the lockfile is. `npm install` reconciles the
two. Skipping this is the number one cause of "Cannot find module".

**3. `npm run db:migrate`** — someone else's merge may have added a migration.
Your database file is not in git; the migration files are. This applies
whatever is new. It is idempotent, so running it when there is nothing new
costs nothing. Skipping this is the number one cause of "no such column".

**4. `git checkout -b`** — branch before you write a line. Branch naming is in
[CONTRIBUTING.md](../CONTRIBUTING.md): your initials, a slash, a short
description.

If any of this feels off, `npm run doctor` tells you the state of your machine.

---

## End of day

```bash
npm run check           # 1
git add -A
git commit -m "Add bucket allocation endpoint"   # 2
git push -u origin eb/bucket-allocation-endpoint # 3
# open a pull request                            # 4
```

**1. `npm run check`** — typecheck, lint, and tests, the same three things a
reviewer will run. Finding a failure now costs you two minutes; finding it
after a teammate has started reviewing costs both of you a round trip. If
`check` fails, you are not done.

**2. Commit** — with a message that says what changed and why, not "wip" or
"fixes". Details in [CONTRIBUTING.md](../CONTRIBUTING.md).

**3. Push** — every day, even if the work is unfinished. A branch that lives
only on your laptop is a branch that disappears when your laptop does, and it
is invisible to teammates who might be about to write the same thing. Pushing
an in-progress branch costs nothing.

**4. Open a pull request** — early, even as a draft. A draft PR tells everyone
what you are working on and gives them somewhere to comment before you have
built the wrong thing. A PR needs one teammate's approval and is squash-merged.

**Never push to `main` directly.** Every change goes through a branch and a
pull request. That is not ceremony — it is what stops `main` from breaking for
three other people while you are at lunch.

---

## Command reference

Run all of these from the repo root.

| Command | What it does |
|---|---|
| `npm run setup` | Fresh clone: create `.env`, install, build the database, run doctor. Safe to re-run. |
| `npm run doctor` | Check this machine: Node version, dependencies, `.env`, database, ports. Prints the fix for anything failing. |
| `npm run dev` | Run the API and the web app together. Ctrl-C stops both. |
| `npm run dev:api` | Just the API, on port 3001. |
| `npm run dev:web` | Just the web app, on port 5173. |
| `npm run db:migrate` | Apply any migrations not yet applied to your database. Idempotent. |
| `npm run db:seed` | Load `packages/db/seed/*.sql` sample data. |
| `npm run db:reset` | Delete your database file and rebuild it from migrations + seeds. |
| `npm test` | Run every test in the monorepo. |
| `npm run test:watch` | Same, re-running as you edit. |
| `npm run typecheck` | TypeScript, every workspace, no output files. |
| `npm run lint` | ESLint. Includes the project rules — see below. |
| `npm run lint:fix` | ESLint with autofix. |
| `npm run check` | `typecheck` + `lint` + `test`. Run before every push. |

### Two lint rules worth knowing about

`npm run lint` enforces two of the decisions in `docs/decisions/` so a reviewer
does not have to catch them by eye:

- A literal `localhost`, `127.0.0.1`, or `:3001` anywhere under `apps/web/src`
  **except `api.ts`** is an error. So is reading `import.meta.env` outside
  `api.ts`. One module knows where the API is.
- Importing `@ai4rig/db`, `better-sqlite3`, `node:fs`, `node:http`, or
  `express` from `packages/engine` is an error. The engine does no I/O.

---

## Adding a migration

1. Create `packages/db/migrations/NNNN_short_description.sql` — four digits,
   underscore, lowercase words. Take the next unused number:

   ```bash
   ls packages/db/migrations
   ```

2. Write the SQL. Money columns are `INTEGER` and named `*_cents`. No columns
   that hold personally identifying information. See
   `packages/db/migrations/README.md` for the full conventions.

3. Apply it:

   ```bash
   npm run db:migrate
   ```

4. Prove it works from nothing:

   ```bash
   npm run db:reset
   ```

   This is the check that matters. `db:migrate` only proves the migration works
   *on top of your current database*. `db:reset` proves it works on the empty
   database your teammates and CI will build.

5. Commit the `.sql` file with the code that needs it, in the same pull
   request.

**Two people adding `0007_` on different branches** is the one hazard. Whoever
merges second renumbers their file before merging — the runner warns when it
sees a migration that sorts below one already applied. Check `main` before you
pick a number:

```bash
git log main --oneline -- packages/db/migrations
```

---

## Troubleshooting

**Start with `npm run doctor`.** It checks the six things that go wrong most
often and prints the exact fix command for macOS and PowerShell.

### Port already in use

`EADDRINUSE` on 3001 or 5173, or the API exits immediately at startup. Usually
a dev server from earlier that never shut down.

macOS:

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
kill <PID>
```

PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 3001 -State Listen | Select-Object OwningProcess
Stop-Process -Id <PID>
```

Same with `5173`. If you genuinely need a different port, change `API_PORT` in
`.env` — and change `VITE_API_BASE_URL` to match, or the front end will still
be calling 3001.

### Cannot find module '...' / 'ERR_MODULE_NOT_FOUND'

Almost always: someone added a dependency and you pulled without installing.

```bash
npm install
```

If that does not fix it, the install itself is in a bad state. Nuke it:

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
npm install
```

PowerShell:

```powershell
Remove-Item -Recurse -Force node_modules, apps/*/node_modules, packages/*/node_modules
npm install
```

Do **not** delete `package-lock.json` to fix this. The lockfile is what makes
four machines install identical versions; regenerating it silently upgrades
everyone's dependencies and turns your pull request into a thousand-line diff.

### no such table / no such column

Your database is behind the migrations.

```bash
npm run db:migrate
```

If it still fails, your database is in a state the migrations cannot reconcile
— usually because you hand-edited a table, or because you were on a branch
with a migration that has since been renumbered. Rebuild it:

```bash
npm run db:reset
```

Remember: nothing in your local database is irreplaceable.

### "X has changed since it was applied to this database"

You edited a migration that had already run. That is the frozen-migration rule
in `packages/db/migrations/README.md`.

- **The migration is already on `main`:** put the change in a *new* migration.
  Restore the old file (`git checkout packages/db/migrations/NNNN_....sql`).
- **The migration is still only on your branch:** editing it is fine.
  `npm run db:reset` and carry on.

### Line-ending problems

Symptoms: a pull request shows every line of a file as changed when you only
touched one; `git status` shows files as modified right after a clean
checkout; a shell script fails with `bad interpreter: no such file`.

The repo's `.gitattributes` normalises everything to LF, so this should not
happen. When it does, git is configured to fight it:

```bash
git config --global core.autocrlf false
git config core.autocrlf false
```

Then re-normalise your working copy:

```bash
git rm --cached -r .
git reset --hard
```

(Commit or stash your work first — `reset --hard` discards uncommitted
changes.)

Set your editor to LF too. `.editorconfig` does this automatically in VS Code
with the EditorConfig extension, and in JetBrains IDEs natively.

### better-sqlite3 fails to install or build (usually Windows)

`better-sqlite3` is the only native (C++) module in the project, so a broken
install is nearly always this one. Errors mention `node-gyp`, `gyp ERR!`,
`MSB8020`, `Visual Studio`, or `Could not locate the bindings file`.

It ships **prebuilt binaries** for macOS, Windows, and Linux on x64 and arm64,
and those are Node-API builds, so they work across Node versions without
recompiling. In the normal case nothing is compiled on your machine at all —
which is why `npm run doctor` reports which of the two you have:

```
PASS  better-sqlite3   prebuilt binary for win32-x64
PASS  better-sqlite3   compiled from source
FAIL  better-sqlite3   no native binding for <platform> - it must be compiled
```

**A partially finished install is the most common cause.** An interrupted
`npm install`, or one that ran out of disk, leaves the package present but the
binary missing. Delete and reinstall:

```powershell
Remove-Item -Recurse -Force node_modules
npm install
```

```bash
rm -rf node_modules
npm install
```

**If it genuinely has to compile** — no prebuild for your platform, or npm is
configured to build from source — you need a C++ toolchain.

Windows: install **Visual Studio Build Tools** with the **"Desktop development
with C++"** workload
(<https://visualstudio.microsoft.com/visual-cpp-build-tools/>), then in a
**new** PowerShell window:

```powershell
npm rebuild better-sqlite3 --build-from-source
```

macOS:

```bash
xcode-select --install
npm rebuild better-sqlite3 --build-from-source
```

The build is slow — several minutes — and prints a lot. Let it finish.

**Other things worth checking on Windows:**

- Your Node version matches `.nvmrc` (`node --version`). Other things break in
  confusing ways when it does not, even though the binding itself is
  ABI-independent.
- The repo is not inside OneDrive or a synced folder. File locking during
  install produces `EPERM` and `EBUSY` errors that look like build failures.
- Your antivirus is not quarantining `.node` files mid-install. If the file
  appears and then vanishes, that is what is happening.

### The web page says "API unreachable"

The front end loaded but could not reach the API.

1. Is the API running? `npm run dev` starts both; `npm run dev:web` starts only
   the web app.
2. Does `VITE_API_BASE_URL` in `.env` match where the API is actually
   listening? The health page prints what the API thinks it is bound to.
3. **Vite reads `.env` only at startup.** If you edited it, restart
   `npm run dev`.
4. Check the API's own output — it prints its address on boot, and the browser
   console will show whether the request was refused or blocked by CORS. If it
   is CORS, `WEB_ORIGIN` in `.env` does not include the origin your browser is
   using (`http://localhost:5173` and `http://127.0.0.1:5173` are different
   origins).
