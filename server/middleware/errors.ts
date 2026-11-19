import type { NextFunction, Request, Response } from 'express';
import { AppError, type ApiErrorResponse } from '../types/api';
import { getRequestId, sanitizePathForLog } from './requestLogger';

interface BodyParserLikeError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown
) {
  return function wrappedAsyncRoute(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFoundApiHandler(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  next(
    new AppError({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: `API endpoint "${sanitizePathForLog(req.originalUrl || req.url)}" was not found.`,
    })
  );
}

export function createCentralErrorHandler(options: {
  logErrors?: boolean;
} = {}) {
  const logErrors = options.logErrors ?? true;

  return function centralErrorHandler(
    err: unknown,
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    if (res.headersSent) {
      next(err);
      return;
    }

    const requestId = getRequestId(req, res);

    let statusCode = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected internal error occurred.';

    if (err instanceof AppError) {
      statusCode = err.statusCode;
      code = err.code;
      message = err.expose ? err.message : 'An unexpected internal error occurred.';
    } else if (err && typeof err === 'object') {
      const parserErr = err as BodyParserLikeError;
      if (parserErr.type === 'entity.too.large' || parserErr.status === 413) {
        statusCode = 413;
        code = 'PAYLOAD_TOO_LARGE';
        message = 'Request payload exceeds the maximum allowed size.';
      } else if (
        parserErr.type === 'entity.parse.failed' ||
        (parserErr instanceof SyntaxError && parserErr.status === 400)
      ) {
        statusCode = 400;
        code = 'INVALID_JSON';
        message = 'Request body contains malformed JSON.';
      } else if (parserErr.type === 'encoding.unsupported') {
        statusCode = 415;
        code = 'UNSUPPORTED_ENCODING';
        message = 'Unsupported request character encoding.';
      }
    }

    if (logErrors && statusCode >= 500) {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          requestId,
          method: req.method,
          path: sanitizePathForLog(req.originalUrl || req.url || '/'),
          statusCode,
          code,
        })
      );
    }

    const payload: ApiErrorResponse = {
      error: {
        code,
        message,
        requestId,
      },
    };

    res.status(statusCode).json(payload);
  };
}
