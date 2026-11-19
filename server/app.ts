import fs from 'node:fs';
import path from 'node:path';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
  Router,
} from 'express';
import type { ServerEnv } from './config/env';
import { checkDatabaseConnectivity } from './db/pool';
import {
  createCentralErrorHandler,
  notFoundApiHandler,
} from './middleware/errors';
import {
  attachRequestId,
  createRequestLogger,
} from './middleware/requestLogger';
import { createHealthRouter } from './routes/health';
import { AppError, type DatabaseHealthStatus } from './types/api';

export interface CreateAppOptions {
  env: ServerEnv;
  distDir?: string;
  enableRequestLogging?: boolean;
  enableErrorLogging?: boolean;
  checkDatabaseHealth?: () => Promise<DatabaseHealthStatus>;
  registerFrontendMiddleware?: (app: Express) => void;
  registerTestRoutes?: (apiRouter: Router) => void;
}

const MAX_API_JSON_BODY_SIZE = '64kb';

function securityHeadersMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );
  next();
}

function enforceJsonBodyMediaType(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const methodsWithBody = ['POST', 'PUT', 'PATCH'];
  if (!methodsWithBody.includes(req.method)) {
    next();
    return;
  }

  const contentLength = Number(req.headers['content-length'] ?? '0');
  const hasTransferEncoding = Boolean(req.headers['transfer-encoding']);
  const hasBody =
    (Number.isFinite(contentLength) && contentLength > 0) ||
    hasTransferEncoding;

  if (hasBody && !req.is('application/json')) {
    next(
      new AppError({
        statusCode: 415,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'API requests with a body must use Content-Type: application/json.',
      })
    );
    return;
  }

  next();
}

function registerProductionFrontend(app: Express, distDir: string): void {
  const resolvedDist = path.resolve(distDir);
  const indexHtmlPath = path.join(resolvedDist, 'index.html');

  app.use(
    express.static(resolvedDist, {
      index: false,
      maxAge: '1h',
    })
  );

  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) {
      next();
      return;
    }

    if (!fs.existsSync(indexHtmlPath)) {
      next(
        new AppError({
          statusCode: 503,
          code: 'FRONTEND_NOT_BUILT',
          message: 'Frontend build artifacts are unavailable.',
          expose: true,
        })
      );
      return;
    }

    res.sendFile(indexHtmlPath, (err) => {
      if (err) {
        next(err);
      }
    });
  });
}

export function createApp(options: CreateAppOptions): Express {
  const {
    env,
    distDir = path.resolve(process.cwd(), 'dist'),
    enableRequestLogging = env.nodeEnv !== 'test',
    enableErrorLogging = env.nodeEnv !== 'test',
    checkDatabaseHealth = () => checkDatabaseConnectivity(env),
    registerFrontendMiddleware,
    registerTestRoutes,
  } = options;

  const app = express();
  app.disable('x-powered-by');

  app.use(securityHeadersMiddleware);
  app.use(attachRequestId);
  app.use(createRequestLogger({ enabled: enableRequestLogging }));

  // Scoped API router ensures /api/* never falls through to Vite or SPA HTML
  const apiRouter = Router();
  apiRouter.use(enforceJsonBodyMediaType);
  apiRouter.use(express.json({ limit: MAX_API_JSON_BODY_SIZE, strict: true }));

  apiRouter.use('/health', createHealthRouter({ checkDatabaseHealth }));

  if (registerTestRoutes) {
    registerTestRoutes(apiRouter);
  }

  apiRouter.use(notFoundApiHandler);
  app.use('/api', apiRouter);

  if (registerFrontendMiddleware) {
    registerFrontendMiddleware(app);
  } else if (env.isProduction) {
    registerProductionFrontend(app, distDir);
  }

  app.use(createCentralErrorHandler({ logErrors: enableErrorLogging }));

  return app;
}
