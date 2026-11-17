/**
 * Updates, from the project's GitHub Releases (docs/DESKTOP.md, "Releasing
 * an update"). The installed app checks once at start and from the menu.
 *
 * Windows: a newer version downloads in the background and the advisor is
 * asked whether to restart now; otherwise it installs when the app quits.
 *
 * macOS: the usual updater needs a paid Apple Developer ID, so the app
 * installs the update itself (macInstall.ts): one click downloads it, checks
 * it, swaps it in, and reopens. Where it cannot replace itself, the right
 * .dmg opens in the browser instead. Either way the data is untouched.
 *
 * Drafts are invisible to installed apps, so an update reaches RIG only once
 * someone publishes the GitHub release.
 */

import { app, dialog, shell, type BrowserWindow, type MessageBoxOptions } from 'electron';
import electronUpdater, { type UpdateInfo } from 'electron-updater';

import {
  bundlePath,
  cannotReplace,
  macDmgUrl,
  pickMacZip,
  prepareUpdate,
  signerRequirement,
  swapOnQuit,
} from './macInstall.js';

const { autoUpdater } = electronUpdater;

export const RELEASES_URL = 'https://github.com/evansburdett/AI4RIG/releases';

/**
 * For a trial run only (apps/desktop/scripts/try-mac-update.mjs): read updates
 * from this folder on a local server instead of GitHub.
 */
const TRIAL_FEED = process.env.AI4RIG_UPDATE_FEED?.replace(/\/$/, '') || undefined;
/** What a trial run's app is reopened with after updating, so it keeps its own data folder. */
const TRIAL_ENV = ['AI4RIG_DATA_DIR', 'AI4RIG_UPDATE_FEED']
  .filter((name) => (process.env[name] ?? '') !== '')
  .map((name) => `${name}=${process.env[name]}`);

export interface Updates {
  /** `manual` is a menu click: say so even when there is nothing new. */
  check(manual: boolean): Promise<void>;
}

export function setUpUpdates(window: () => BrowserWindow | null, log: (message: string) => void): Updates {
  async function tell(options: MessageBoxOptions): Promise<number> {
    const parent = window();
    const { response } = parent === null ? await dialog.showMessageBox(options) : await dialog.showMessageBox(parent, options);
    return response;
  }

  if (!app.isPackaged) {
    return {
      check: async (manual) => {
        if (manual) await tell({ type: 'info', message: 'Updates are only checked in the installed app.' });
      },
    };
  }

  if (TRIAL_FEED !== undefined) {
    log(`updates: trial run, reading updates from ${TRIAL_FEED}`);
    autoUpdater.setFeedURL({ provider: 'generic', url: TRIAL_FEED });
  }

  const canInstall = process.platform === 'win32';
  autoUpdater.autoDownload = canInstall;
  autoUpdater.autoInstallOnAppQuit = canInstall;
  autoUpdater.logger = {
    info: (message: unknown) => log(`updates: ${String(message)}`),
    warn: (message: unknown) => log(`updates: ${String(message)}`),
    error: (message: unknown) => log(`updates: ${String(message)}`),
    debug: () => undefined,
  };

  let manual = false;

  /** The Mac's own install (RIG, 11/17): download, check, swap in, reopen. */
  async function installOnMac(info: UpdateInfo): Promise<void> {
    const dmg = macDmgUrl(RELEASES_URL, info.version, process.arch);
    const bundle = bundlePath(process.execPath);
    const blocked = cannotReplace(bundle);
    const zip = pickMacZip(info.files, process.arch);
    if (blocked !== null || zip === null || bundle === null) {
      log(`updates: cannot install in place (${blocked ?? 'no zip for this Mac'}); opening the .dmg`);
      await tell({
        type: 'info',
        message: `AI4RIG ${info.version} is available`,
        detail:
          'AI4RIG cannot update itself from where it is running. The new version will download in your browser: open it, then drag AI4RIG into Applications. Your cases are kept.',
        buttons: ['Download'],
      });
      void shell.openExternal(dmg);
      return;
    }

    const parent = window();
    try {
      const base = TRIAL_FEED ?? `${RELEASES_URL}/download/v${info.version}`;
      const prepared = await prepareUpdate(
        `${base}/${zip.url}`,
        zip.sha512,
        (f) => parent?.setProgressBar(f),
        await signerRequirement(bundle),
      );
      parent?.setProgressBar(-1);
      log(`updates: ${info.version} downloaded and checked; swapping it in on quit`);
      swapOnQuit(prepared, bundle, TRIAL_ENV);
      app.quit();
    } catch (error: unknown) {
      parent?.setProgressBar(-1);
      log(`updates: install failed: ${String(error)}`);
      const response = await tell({
        type: 'warning',
        message: 'The update did not install',
        detail: 'AI4RIG is unchanged. You can try again later, or download the new version in your browser.',
        buttons: ['Download in browser', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) void shell.openExternal(dmg);
    }
  }

  autoUpdater.on('update-available', (info) => {
    if (canInstall) return; // It downloads, then 'update-downloaded' asks.
    void tell({
      type: 'info',
      message: `AI4RIG ${info.version} is available`,
      detail: `You have ${app.getVersion()}. Install it now and AI4RIG will close, update, and open again in a minute or so. Your cases are kept.`,
      buttons: ['Install and reopen', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then((response) => {
      if (response === 0) void installOnMac(info);
    });
  });

  autoUpdater.on('update-not-available', () => {
    if (manual) void tell({ type: 'info', message: `You have the latest version (${app.getVersion()}).` });
  });

  autoUpdater.on('update-downloaded', (info) => {
    void tell({
      type: 'info',
      message: `AI4RIG ${info.version} is ready to install`,
      detail: 'Restart now to finish updating, or it will install the next time you close AI4RIG. Your cases are kept.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then((response) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  // The updater's own logger has already written the details.
  autoUpdater.on('error', () => {
    if (manual) {
      void tell({
        type: 'warning',
        message: 'Could not check for updates',
        detail: 'Check the internet connection and try again. AI4RIG works normally without updating.',
      });
    }
  });

  return {
    async check(isManual) {
      manual = isManual;
      try {
        await autoUpdater.checkForUpdates();
      } catch {
        // Reported through the 'error' event above.
      }
    },
  };
}
