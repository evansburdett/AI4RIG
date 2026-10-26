/**
 * The API and the built front end, running inside the desktop app.
 *
 * Nothing here imports Electron, so it runs (and is tested) as plain Node.
 * main.ts calls startServer() and points a window at the address it returns.
 *
 * Each install has its own database in the user's app-data folder. On every
 * start the migrations run, so installing a newer version upgrades the data
 * in place. RIG's own models and their tickers arrive with the migrations
 * (0012). The placeholder tickers and models are only loaded into a database
 * that is still empty after that, which is none since 0012; sample client
 * cases never are.
 */

import { mkdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { createApp } from '@ai4rig/api/app';
import type { SecretStore } from '@ai4rig/api/secrets';
import { openDatabase, runMigrations, runSeeds, type Db } from '@ai4rig/db';

export interface ServerOptions {
  /** The user's own folder for this app; the database goes in here. */
  readonly dataDir: string;
  /** The built front end (apps/web/dist). */
  readonly webRoot: string;
  readonly migrationsDir: string;
  /** Placeholder tickers and models, loaded once into an empty database. */
  readonly referenceSeedDir: string;
  readonly appVersion: string;
  readonly openAiKey: SecretStore;
}

export interface RunningServer {
  /** Where the window should load, e.g. http://127.0.0.1:52817 */
  readonly url: string;
  readonly db: Db;
  readonly databasePath: string;
  /** Stop serving and close the database; resolves once both are done. */
  close(): Promise<void>;
  /**
   * The same, without waiting: for the app's own quit, where the process is
   * about to end anyway. Closing the database is synchronous, so every write
   * is safely on disk when this returns.
   */
  closeNow(): void;
}

/** The database file inside a data folder. */
export function databasePathIn(dataDir: string): string {
  return join(dataDir, 'ai4rig.db');
}

/**
 * Load the placeholder tickers and models into a database with none at all.
 * Since migration 0012 ships RIG's own, a new install already has some and
 * skips these; the check stays so nothing ever overwrites the advisor's.
 * Their seed replaces its own rows, so running it again would undo any edits
 * the advisor has made to those models.
 */
export function seedReferenceDataIfEmpty(db: Db, referenceSeedDir: string): boolean {
  const count = (table: string) =>
    db.prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? 0;
  if (count('tickers') > 0 || count('model_portfolios') > 0) return false;
  runSeeds(db, referenceSeedDir);
  return true;
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  mkdirSync(options.dataDir, { recursive: true });
  const databasePath = databasePathIn(options.dataDir);
  const db = openDatabase({ path: databasePath });

  try {
    runMigrations(db, options.migrationsDir);
    seedReferenceDataIfEmpty(db, options.referenceSeedDir);
  } catch (error) {
    db.close();
    throw error;
  }

  const { app } = createApp({
    config: {
      // Loopback only: nothing else on the network can reach it.
      host: '127.0.0.1',
      port: 0,
      // The window loads from this same address, so no other origin is allowed.
      webOrigins: [],
      nodeEnv: 'production',
      appVersion: options.appVersion,
    },
    db,
    openAiKey: options.openAiKey,
    webRoot: options.webRoot,
  });

  // Port 0 lets the operating system pick a free one, so the app never fails
  // to start because something else is using a fixed port.
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    listening.on('error', reject);
  });
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    db,
    databasePath,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          if (db.open) db.close();
          resolve();
        });
        // A connection still in the middle of a request would otherwise keep
        // close() waiting until Node's own timeout, a minute later.
        server.closeAllConnections();
      }),
    closeNow: () => {
      server.close();
      server.closeAllConnections();
      if (db.open) db.close();
    },
  };
}
