# Installing and updating AI4RIG

A short guide for RIG. Each computer has its own copy of the app and its own
cases. Cases stay on the computer they were entered on unless you move them
(see the last section).

## Windows

**First install**

1. Go to <https://github.com/evansburdett/AI4RIG/releases/latest>.
2. Under **Assets**, download `AI4RIG-Setup-<version>.exe`.
3. Open it. If Windows shows "Windows protected your PC", click **More info**,
   then **Run anyway**. It installs for you only and needs no administrator
   rights.
4. AI4RIG opens, and it is on the Start menu from then on.

**Updates**

Nothing to do. When a new version is out, AI4RIG downloads it in the background
and asks **Restart now** or **Later**. Later installs it the next time you close
the app.

## Mac

**First install**

1. Go to <https://github.com/evansburdett/AI4RIG/releases/latest>.
2. Under **Assets**, download the `.dmg` for your Mac:
   - `AI4RIG-<version>-mac-arm64.dmg` for Apple silicon (M1 and later)
   - `AI4RIG-<version>-mac-x64.dmg` for Intel
3. Open the `.dmg` and drag **AI4RIG** into **Applications**.
4. Open AI4RIG from Applications. macOS says it cannot verify the app: click
   **Done**.
5. Open **System Settings → Privacy & Security**, scroll down to the message
   about AI4RIG, click **Open Anyway**, and enter the Mac's password.

**Updates**

When a new version is out, AI4RIG asks **Install and reopen** or **Later**.
Install and reopen downloads it, closes AI4RIG, puts the new version in
Applications, and opens it again, in about a minute. There is nothing to drag
and no need to visit Privacy & Security again.

Updating to 0.1.7 is the last time to do it by hand: download the new `.dmg`,
quit AI4RIG (**AI4RIG → Quit**, or Command-Q), then drag AI4RIG into
Applications and choose **Replace**. You may need to repeat step 5 once.

If AI4RIG was opened straight from the `.dmg` or from Downloads, it cannot
replace itself and downloads the `.dmg` in your browser instead. Drag it into
Applications once and open it from there.

**Password after an update:** AI4RIG keeps the keys you saved in Settings
encrypted in your Mac's keychain, and the first time a new version opens, the
Mac asks for your password before it can unlock them. AI4RIG says so just
before. Type the password you use to log in to the Mac and click **Always
Allow** (not **Allow**), and it will not ask again until the next update.

## Both

- **Your cases are kept** through every update.
- **Settings:** paste the Market Data key (live prices) and the OpenAI key (AI
  life expectancy) once on each computer. They are stored encrypted and never
  shown again.
- **Backups:** **File → Back Up Database…** saves a copy whenever you like.
- **Moving cases to another computer:** on **Settings**, **Export cases**
  saves them to a file. On the other computer, **Import cases…** brings them in
  alongside the cases already there. If a case number is already on that
  computer, it is replaced by the file's unless you choose to keep yours or
  keep both. A backup is taken before every import.
