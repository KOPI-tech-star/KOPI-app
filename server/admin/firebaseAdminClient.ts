import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applicationDefault,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { FirestoreCollectionName } from '../../src/data/firestoreContracts';

export interface FirebaseAdminTargetConfig {
  readonly projectId: string;
  readonly databaseId: string;
}

export type AdcCredentialKind =
  | 'impersonated_service_account'
  | 'authorized_user'
  | 'external_account'
  | 'metadata_or_environment'
  | 'unconfigured';

export interface RuntimeIdentityInspection {
  readonly adcKind: AdcCredentialKind;
  readonly adcFilePath: string | null;
  readonly impersonatedServiceAccount: string | null;
  readonly quotaProjectId: string | null;
  readonly isSharedSandboxRuntime: boolean;
  readonly sandboxAccountEmail: string | null;
}

export interface AdminDocumentSnapshot {
  readonly exists: boolean;
  readonly id: string;
  readonly updateTimeMs: number | null;
  readonly data: Record<string, unknown> | null;
}

export interface AdminTransactionStore {
  getDocument(
    collection: FirestoreCollectionName,
    documentId: string
  ): Promise<AdminDocumentSnapshot>;
  createDocument(
    collection: FirestoreCollectionName,
    documentId: string,
    data: Record<string, unknown>
  ): void;
  updateDocument(
    collection: FirestoreCollectionName,
    documentId: string,
    data: Record<string, unknown>
  ): void;
}

/**
 * Intentionally excludes delete operations so administrative tooling cannot
 * perform arbitrary deletions on Firestore collections or documents.
 * All writes enforce atomic transactions or explicit existence/updateTime preconditions.
 */
export interface AdminFirestoreStore {
  readonly projectId: string;
  readonly databaseId: string;
  getDocument(
    collection: FirestoreCollectionName,
    documentId: string
  ): Promise<AdminDocumentSnapshot>;
  createDocument(
    collection: FirestoreCollectionName,
    documentId: string,
    data: Record<string, unknown>
  ): Promise<void>;
  updateDocument(
    collection: FirestoreCollectionName,
    documentId: string,
    data: Record<string, unknown>,
    expectedUpdateTimeMs?: number | null
  ): Promise<void>;
  runTransaction<T>(
    fn: (txStore: AdminTransactionStore) => Promise<T>
  ): Promise<T>;
}

const DEFAULT_DATABASE_ID = '(default)';
const DISALLOWED_PLACEHOLDERS = new Set([
  'remixed-project-id',
  'remixed-firestore-database-id',
  'your-project-id',
  'your-api-key',
]);

function readRequiredConfigField(
  record: Record<string, unknown>,
  field: string
): string {
  const raw = record[field];
  if (typeof raw !== 'string') {
    throw new Error(`Invalid Firebase target config: "${field}" must be a string.`);
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`Invalid Firebase target config: "${field}" cannot be empty.`);
  }
  if (DISALLOWED_PLACEHOLDERS.has(trimmed.toLowerCase())) {
    throw new Error(
      `Invalid Firebase target config: "${field}" contains an unprovisioned placeholder.`
    );
  }
  return trimmed;
}

