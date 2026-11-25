import fs from 'node:fs';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../middleware/errors';
import type {
  ApiSuccessResponse,
  DatabaseHealthStatus,
  FirestoreHealthDiagnostics,
  HealthStatusData,
} from '../types/api';

export interface HealthRouterOptions {
  checkFirestoreDiagnostics?: () => Promise<FirestoreHealthDiagnostics>;
  firebaseConfigPath?: string;
}

export function readDefaultFirestoreDiagnostics(
  configPath: string = path.resolve(process.cwd(), 'firebase-applet-config.json')
): FirestoreHealthDiagnostics {
  try {
    if (!fs.existsSync(configPath)) {
      return {
        provider: 'firebase_firestore',
        projectId: null,
        databaseId: null,
        clientSdkAccess: 'unconfigured',
        privilegedServerAccess: 'unavailable',
      };
    }

    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      projectId?: unknown;
      firestoreDatabaseId?: unknown;
    };

    const projectId =
      typeof parsed.projectId === 'string' && parsed.projectId.trim().length > 0
        ? parsed.projectId.trim()
        : null;
    const databaseId =
      typeof parsed.firestoreDatabaseId === 'string' &&
      parsed.firestoreDatabaseId.trim().length > 0 &&
      parsed.firestoreDatabaseId.trim() !== '(default)'
        ? parsed.firestoreDatabaseId.trim()
        : null;

    const configured = Boolean(projectId && databaseId);
    return {
      provider: 'firebase_firestore',
      projectId,
      databaseId,
      clientSdkAccess: configured ? 'restricted_demo_get_only' : 'unconfigured',
      privilegedServerAccess: 'unavailable',
    };
  } catch {
    return {
      provider: 'firebase_firestore',
      projectId: null,
      databaseId: null,
      clientSdkAccess: 'unconfigured',
      privilegedServerAccess: 'unavailable',
    };
  }
}

export function createHealthRouter(options: HealthRouterOptions = {}): Router {
  const router = Router();
  const checkFirestoreDiagnostics =
    options.checkFirestoreDiagnostics ??
    (async () => readDefaultFirestoreDiagnostics(options.firebaseConfigPath));

  router.get(
    '/',
    asyncHandler(async (_req: Request, res: Response) => {
      const firestore = await checkFirestoreDiagnostics().catch(
        (): FirestoreHealthDiagnostics => ({
          provider: 'firebase_firestore',
          projectId: null,
          databaseId: null,
          clientSdkAccess: 'unconfigured',
          privilegedServerAccess: 'unavailable',
        })
      );

      const database: DatabaseHealthStatus =
        firestore.clientSdkAccess === 'restricted_demo_get_only'
          ? 'firestore_client_configured'
          : 'unconfigured';

      res.setHeader('Cache-Control', 'no-store');
      const payload: ApiSuccessResponse<HealthStatusData> = {
        data: {
          service: 'kopi-api',
          status: 'running',
          database,
          firestore,
          timestamp: new Date().toISOString(),
        },
      };
      res.status(200).json(payload);
    })
  );

  return router;
}
