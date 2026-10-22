/**
 * The desktop app (ADR 0003, ADR 0007). Starts the API and the built front
 * end inside this process, on a free port on 127.0.0.1, and shows them in a
 * window. Each install keeps its own database in the user's app-data folder:
 *
 *   macOS    ~/Library/Application Support/AI4RIG/ai4rig.db
 *   Windows  %APPDATA%\AI4RIG\ai4rig.db
 *
 * See docs/DESKTOP.md for building, installing, and releasing updates.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { app, BrowserWindow, dialog, Menu, safeStorage, shell, type MenuItemConstructorOptions } from 'electron';

import { fileSecretStore } from './secretStore.js';
import { startServer, type RunningServer } from './server.js';
import { RELEASES_URL, setUpUpdates, type Updates } from './updates.js';

// AI4RIG_DATA_DIR points a copy at another data folder, for testing an
// installer without touching real cases. Otherwise a development run
// (`npm run desktop:start`) keeps its data apart from an installed copy.
if (process.env.AI4RIG_DATA_DIR !== undefined && process.env.AI4RIG_DATA_DIR !== '') {
  app.setPath('userData', process.env.AI4RIG_DATA_DIR);
} else if (!app.isPackaged) {
  app.setPath('userData', join(app.getPath('appData'), 'AI4RIG (development)'));
}

const dataDir = app.getPath('userData');
const logDir = join(dataDir, 'logs');
const logFile = join(logDir, 'main.log');

function log(message: string): void {
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    mkdirSync(logDir, { recursive: true });
    appendFileSync(logFile, line);
  } catch {
    // Logging must never be what stops the app.
  }
  console.log(line.trimEnd());
}

let server: RunningServer | null = null;
let mainWindow: BrowserWindow | null = null;
let updates: Updates | null = null;

function createWindow(url: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'AI4RIG',
    show: false,
    webPreferences: {
      // The page is the plain web app: no Node, no Electron APIs.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const origin = new URL(url).origin;

  // Stay on the app; anything else opens in the normal browser.
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith('https://')) void shell.openExternal(target);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, target) => {
    if (new URL(target).origin !== origin) {
      event.preventDefault();
      if (target.startsWith('https://')) void shell.openExternal(target);
    }
  });

  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  void window.loadURL(url);
  return window;
}

async function backUpDatabase(): Promise<void> {
  if (server === null) return;
  const stamp = new Date().toISOString().slice(0, 10);
  const options = {
    title: 'Back up the AI4RIG database',
    defaultPath: join(app.getPath('documents'), `AI4RIG backup ${stamp}.db`),
    filters: [{ name: 'AI4RIG database', extensions: ['db'] }],
  };
  const choice = mainWindow === null ? await dialog.showSaveDialog(options) : await dialog.showSaveDialog(mainWindow, options);
  if (choice.canceled || choice.filePath === undefined) return;

  try {
    // SQLite's own backup: a consistent copy even while the app is open.
    await server.db.backup(choice.filePath);
    log(`backed up the database to ${choice.filePath}`);
    await dialog.showMessageBox({
      type: 'info',
      message: 'Backup saved',
      detail: `${choice.filePath}\n\nKeep it somewhere that is itself backed up, such as Box.`,
    });
  } catch (error) {
    log(`backup failed: ${String(error)}`);
    dialog.showErrorBox('Backup failed', String(error));
  }
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin';
  const checkForUpdates: MenuItemConstructorOptions = {
    label: 'Check for Updates…',
    click: () => void updates?.check(true),
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              checkForUpdates,
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'Back Up Database…', accelerator: 'CmdOrCtrl+Shift+B', click: () => void backUpDatabase() },
        { label: 'Open Data Folder', click: () => void shell.openPath(dataDir) },
        ...(isMac ? [] : [{ type: 'separator' } as const, { role: 'quit' } as const]),
      ],
    },
    // Without an Edit menu, copy and paste do not work on macOS.
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        ...(isMac ? [] : [checkForUpdates, { type: 'separator' } as const]),
        { label: 'Release Notes', click: () => void shell.openExternal(RELEASES_URL) },
        { label: 'Open Log File', click: () => void shell.openPath(logFile) },
        ...(isMac ? [] : [{ role: 'about' } as const]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function start(): Promise<void> {
  log(`starting AI4RIG ${app.getVersion()} (${process.platform}/${process.arch}), data in ${dataDir}`);

  const appDir = app.getAppPath();
  server = await startServer({
    dataDir,
    webRoot: join(appDir, 'web'),
    migrationsDir: join(appDir, 'db', 'migrations'),
    referenceSeedDir: join(appDir, 'db', 'reference-seed'),
    appVersion: app.getVersion(),
    openAiKey: fileSecretStore(join(dataDir, 'openai-key'), {
      isAvailable: () => safeStorage.isEncryptionAvailable(),
      encrypt: (plain) => safeStorage.encryptString(plain),
      decrypt: (encrypted) => safeStorage.decryptString(encrypted),
    }),
  });
  log(`serving on ${server.url}, database ${server.databasePath}`);

  app.setAboutPanelOptions({
    applicationName: 'AI4RIG',
    applicationVersion: app.getVersion(),
    copyright: 'Railroad Investment Group · Auburn Senior Design Team 22',
  });

  buildMenu();
  mainWindow = createWindow(server.url);
  updates = setUpUpdates(() => mainWindow, log);
  // Let the window appear first; a slow network should not delay it.
  setTimeout(() => void updates?.check(false), 5_000);
}

// One copy at a time: a second launch brings the open window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow === null) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on('window-all-closed', () => {
    // macOS apps stay running with no window, as Mac users expect.
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (mainWindow === null && server !== null) mainWindow = createWindow(server.url);
  });

  // Synchronous on purpose: delaying the quit to wait for anything here is
  // what makes an Electron app refuse to close, and it would also skip the
  // Windows updater's install-on-quit.
  app.on('will-quit', () => {
    if (server === null) return;
    server.closeNow();
    server = null;
    log('stopped');
  });

  app
    .whenReady()
    .then(start)
    .catch((error: unknown) => {
      const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
      log(`could not start: ${detail}`);
      dialog.showErrorBox(
        'AI4RIG could not start',
        `${error instanceof Error ? error.message : String(error)}\n\nDetails are in ${logFile}`,
      );
      app.exit(1);
    });
}