export function loadFirebaseAdminTargetConfig(
  options: {
    configPath?: string;
    projectId?: string;
    databaseId?: string;
  } = {}
): FirebaseAdminTargetConfig {
  const configPath =
    options.configPath ??
    path.resolve(process.cwd(), 'firebase-applet-config.json');

  let fileConfig: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Invalid JSON object in "${configPath}".`);
    }
    fileConfig = parsed as Record<string, unknown>;
  } else if (!options.projectId || !options.databaseId) {
    throw new Error(
      `Firebase config file not found at "${configPath}" and explicit --project-id / --database-id were not provided.`
    );
  }

  const projectId = options.projectId
    ? readRequiredConfigField({ projectId: options.projectId }, 'projectId')
    : readRequiredConfigField(fileConfig, 'projectId');

  const databaseId = options.databaseId
    ? readRequiredConfigField({ firestoreDatabaseId: options.databaseId }, 'firestoreDatabaseId')
    : readRequiredConfigField(fileConfig, 'firestoreDatabaseId');

  if (databaseId === DEFAULT_DATABASE_ID) {
    throw new Error(
      'Refusing to target the "(default)" Firestore database. Kopi requires the explicit named Firestore database.'
    );
  }

  return Object.freeze({ projectId, databaseId });
}

export function resolveDefaultGcloudAdcPath(
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  if (process.platform === 'win32' && env.APPDATA) {
    return path.join(env.APPDATA, 'gcloud', 'application_default_credentials.json');
  }
  const configHome = env.CLOUDSDK_CONFIG?.trim() || path.join(os.homedir(), '.config', 'gcloud');
  return path.join(configHome, 'application_default_credentials.json');
}

function inspectCredentialJsonFile(filePath: string): {
  kind: AdcCredentialKind;
  impersonatedServiceAccount: string | null;
  quotaProjectId: string | null;
} {
  let rawText: string;
  try {
    rawText = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(
      `Unable to read ADC file at "${filePath}": ${err instanceof Error ? err.message : 'unknown error'}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`Credential file at "${filePath}" is not valid JSON.`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Credential file at "${filePath}" must be a JSON object.`);
  }

  const record = parsed as Record<string, unknown>;
  if (
    record.type === 'service_account' ||
    'private_key' in record ||
    'private_key_id' in record
  ) {
    throw new Error(
      `Static service account key files are prohibited ("${filePath}"). Use keyless Cloud Shell / gcloud ADC impersonation instead.`
    );
  }

  const quotaProjectId =
    typeof record.quota_project_id === 'string' && record.quota_project_id.trim()
      ? record.quota_project_id.trim()
      : null;

  if (record.type === 'impersonated_service_account') {
    const url =
      typeof record.service_account_impersonation_url === 'string'
        ? record.service_account_impersonation_url
        : '';
    const match = url.match(/serviceAccounts\/([^/:]+@[^/:]+)/);
    return {
      kind: 'impersonated_service_account',
      impersonatedServiceAccount: match ? match[1] : null,
      quotaProjectId,
    };
  }

  if (record.type === 'authorized_user') {
    return {
      kind: 'authorized_user',
      impersonatedServiceAccount: null,
      quotaProjectId,
    };
  }

  if (record.type === 'external_account') {
    return {
      kind: 'external_account',
      impersonatedServiceAccount: null,
      quotaProjectId,
    };
  }

  return {
    kind: 'metadata_or_environment',
    impersonatedServiceAccount: null,
    quotaProjectId,
  };
}

/**
 * Verifies that the active operator environment uses keyless ADC and rejects
 * static service-account JSON key files before initializing firebase-admin.
 */
export function inspectKeylessAdcEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env
): RuntimeIdentityInspection {
  const explicitAdcPath = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const sandboxEmail = env.AUTHORIZED_SERVICE_ACCOUNT_EMAIL?.trim() || null;
  const isSandboxVar = Boolean(sandboxEmail && sandboxEmail.startsWith('ais-sandbox@'));

  if (explicitAdcPath) {
    if (!fs.existsSync(explicitAdcPath)) {
      throw new Error(
        `GOOGLE_APPLICATION_CREDENTIALS points to a missing file: "${explicitAdcPath}".`
      );
    }
    const inspected = inspectCredentialJsonFile(explicitAdcPath);
    return {
      adcKind: inspected.kind,
      adcFilePath: explicitAdcPath,
      impersonatedServiceAccount: inspected.impersonatedServiceAccount,
      quotaProjectId: inspected.quotaProjectId,
      isSharedSandboxRuntime: false,
      sandboxAccountEmail: sandboxEmail,
    };
  }

  const defaultAdcPath = resolveDefaultGcloudAdcPath(env);
  if (fs.existsSync(defaultAdcPath)) {
    const inspected = inspectCredentialJsonFile(defaultAdcPath);
    return {
      adcKind: inspected.kind,
      adcFilePath: defaultAdcPath,
      impersonatedServiceAccount: inspected.impersonatedServiceAccount,
      quotaProjectId: inspected.quotaProjectId,
      isSharedSandboxRuntime: false,
      sandboxAccountEmail: sandboxEmail,
    };
  }

  return {
    adcKind: isSandboxVar ? 'metadata_or_environment' : 'unconfigured',
    adcFilePath: null,
    impersonatedServiceAccount: null,
    quotaProjectId: null,
    isSharedSandboxRuntime: isSandboxVar,
    sandboxAccountEmail: sandboxEmail,
  };
}

export interface InitializedAdminFirestore {
  readonly target: FirebaseAdminTargetConfig;
  readonly identity: RuntimeIdentityInspection;
  readonly app: App;
  readonly db: Firestore;
  readonly store: AdminFirestoreStore;
}

export function initializeFirebaseAdminFirestore(
  options: {
    configPath?: string;
    projectId?: string;
    databaseId?: string;
    appName?: string;
    allowSharedSandbox?: boolean;
  } = {}
): InitializedAdminFirestore {
  const target = loadFirebaseAdminTargetConfig(options);
  const identity = inspectKeylessAdcEnvironment();

  if (identity.isSharedSandboxRuntime && !options.allowSharedSandbox) {
    throw new Error(
      `Refusing to run administrative Firestore operations under AI Studio's shared sandbox identity (${identity.sandboxAccountEmail ?? 'ais-sandbox'}). Run from Google Cloud Shell with impersonated ADC (--impersonate-service-account) instead.`
    );
  }

  const appName = options.appName ?? `kopi-admin-${target.projectId}`;
  const existingApp = getApps().find((candidate) => candidate.name === appName);
  const app =
    existingApp ??
    initializeApp(
      {
        credential: applicationDefault(),
        projectId: target.projectId,
      },
      appName
    );

  // Critical: explicitly target the non-default named Firestore database.
  const db = getFirestore(app, target.databaseId);
  const store = createFirebaseAdminFirestoreStore(db, target);

  return { target, identity, app, db, store };
}

