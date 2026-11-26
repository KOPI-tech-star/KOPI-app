import type { Auth } from 'firebase/auth';

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
} as const;

export type OperationType = (typeof OperationType)[keyof typeof OperationType];

export interface FirestoreErrorInfo {
  readonly error: string;
  readonly operationType: OperationType;
  readonly path: string | null;
  readonly authInfo: {
    readonly userId?: string;
    readonly emailVerified?: boolean;
    readonly isAnonymous?: boolean;
    readonly providerInfo: readonly {
      readonly providerId: string;
      readonly displayName: string | null;
    }[];
  };
}

export function buildFirestoreErrorInfo(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  auth?: Auth | null
): FirestoreErrorInfo {
  const currentUser = auth?.currentUser ?? null;
  const message =
    error instanceof Error ? error.message : String(error ?? 'Unknown Firestore error');

  return {
    error: message,
    operationType,
    path,
    authInfo: {
      userId: currentUser?.uid,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      providerInfo:
        currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
        })) ?? [],
    },
  };
}

/**
 * Logs structured non-PII diagnostic context and re-throws the contextual error
 * for upstream error boundaries or repository callers.
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  auth?: Auth | null
): never {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path, auth);
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
