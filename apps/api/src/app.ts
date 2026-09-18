import { appliedMigrationCount, openDatabase, type Db } from '@ai4rig/db';
import cors from 'cors';
import express, { type Express } from 'express';

import type { ApiConfig } from './config.js';

import { createClientsRouter } from './routes/clients.js';

export interface AppDeps {
  config: ApiConfig;
  /** Injected by tests so they can point at a temp database. */
  db?: Db;
}

export interface CreatedApp {
  app: Express;
  db: Db;
}

/**
 * Build the Express app.
 *
 * There is exactly one route here on purpose: /api/health proves that the web
 * app, the API, and the database are all talking to each other. Real routes
 * are the team's work.
 */
export function createApp({ config, db = openDatabase() }: AppDeps): CreatedApp {
  const app = express();

  app.use(express.json());
  app.use(cors({ origin: config.webOrigins }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      // db.name is the file this process actually opened, not what .env
      // says it should be — which is the useful thing when they disagree.
      databasePath: db.name,
      migrationsApplied: appliedMigrationCount(db),
      apiHost: config.host,
      apiPort: config.port,
      nodeEnv: config.nodeEnv,
      time: new Date().toISOString(),
    });
  });

  app.use(createClientsRouter(db));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return { app, db };
}