export function createFirebaseAdminFirestoreStore(
  db: Firestore,
  target: FirebaseAdminTargetConfig
): AdminFirestoreStore {
  if (!target.databaseId || target.databaseId === DEFAULT_DATABASE_ID) {
    throw new Error('AdminFirestoreStore requires a non-default named databaseId.');
  }

  return {
    projectId: target.projectId,
    databaseId: target.databaseId,

    async getDocument(collection, documentId) {
      const snap = await db.collection(collection).doc(documentId).get();
      const raw = snap.exists ? snap.data() : undefined;
      return {
        exists: snap.exists,
        id: snap.id,
        updateTimeMs: snap.updateTime ? snap.updateTime.toMillis() : null,
        data:
          raw && typeof raw === 'object' && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : null,
      };
    },

    async createDocument(collection, documentId, data) {
      // Uses Firestore create() which enforces an atomic { exists: false } precondition.
      await db.collection(collection).doc(documentId).create(data);
    },

    async updateDocument(collection, documentId, data, expectedUpdateTimeMs) {
      const docRef = db.collection(collection).doc(documentId);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        if (!snap.exists) {
          throw new Error(
            `CONCURRENT_MODIFICATION_CONFLICT: Cannot update "${collection}/${documentId}" because it does not exist.`
          );
        }
        const liveUpdateMs = snap.updateTime ? snap.updateTime.toMillis() : null;
        if (
          expectedUpdateTimeMs !== undefined &&
          expectedUpdateTimeMs !== null &&
          liveUpdateMs !== expectedUpdateTimeMs
        ) {
          throw new Error(
            `CONCURRENT_MODIFICATION_CONFLICT: "${collection}/${documentId}" was modified concurrently (expected updateTimeMs=${expectedUpdateTimeMs}, actual=${liveUpdateMs}).`
          );
        }
        tx.set(docRef, data, { merge: false });
      });
    },

    async runTransaction<T>(fn: (txStore: AdminTransactionStore) => Promise<T>): Promise<T> {
      return db.runTransaction(async (tx) => {
        const txStore: AdminTransactionStore = {
          async getDocument(collection, documentId) {
            const snap = await tx.get(db.collection(collection).doc(documentId));
            const raw = snap.exists ? snap.data() : undefined;
            return {
              exists: snap.exists,
              id: snap.id,
              updateTimeMs: snap.updateTime ? snap.updateTime.toMillis() : null,
              data:
                raw && typeof raw === 'object' && !Array.isArray(raw)
                  ? (raw as Record<string, unknown>)
                  : null,
            };
          },
          createDocument(collection, documentId, data) {
            tx.create(db.collection(collection).doc(documentId), data);
          },
          updateDocument(collection, documentId, data) {
            tx.set(db.collection(collection).doc(documentId), data, { merge: false });
          },
        };
        return fn(txStore);
      });
    },
  };
}
