import {
  getApp,
  getApps,
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import rawFirebaseConfig from '../../firebase-applet-config.json';

export interface FirebaseClientConfig extends FirebaseOptions {
  readonly projectId: string;
  readonly appId: string;
  readonly apiKey: string;
  readonly authDomain: string;
  readonly firestoreDatabaseId: string;
  readonly storageBucket?: string;
  readonly messagingSenderId?: string;
  readonly measurementId?: string;
  readonly oAuthClientId?: string;
  readonly recaptchaSiteKey?: string;
}

export interface FirebaseClientServices {
  readonly config: FirebaseClientConfig;
  readonly app: FirebaseApp;
  readonly auth: Auth;
  readonly db: Firestore;
}

export interface FirestoreDatabaseTarget {
  readonly projectId: string;
  readonly databaseId: string;
}

const DEFAULT_DATABASE_ID = '(default)';
const DISALLOWED_PLACEHOLDERS = new Set([
  'remixed-project-id',
  'remixed-firestore-database-id',
  'your-project-id',
  'your-api-key',
]);

function readRequiredString(
  record: Record<string, unknown>,
  field: string
): string {
  const value = record[field];
  if (typeof value !== 'string') {
    throw new Error(`Invalid Firebase configuration: "${field}" must be a string.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Invalid Firebase configuration: "${field}" cannot be empty.`);
  }

  if (DISALLOWED_PLACEHOLDERS.has(trimmed.toLowerCase())) {
    throw new Error(
      `Invalid Firebase configuration: "${field}" contains an unprovisioned placeholder.`
    );
  }

  return trimmed;
}

function readOptionalString(
  record: Record<string, unknown>,
  field: string
): string | undefined {
  const value = record[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`Invalid Firebase configuration: "${field}" must be a string when set.`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Validates that the client configuration comes from a provisioned Firebase applet
 * config with an explicit non-default named Firestore database and zero admin secrets.
 */
export function validateFirebaseClientConfig(
  input: unknown
): FirebaseClientConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid Firebase configuration: expected a JSON object.');
  }

  const record = input as Record<string, unknown>;

  if (
    'private_key' in record ||
    'privateKey' in record ||
    'client_email' in record ||
    record.type === 'service_account'
  ) {
    throw new Error(
      'Invalid Firebase configuration: service-account credentials are prohibited in client code.'
    );
  }

  const projectId = readRequiredString(record, 'projectId');
  const appId = readRequiredString(record, 'appId');
  const apiKey = readRequiredString(record, 'apiKey');
  const authDomain = readRequiredString(record, 'authDomain');
  const firestoreDatabaseId = readRequiredString(record, 'firestoreDatabaseId');

  if (firestoreDatabaseId === DEFAULT_DATABASE_ID) {
    throw new Error(
      'Invalid Firebase configuration: firestoreDatabaseId must target the named database, not "(default)".'
    );
  }

  return Object.freeze({
    projectId,
    appId,
    apiKey,
    authDomain,
    firestoreDatabaseId,
    storageBucket: readOptionalString(record, 'storageBucket'),
    messagingSenderId: readOptionalString(record, 'messagingSenderId'),
    measurementId: readOptionalString(record, 'measurementId'),
    oAuthClientId: readOptionalString(record, 'oAuthClientId'),
    recaptchaSiteKey: readOptionalString(record, 'recaptchaSiteKey'),
  });
}

function getOrInitializeFirebaseApp(
  config: FirebaseClientConfig,
  appName?: string
): FirebaseApp {
  const existingApps = getApps();

  if (!appName) {
    if (existingApps.length > 0) {
      const existingDefault = existingApps.find((candidate) => candidate.name === '[DEFAULT]');
      if (existingDefault) {
        if (existingDefault.options.projectId !== config.projectId) {
          throw new Error(
            `Firebase default app already initialized for project "${existingDefault.options.projectId ?? 'unknown'}", expected "${config.projectId}".`
          );
        }
        return getApp();
      }
    }
    return initializeApp(config);
  }

  const matchingNamedApp = existingApps.find((candidate) => candidate.name === appName);
  if (matchingNamedApp) {
    if (matchingNamedApp.options.projectId !== config.projectId) {
      throw new Error(
        `Firebase app "${appName}" already initialized for project "${matchingNamedApp.options.projectId ?? 'unknown'}", expected "${config.projectId}".`
      );
    }
    return matchingNamedApp;
  }

  return initializeApp(config, appName);
}

/**
 * Initializes Firebase App, Firebase Auth, and the explicit named Firestore database
 * without triggering any network reads/writes or automatic sign-in.
 */
export function initializeFirebaseClient(
  rawConfig: unknown = rawFirebaseConfig,
  options: { appName?: string } = {}
): FirebaseClientServices {
  const config = validateFirebaseClientConfig(rawConfig);
  const app = getOrInitializeFirebaseApp(config, options.appName);
  const auth = getAuth(app);
  // Note: In Firebase JS SDK 13.4.0 (@firebase/firestore 4.20.0), the named-database
  // getFirestore(app, databaseId) overload carries a @beta JSDoc tag, while the runtime
  // explicitly binds the non-default named database without falling back to "(default)".
  const db = getFirestore(app, config.firestoreDatabaseId);

  return Object.freeze({
    config,
    app,
    auth,
    db,
  });
}

/**
 * Extracts the resolved project ID and database ID from a Firestore instance via its
 * public serialization contract.
 */
export function getFirestoreTarget(db: Firestore): FirestoreDatabaseTarget {
  const serialized = db.toJSON() as {
    databaseId?: { projectId?: unknown; database?: unknown };
  };
  const projectId =
    typeof serialized.databaseId?.projectId === 'string'
      ? serialized.databaseId.projectId
      : '';
  const databaseId =
    typeof serialized.databaseId?.database === 'string'
      ? serialized.databaseId.database
      : '';

  if (!projectId || !databaseId) {
    throw new Error('Unable to resolve Firestore projectId or databaseId from SDK instance.');
  }

  return { projectId, databaseId };
}

let cachedDefaultServices: FirebaseClientServices | null = null;

export function getFirebaseClientServices(): FirebaseClientServices {
  if (!cachedDefaultServices) {
    cachedDefaultServices = initializeFirebaseClient(rawFirebaseConfig);
  }
  return cachedDefaultServices;
}

const defaultServices = getFirebaseClientServices();

export const firebaseClientConfig: FirebaseClientConfig = defaultServices.config;
export const firebaseApp: FirebaseApp = defaultServices.app;
export const firebaseAuth: Auth = defaultServices.auth;
export const firestoreDb: Firestore = defaultServices.db;
