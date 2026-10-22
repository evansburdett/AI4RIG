import { appliedMigrationCount, openDatabase, type Db } from '@ai4rig/db';
import cors from 'cors';
import express, { type ErrorRequestHandler, type Express } from 'express';

import { DEFAULT_OPENAI_MODEL, type ApiConfig } from './config.js';
import { constraintStatus } from './errors.js';
import { openAiEstimator, type Estimator } from './lifeExpectancy.js';
import { createClientsRouter } from './routes/clients.js';
import { createLifeExpectancyRouter } from './routes/lifeExpectancy.js';
import { createModelsRouter } from './routes/models.js';
import { createReferenceDataRouter } from './routes/referenceData.js';
import { createSettingsRouter } from './routes/settings.js';
import { envSecretStore, type SecretStore } from './secrets.js';

export interface AppDeps {
  config: ApiConfig;
  /** Injected by tests so they can point at a temp database. */
  db?: Db;
  /** Injected by tests so they never call OpenAI. */
  estimator?: Estimator;
  /**
   * Where the OpenAI key lives. Defaults to OPENAI_API_KEY from .env, read
   * only; the desktop app passes a store the Settings screen can write.
   */
  openAiKey?: SecretStore;
  /**
   * A built front end (apps/web/dist) to serve from this same address. The
   * desktop app uses it so the window and the API share one origin; in
   * development Vite serves the front end instead and this is left unset.
   */
  webRoot?: string;
}

export interface CreatedApp {
  app: Express;
  db: Db;
}

/**
 * The front end only talks to this same address, so the browser is told to
 * load nothing from anywhere else. Inline styles stay allowed because React
 * sets widths and colours through the style attribute.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Build the Express app.
 *
 * Routes live in src/routes, one file per resource. Each router gets the
 * database handle passed in, and the SQL lives in src/repositories, so a route
 * reads as: validate the body, call a repository function, send the result.
 *
 * /api/health proves that the web app, the API, and the database are all
 * talking to each other. The web app's footer shows its result.
 */
export function createApp({
  config,
  db = openDatabase(),
  openAiKey = envSecretStore(config.openAiApiKey),
  estimator,
  webRoot,
}: AppDeps): CreatedApp {
  const openAiModel = config.openAiModel ?? DEFAULT_OPENAI_MODEL;
  const estimate =
    estimator ?? openAiEstimator({ apiKey: () => openAiKey.get(), model: openAiModel });

  const app = express();
  app.disable('x-powered-by');

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
      appVersion: config.appVersion ?? null,
      // Whether US-28 estimates can work here. Never the key itself.
      lifeExpectancyEstimates: openAiKey.get() !== undefined,
      time: new Date().toISOString(),
    });
  });

  app.use(createClientsRouter(db));
  app.use(createReferenceDataRouter(db));
  app.use(createModelsRouter(db));
  app.use(createLifeExpectancyRouter(estimate));
  app.use(createSettingsRouter({ openAiKey, openAiModel }));

  if (webRoot !== undefined) {
    app.use((req, res, next) => {
      if (!req.path.startsWith('/api/')) res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
      next();
    });
    // The app routes with the URL hash, so the only page is index.html.
    app.use(express.static(webRoot, { index: 'index.html', fallthrough: true }));
  }

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
