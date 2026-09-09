import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const { app, db } = createApp({ config });

const server = app.listen(config.port, config.host);

// Register both handlers before anything can fire, and announce success only
// from the 'listening' event - otherwise a failed bind still prints
// "API listening on ...", which sends you looking in the wrong place.
server.on('listening', () => {
  console.log(`API listening on http://${config.host}:${config.port}`);
  console.log(`health check     http://${config.host}:${config.port}/api/health`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `\nPort ${config.port} is already in use — most likely an API you started earlier is still running.\n` +
        `Run "npm run doctor" to see what is holding it, or change API_PORT in .env.\n`,
    );
    process.exit(1);
  }
  throw error;
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
