import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const MAX_LOG_PATH_LENGTH = 160;

export function sanitizePathForLog(rawUrl: string): string {
  const pathOnly = rawUrl.split('?')[0]?.split('#')[0] ?? '/';
  const cleaned = pathOnly.replace(/[\u0000-\u001F\u007F]/g, '');
  if (!cleaned) return '/';
  if (cleaned.length > MAX_LOG_PATH_LENGTH) {
    return `${cleaned.slice(0, MAX_LOG_PATH_LENGTH)}...`;
  }
  return cleaned;
}

export function getRequestId(req: Request, res: Response): string {
  const existing = res.locals.requestId;
  if (typeof existing === 'string' && existing.length > 0) {
    return existing;
  }
  const fallback = randomUUID();
  res.locals.requestId = fallback;
  return fallback;
}

export function attachRequestId(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

const STATIC_ASSET_PREFIXES = [
  '/src/',
  '/node_modules/',
  '/@',
  '/assets/',
  '/firebase-applet-config.json',
];

export function shouldLogRequest(path: string, statusCode: number): boolean {
  if (statusCode >= 400) {
    return true;
  }
  return !STATIC_ASSET_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function createRequestLogger(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;

  return function requestLogger(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    if (!enabled) {
      next();
      return;
    }

    const startNs = process.hrtime.bigint();
    const requestId = getRequestId(req, res);
    const method = req.method;
    const sanitizedPath = sanitizePathForLog(req.originalUrl || req.url || '/');

    res.on('finish', () => {
      if (!shouldLogRequest(sanitizedPath, res.statusCode)) {
        return;
      }
      const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
      const entry = {
        timestamp: new Date().toISOString(),
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        requestId,
        method,
        path: sanitizedPath,
        statusCode: res.statusCode,
        durationMs: Number(elapsedMs.toFixed(2)),
      };
      console.log(JSON.stringify(entry));
    });

    next();
  };
}
