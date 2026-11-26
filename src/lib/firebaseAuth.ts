import {
  GoogleAuthProvider,
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  type Auth,
  type Unsubscribe,
  type User,
} from 'firebase/auth';
import { firebaseAuth } from './firebase';

export type AuthErrorCode =
  | 'popup_closed'
  | 'popup_blocked'
  | 'cancelled_popup_request'
  | 'network_error'
  | 'unauthorized_domain'
  | 'operation_not_allowed'
  | 'email_unverified'
  | 'unknown';

export interface MappedAuthError {
  readonly code: AuthErrorCode;
  readonly userMessage: string;
  readonly retryable: boolean;
}

export interface AuthUserSummary {
  readonly uid: string;
  readonly displayName: string | null;
  readonly emailVerified: boolean;
}

export interface AuthClientService {
  getCurrentUser(): AuthUserSummary | null;
  subscribeAuthState(listener: (user: AuthUserSummary | null) => void): () => void;
  signInWithGoogle(): Promise<AuthUserSummary>;
  signOut(): Promise<void>;
}

export function toAuthUserSummary(user: User | null): AuthUserSummary | null {
  if (!user) return null;
  return {
    uid: user.uid,
    displayName: user.displayName ?? null,
    emailVerified: user.emailVerified,
  };
}

export function mapFirebaseAuthError(error: unknown): MappedAuthError {
  const rawCode =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code ?? '').toLowerCase()
      : '';
  const rawMessage =
    error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();

  if (
    rawCode.includes('popup-closed-by-user') ||
    rawMessage.includes('popup-closed-by-user')
  ) {
    return {
      code: 'popup_closed',
      userMessage: 'Google sign-in was closed before completion. Click Continue with Google when ready to try again.',
      retryable: true,
    };
  }

  if (
    rawCode.includes('cancelled-popup-request') ||
    rawMessage.includes('cancelled-popup-request')
  ) {
    return {
      code: 'cancelled_popup_request',
      userMessage: 'A previous sign-in window was interrupted. Please try signing in again.',
      retryable: true,
    };
  }

  if (
    rawCode.includes('popup-blocked') ||
    rawMessage.includes('popup-blocked')
  ) {
    return {
      code: 'popup_blocked',
      userMessage:
        'Your browser blocked the Google sign-in popup. Allow popups for this site and click Continue with Google again.',
      retryable: true,
    };
  }

  if (
    rawCode.includes('unauthorized-domain') ||
    rawMessage.includes('unauthorized-domain')
  ) {
    return {
      code: 'unauthorized_domain',
      userMessage:
        'This domain is not yet authorized in Firebase Authentication. An administrator must add this preview domain under Firebase Console -> Authentication -> Settings -> Authorized domains.',
      retryable: false,
    };
  }

  if (
    rawCode.includes('operation-not-allowed') ||
    rawMessage.includes('operation-not-allowed')
  ) {
    return {
      code: 'operation_not_allowed',
      userMessage:
        'Google sign-in provider is not yet enabled in Firebase Authentication Console.',
      retryable: false,
    };
  }

  if (
    rawCode.includes('network-request-failed') ||
    rawMessage.includes('network-request-failed') ||
    rawMessage.includes('network error')
  ) {
    return {
      code: 'network_error',
      userMessage:
        'Network connection failed during Google sign-in. Check your connection and retry.',
      retryable: true,
    };
  }

  if (rawCode.includes('email_unverified')) {
    return {
      code: 'email_unverified',
      userMessage:
        'Your Google account email must be verified before creating or accessing a Kopi account.',
      retryable: false,
    };
  }

  return {
    code: 'unknown',
    userMessage: 'Unable to complete Google sign-in right now. Please try again.',
    retryable: true,
  };
}

let persistencePromise: Promise<void> | null = null;

export async function ensurePersistentAuthSession(
  auth: Auth = firebaseAuth
): Promise<void> {
  if (!persistencePromise) {
    persistencePromise = setPersistence(auth, browserLocalPersistence).catch(() => {
      // If persistence fails in restricted storage modes, Firebase keeps in-memory session;
      // clear memoized promise so future calls may retry.
      persistencePromise = null;
    });
  }
  await persistencePromise;
}

export function createFirebaseAuthClientService(
  auth: Auth = firebaseAuth
): AuthClientService {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  return {
    getCurrentUser(): AuthUserSummary | null {
      return toAuthUserSummary(auth.currentUser);
    },

    subscribeAuthState(
      listener: (user: AuthUserSummary | null) => void
    ): Unsubscribe {
      return onAuthStateChanged(auth, (firebaseUser) => {
        listener(toAuthUserSummary(firebaseUser));
      });
    },

    async signInWithGoogle(): Promise<AuthUserSummary> {
      await ensurePersistentAuthSession(auth);
      const credential = await signInWithPopup(auth, provider);
      const summary = toAuthUserSummary(credential.user);
      if (!summary) {
        throw { code: 'unknown', message: 'Missing authenticated user profile.' };
      }
      if (!summary.emailVerified) {
        await signOut(auth);
        throw { code: 'email_unverified', message: 'Google account email is not verified.' };
      }
      return summary;
    },

    async signOut(): Promise<void> {
      await signOut(auth);
    },
  };
}

let defaultAuthService: AuthClientService | null = null;

export function getAuthClientService(): AuthClientService {
  if (!defaultAuthService) {
    defaultAuthService = createFirebaseAuthClientService();
  }
  return defaultAuthService;
}
