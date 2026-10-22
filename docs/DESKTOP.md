# The desktop app

AI4RIG ships to RIG as a normal desktop app: an installer for Windows and one
for Mac. Each install runs its own copy of the API and its own database on
that computer. There is no server and nothing hosted, and a case entered on one
laptop stays on that laptop. Why it is built this way is in
[ADR 0007](decisions/0007-desktop-packaging-and-updates.md).

- [Try it on your own laptop](#try-it-on-your-own-laptop)
- [Installing it for RIG](#installing-it-for-rig)
- [Where their data lives, and backups](#where-their-data-lives-and-backups)
- [Releasing an update](#releasing-an-update)
- [How it fits together](#how-it-fits-together)
- [Troubleshooting](#troubleshooting)

---

## Try it on your own laptop

You need the repo set up as in [DEVELOPMENT.md](DEVELOPMENT.md) (`npm install`
done). All commands run from the repo root.

### Quickest: run it from source

```bash
npm run desktop:start
```

Builds the app and opens it in a window. Data goes in a separate
`AI4RIG (development)` folder, so it never mixes with an installed copy. Close
the window (or Cmd+Q) to stop.

### The real installer, on a Mac

```bash
npm run desktop:dist -- --mac
npm run desktop:smoke
```

The first command builds two disk images in `apps/desktop/release/`:

| File | For |
|---|---|
| `AI4RIG-<version>-mac-arm64.dmg` | Apple silicon Macs (M1 and later) |
| `AI4RIG-<version>-mac-x64.dmg` | Intel Macs |

The second starts the packaged app against a throwaway data folder, checks
that it works end to end, and quits it. Then open the `.dmg` and install it
like RIG will (below).

### The real installer, for Windows

The Windows installer can't be built on a Mac: the tool that makes it only
runs on Windows or Intel. GitHub builds it instead:

1. On GitHub, open **Actions → Desktop app → Run workflow**, pick your branch,
   and run it. (A pull request that touches the app runs it automatically.)
2. When it finishes (about 10 minutes), open the run and download
   **AI4RIG-Windows** under *Artifacts*. It holds `AI4RIG-Setup-<version>.exe`.

The same run builds and smoke-tests the Mac installers too (**AI4RIG-macOS**).

On a Windows PC with the repo set up, `npm run desktop:dist -- --win` works
locally as well.

---

## Installing it for RIG

The installers are not signed with a paid certificate, so Windows and macOS
both warn the first time. That is expected; walk them through it once.

### Windows

1. Run `AI4RIG-Setup-<version>.exe`.
2. **"Windows protected your PC"**: click **More info**, then **Run anyway**.
3. It installs for that Windows user only (no administrator rights needed) and
   opens. It is in the Start menu as **AI4RIG** from then on.

### Mac

1. Open the `.dmg` for that Mac (Apple menu → About This Mac: "Chip: Apple"
   means arm64, "Processor: Intel" means x64).
2. Drag **AI4RIG** into **Applications**.
3. Open it from Applications. macOS says it cannot verify the app: click
   **Done**.
4. Open **System Settings → Privacy & Security**, scroll down to the message
   about AI4RIG, click **Open Anyway**, and enter the Mac's password.

After that it opens normally.

### First run

1. Go to **Settings** and paste the OpenAI API key (we set this up with Ari in
   person). It is encrypted with the computer's own keychain and never shown
   again.
2. The ticker list and models are placeholders until RIG sends theirs. They
   can be edited on the **Tickers** and **Models** screens.
3. Cases use client numbers only: no names, no account numbers (ADR 0006).

### Before installing on a managed laptop

If LPL manages their laptops, installing software or running unsigned apps
may be blocked. The Windows installer needs no administrator rights, but
check early in the meeting, and bring the installers on a USB drive as well
as a download link.

---

## Where their data lives, and backups

| | Folder |
|---|---|
| Windows | `%APPDATA%\AI4RIG` |
| macOS | `~/Library/Application Support/AI4RIG` |

**File → Open Data Folder** opens it. Inside:

- `ai4rig.db`: every case, ticker, model, and fee tier
- `openai-key`: the encrypted OpenAI key
- `logs/main.log`: what the app did, for troubleshooting (**Help → Open Log File**)

**Updating or uninstalling never deletes this folder.**

### Backing up

**File → Back Up Database…** (Ctrl/Cmd+Shift+B) saves a copy, even while the
app is open. Save it somewhere that is itself backed up, such as RIG's Box
folder. Don't move the live database itself into a syncing folder: two
copies syncing at once can corrupt it.

### Restoring a backup

1. Quit AI4RIG.
2. In the data folder, delete `ai4rig.db` and any `ai4rig.db-wal` or
   `ai4rig.db-shm`.
3. Copy the backup in and rename it `ai4rig.db`.
4. Open AI4RIG. An older backup is upgraded automatically.

---

## Releasing an update

Updates come from this repo's **GitHub Releases**. Installed apps check when
they start and from **Check for Updates…** in the menu.

1. **Bump the version** in a normal pull request: change `"version"` in
   `apps/desktop/package.json` (for example `0.1.0` → `0.2.0`) and merge it.
2. **Tag main** with that version:

   ```bash
   git checkout main && git pull
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. GitHub Actions checks the tag matches the version, builds and smoke-tests
   both installers, and attaches them to a **draft** release. Check the run
   passed, then edit the notes if you like.
4. **Publish** the draft. Only now can installed apps see it.

What happens on their laptops:

- **Windows:** the update downloads in the background and asks *Restart now*
  or *Later*. Later installs it the next time they close AI4RIG.
- **Mac:** it says a new version is available and opens the download page.
  They drag the new app into Applications, replacing the old one. (A Mac app
  can only replace itself if it is signed with a paid Apple Developer ID,
  $99/year. That is worth adding if RIG keeps using it.)
- **Both:** their data is kept, and any new migrations run on the next start.

To pull back a bad release, delete it on GitHub and release a newer version
with the fix. Installed apps never move to an older version.

---

## How it fits together

```
apps/desktop/
  src/main.ts             Electron: window, menu, backup, updates, single instance
  src/server.ts           starts the API + front end on 127.0.0.1 (no Electron; tested)
  src/secretStore.ts      the encrypted OpenAI key file (no Electron; tested)
  src/updates.ts          checking GitHub Releases
  scripts/build.mjs       builds apps/desktop/stage: what the installer contains
  scripts/after-pack.mjs  signs the Mac app ad hoc so Apple silicon will run it
  scripts/smoke-test.mjs  starts a packaged app and checks it works
  electron-builder.yml    installer settings
.github/workflows/desktop.yml   builds, tests, and drafts releases
```

| Command | What it does |
|---|---|
| `npm run desktop:build` | Fill `apps/desktop/stage` (front end built, main process bundled, migrations copied). |
| `npm run desktop:start` | Build, then run it in a window from source. |
| `npm run desktop:dist -- --mac` | Build the Mac installers into `apps/desktop/release`. `--win` on Windows. |
| `npm run desktop:smoke` | Start the packaged app from `release/`, check it works, quit it. |

On start, the app opens the database in the data folder, runs any new
migrations, loads the placeholder tickers and models **only** into a brand-new
database, and serves the API and the front end from one address on a free
port on 127.0.0.1. The window is the ordinary web app: no Node or Electron
access. Development (`npm run dev`) is unchanged.

`AI4RIG_DATA_DIR=/some/folder` points any copy at another data folder, for
testing an installer without touching real cases.

---

## Troubleshooting

**It won't start.** It shows an error with the path to `logs/main.log`. Send
us that file. Nothing in it identifies a client.

**Mac: "AI4RIG is damaged and can't be opened."** That happens when the app
was copied in a way that stripped its signature. Reinstall from the `.dmg`.
If it persists, run this once in Terminal:

```bash
xattr -cr /Applications/AI4RIG.app
```

**"Estimate with AI" says it is not set up.** Paste the key under
**Settings**.

**Two windows?** It can't run twice; opening it again brings the existing
window to the front.
