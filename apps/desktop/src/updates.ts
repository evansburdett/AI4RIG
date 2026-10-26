/**
 * Updates, from the project's GitHub Releases (docs/DESKTOP.md, "Releasing
 * an update"). The installed app checks once at start and from the menu.
 *
 * Windows: a newer version downloads in the background and the advisor is
 * asked whether to restart now; otherwise it installs when the app quits.
 *
 * macOS: an app has to be signed with a paid Apple Developer ID to replace
 * itself, and this one is not, so it only says a new version is out and opens
 * the download page. Installing it is the same drag to Applications as the
 * first time; the data is untouched.
 *
 * Drafts are invisible to installed apps, so an update reaches RIG only once
 * someone publishes the GitHub release.
 */

import { app, dialog, shell, type BrowserWindow, type MessageBoxOptions } from 'electron';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;

export const RELEASES_URL = 'https://github.com/evansburdett/AI4RIG/releases';

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

  autoUpdater.on('update-available', (info) => {
    if (canInstall) return; // It downloads, then 'update-downloaded' asks.
    void tell({
      type: 'info',
      message: `AI4RIG ${info.version} is available`,
      detail: `You have ${app.getVersion()}. Download the new version and drag it into Applications, replacing this one. Your cases are kept.`,
      buttons: ['Open download page', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then((response) => {
      if (response === 0) void shell.openExternal(`${RELEASES_URL}/latest`);
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
