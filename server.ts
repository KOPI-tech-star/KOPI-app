import 'dotenv/config';
import http from 'node:http';
import { createApp } from './server/app';
import { parseEnv } from './server/config/env';
import { closeDatabasePool } from './server/db/pool';

async function startServer(): Promise<void> {
  const env = parseEnv(process.env);
  const httpServer = http.createServer();

  let registerFrontendMiddleware: ((app: import('express').Express) => void) | undefined;

  if (!env.isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true' ? { server: httpServer } : false,
      },
      appType: 'spa',
    });

    registerFrontendMiddleware = (expressApp) => {
      expressApp.use(vite.middlewares);
    };
  }

  const app = createApp({
    env,
    registerFrontendMiddleware,
  });

  httpServer.on('request', app);

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(env.port, '0.0.0.0', () => {
      httpServer.removeListener('error', reject);
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'info',
          event: 'server_started',
          service: 'kopi-api',
          nodeEnv: env.nodeEnv,
          port: env.port,
        })
      );
      resolve();
    });
  });

  const shutdown = (signal: string) => {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        event: 'server_stopping',
        signal,
      })
    );
    httpServer.close(() => {
      void closeDatabasePool()
        .catch(() => {})
        .finally(() => {
          process.exit(0);
        });
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startServer().catch((err) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      event: 'server_startup_failed',
      message: err instanceof Error ? err.message : 'Unknown startup error',
    })
  );
  process.exit(1);
});
