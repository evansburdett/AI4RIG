import { appliedMigrationCount, openDatabase, type Db } from '@ai4rig/db';
import cors from 'cors';
import express, { type ErrorRequestHandler, type Express } from 'express';

import type { ApiConfig } from './config.js';
import { constraintStatus } from './errors.js';
import { createClientsRouter } from './routes/clients.js';
import { createModelsRouter } from './routes/models.js';
import { createReferenceDataRouter } from './routes/referenceData.js';

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
 * Routes live in src/routes, one file per resource. Each router gets the
 * database handle passed in, and the SQL lives in src/repositories, so a route
 * reads as: validate the body, call a repository function, send the result.
 *
 * /api/health proves that the web app, the API, and the database are all
 * talking to each other. The web app's header shows its result.
 */
export function createApp({ config, db = openDatabase() }: AppDeps): CreatedApp {
  const app = express();

  // Whole client cases come through here; the default 100kb is tight for a
  // case with many holdings.
  app.use(express.json({ limit: '1mb' }));
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
  app.use(createReferenceDataRouter(db));
  app.use(createModelsRouter(db));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(jsonErrors(config));

  return { app, db };
}

/**
 * Last stop for anything a route threw. Always answers JSON, so the web app
 * can show the message instead of "Unexpected token <".
 */
function jsonErrors(config: ApiConfig): ErrorRequestHandler {
  return (error: unknown, _req, res, _next) => {
    // An HttpError from our own code, or Express's own for a malformed JSON
    // body or one over the size limit, carries its status.
    const constraint = constraintStatus(error);
    const status =
      constraint?.status ??
      (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500);

    if (status >= 500) console.error(error);

    const message = constraint?.message ?? (error instanceof Error ? error.message : String(error));
    res.status(status).json({
      error: status >= 500 && config.nodeEnv === 'production' ? 'Internal server error' : message,
    });
  };
}
