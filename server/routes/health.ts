import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../middleware/errors';
import type {
  ApiSuccessResponse,
  DatabaseHealthStatus,
  HealthStatusData,
} from '../types/api';

export interface HealthRouterOptions {
  checkDatabaseHealth?: () => Promise<DatabaseHealthStatus>;
}

export function createHealthRouter(options: HealthRouterOptions = {}): Router {
  const router = Router();
  const checkDatabaseHealth =
    options.checkDatabaseHealth ?? (async () => 'not_configured');

  router.get(
    '/',
    asyncHandler(async (_req: Request, res: Response) => {
      const database = await checkDatabaseHealth().catch(
        (): DatabaseHealthStatus => 'unavailable'
      );

      res.setHeader('Cache-Control', 'no-store');
      const payload: ApiSuccessResponse<HealthStatusData> = {
        data: {
          service: 'kopi-api',
          status: 'running',
          database,
          timestamp: new Date().toISOString(),
        },
      };
      res.status(200).json(payload);
    })
  );

  return router;
}
