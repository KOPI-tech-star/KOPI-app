import type { Auth } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocsFromServer,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import {
  firebaseAuth,
  firebaseClientConfig,
  firestoreDb,
  getFirestoreTarget,
} from '../../lib/firebase';
import { buildFirestoreErrorInfo, OperationType } from '../../lib/firestoreErrors';
import {
  FIRESTORE_COLLECTION_NAMES,
  LEGAL_DOCUMENT_VERSIONS,
  type SavedOpportunityDocument,
  type SavedOpportunitySourceScreen,
  type UserProfileDocument,
} from '../firestoreContracts';
import {
  isApprovedDemoProblemId,
  isValidFirestoreDocId,
  sanitizeUserDisplayName,
  validateSavedOpportunityDocument,
  validateUserProfileDocument,
} from '../firestoreValidation';
import { getProblemRepository } from './firestoreProblemRepository';
import { RepositoryError } from './problemRepository';

export interface ConsentSubmissionInput {
  readonly uid: string;
  readonly displayName: string | null;
  readonly confirmedEighteenOrOlder: boolean;
  readonly acceptedTermsAndPrivacy: boolean;
  readonly termsVersion?: string;
  readonly privacyPolicyVersion?: string;
}

export interface UserAccountRepository {
  getTargetInfo(): { readonly projectId: string; readonly databaseId: string };
  getUserProfile(uid: string): Promise<UserProfileDocument | null>;
  upsertUserProfileOnConsent(
    input: ConsentSubmissionInput
  ): Promise<UserProfileDocument>;
  listSavedOpportunities(uid: string): Promise<readonly SavedOpportunityDocument[]>;
  saveOpportunity(
    uid: string,
    problemId: string,
    sourceScreen: SavedOpportunitySourceScreen
  ): Promise<{ readonly item: SavedOpportunityDocument; readonly alreadyExisted: boolean }>;
  removeSavedOpportunity(uid: string, problemId: string): Promise<void>;
}

export interface FirestoreUserStoreSnapshot {
  readonly exists: boolean;
  readonly id: string;
  data(): unknown;
}

export interface FirestoreUserAccountStore {
  readonly projectId: string;
  readonly databaseId: string;
  getUserDoc(uid: string): Promise<FirestoreUserStoreSnapshot>;
  createUserDoc(uid: string, data: Record<string, unknown>): Promise<void>;
  updateUserDoc(uid: string, fields: Record<string, unknown>): Promise<void>;
  listSavedDocs(uid: string): Promise<readonly FirestoreUserStoreSnapshot[]>;
  getSavedDoc(uid: string, problemId: string): Promise<FirestoreUserStoreSnapshot>;
  createSavedDoc(
    uid: string,
    problemId: string,
    data: Record<string, unknown>
  ): Promise<void>;
  deleteSavedDoc(uid: string, problemId: string): Promise<void>;
}

function mapUserFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string,
  auth?: Auth | null
): RepositoryError {
  if (error instanceof RepositoryError) {
    return error;
  }

  const info = buildFirestoreErrorInfo(error, operationType, path, auth);
  const rawCode =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code ?? '').toLowerCase()
      : '';
  const msg = info.error.toLowerCase();

  if (
    rawCode.includes('unauthenticated') ||
    msg.includes('unauthenticated')
  ) {
    return new RepositoryError({
      code: 'unauthenticated',
      userMessage: 'Please sign in with Google to access your saved opportunities.',
      retryable: true,
    });
  }

  if (
    rawCode.includes('permission-denied') ||
    rawCode.includes('permission_denied') ||
    msg.includes('missing or insufficient permissions') ||
    msg.includes('permission_denied')
  ) {
    return new RepositoryError({
      code: 'permission_denied',
      userMessage:
        'Cloud Firestore denied this user-account operation. If new candidate security rules have not yet been deployed, user profile and saved-opportunity writes remain locked until deployment approval.',
      retryable: true,
    });
  }

  if (
    rawCode.includes('unavailable') ||
    rawCode.includes('deadline-exceeded') ||
    rawCode.includes('failed-precondition') ||
    msg.includes('client is offline') ||
    msg.includes('network')
  ) {
    return new RepositoryError({
      code: 'unavailable',
      userMessage:
        'Unable to reach Cloud Firestore right now. Check your network connection and retry.',
      retryable: true,
    });
  }

  return new RepositoryError({
    code: 'unknown',
    userMessage: 'An unexpected error occurred while syncing your account with Cloud Firestore.',
    retryable: true,
  });
}

export function createFirestoreUserAccountStore(
  db: Firestore = firestoreDb,
  expectedDatabaseId: string = firebaseClientConfig.firestoreDatabaseId
): FirestoreUserAccountStore {
  const target = getFirestoreTarget(db);
  if (target.databaseId === '(default)') {
    throw new Error('Refusing to bind user account store to "(default)" database.');
  }
  if (target.databaseId !== expectedDatabaseId) {
    throw new Error(
      `User account store database mismatch: got "${target.databaseId}", expected "${expectedDatabaseId}".`
    );
  }

  return {
    projectId: target.projectId,
    databaseId: target.databaseId,

    async getUserDoc(uid: string) {
      const ref = doc(db, FIRESTORE_COLLECTION_NAMES.users, uid);
      const snap = await getDocFromServer(ref);
      return {
        exists: snap.exists(),
        id: snap.id,
        data: () => snap.data(),
      };
    },

    async createUserDoc(uid: string, data: Record<string, unknown>) {
      const ref = doc(db, FIRESTORE_COLLECTION_NAMES.users, uid);
      await setDoc(ref, data);
    },

    async updateUserDoc(uid: string, fields: Record<string, unknown>) {
      const ref = doc(db, FIRESTORE_COLLECTION_NAMES.users, uid);
      await updateDoc(ref, fields);
    },

    async listSavedDocs(uid: string) {
      const colRef = collection(
        db,
        FIRESTORE_COLLECTION_NAMES.users,
        uid,
        'savedOpportunities'
      );
      const snap = await getDocsFromServer(colRef);
      return snap.docs.map((d) => ({
        exists: true,
        id: d.id,
        data: () => d.data(),
      }));
    },

    async getSavedDoc(uid: string, problemId: string) {
      const ref = doc(
        db,
        FIRESTORE_COLLECTION_NAMES.users,
        uid,
        'savedOpportunities',
        problemId
      );
      const snap = await getDocFromServer(ref);
      return {
        exists: snap.exists(),
        id: snap.id,
        data: () => snap.data(),
      };
    },

    async createSavedDoc(
      uid: string,
      problemId: string,
      data: Record<string, unknown>
    ) {
      const ref = doc(
        db,
        FIRESTORE_COLLECTION_NAMES.users,
        uid,
        'savedOpportunities',
        problemId
      );
      await setDoc(ref, data);
    },

    async deleteSavedDoc(uid: string, problemId: string) {
      const ref = doc(
        db,
        FIRESTORE_COLLECTION_NAMES.users,
        uid,
        'savedOpportunities',
        problemId
      );
      await deleteDoc(ref);
    },
  };
}

export class FirestoreUserAccountRepository implements UserAccountRepository {
  private readonly store: FirestoreUserAccountStore;
  private readonly auth: Auth | null;
  private readonly timestampToken: () => unknown;
  private readonly verifyPublishedProblemExists: (problemId: string) => Promise<boolean>;

  constructor(
    store: FirestoreUserAccountStore,
    options: {
      auth?: Auth | null;
      timestampToken?: () => unknown;
      verifyPublishedProblemExists?: (problemId: string) => Promise<boolean>;
    } = {}
  ) {
    if (!store.databaseId || store.databaseId === '(default)') {
      throw new Error(
        'FirestoreUserAccountRepository must target a named Firestore database, not "(default)".'
      );
    }
    this.store = store;
    this.auth = options.auth === undefined ? firebaseAuth : options.auth;
    this.timestampToken = options.timestampToken ?? (() => serverTimestamp());
    this.verifyPublishedProblemExists =
      options.verifyPublishedProblemExists ?? (async () => false);
  }

  public getTargetInfo(): { readonly projectId: string; readonly databaseId: string } {
    return {
      projectId: this.store.projectId,
      databaseId: this.store.databaseId,
    };
  }

  private assertValidUid(uid: string): string {
    const trimmed = uid.trim();
    if (!isValidFirestoreDocId(trimmed)) {
      throw new RepositoryError({
        code: 'invalid_id',
        userMessage: 'Invalid user account identifier.',
        retryable: false,
      });
    }
    const activeUid = this.auth?.currentUser?.uid;
    if (activeUid && activeUid !== trimmed) {
      throw new RepositoryError({
        code: 'permission_denied',
        userMessage: 'Cross-account access is not permitted.',
        retryable: false,
      });
    }
    return trimmed;
  }

  private assertValidProblemDocId(problemId: string): string {
    const trimmed = problemId.trim();
    if (!isValidFirestoreDocId(trimmed)) {
      throw new RepositoryError({
        code: 'invalid_id',
        userMessage: 'Invalid problem identifier.',
        retryable: false,
      });
    }
    return trimmed;
  }

  private async assertSaveableProblemId(problemId: string): Promise<string> {
    const trimmed = this.assertValidProblemDocId(problemId);
    if (isApprovedDemoProblemId(trimmed)) {
      return trimmed;
    }
    const publishedExists = await this.verifyPublishedProblemExists(trimmed);
    if (!publishedExists) {
      throw new RepositoryError({
        code: 'invalid_id',
        userMessage: 'Only approved demonstration or published verified problems can be bookmarked.',
        retryable: false,
      });
    }
    return trimmed;
  }

  public async getUserProfile(uid: string): Promise<UserProfileDocument | null> {
    const validUid = this.assertValidUid(uid);
    const path = `${FIRESTORE_COLLECTION_NAMES.users}/${validUid}`;

    let snap: FirestoreUserStoreSnapshot;
    try {
      snap = await this.store.getUserDoc(validUid);
    } catch (err) {
      throw mapUserFirestoreError(err, OperationType.GET, path, this.auth);
    }

    if (!snap.exists) {
      return null;
    }

    const validation = validateUserProfileDocument(validUid, snap.data());
    if (!validation.ok || !validation.value) {
      throw new RepositoryError({
        code: 'invalid_record',
        userMessage: 'Your stored profile record failed validation.',
        retryable: false,
        causeMessage: validation.errors.join(' '),
      });
    }

    return validation.value;
  }

  public async upsertUserProfileOnConsent(
    input: ConsentSubmissionInput
  ): Promise<UserProfileDocument> {
    const validUid = this.assertValidUid(input.uid);
    if (!input.confirmedEighteenOrOlder) {
      throw new RepositoryError({
        code: 'invalid_record',
        userMessage: 'You must confirm that you are 18 or older before creating a Kopi account.',
        retryable: false,
      });
    }
    if (!input.acceptedTermsAndPrivacy) {
      throw new RepositoryError({
        code: 'invalid_record',
        userMessage: 'You must accept the pre-launch Draft Terms of Service and Draft Privacy Policy.',
        retryable: false,
      });
    }

    const termsVersion = input.termsVersion?.trim() || LEGAL_DOCUMENT_VERSIONS.termsVersion;
    const privacyPolicyVersion =
      input.privacyPolicyVersion?.trim() || LEGAL_DOCUMENT_VERSIONS.privacyPolicyVersion;
    const sanitizedName = sanitizeUserDisplayName(input.displayName);
    const path = `${FIRESTORE_COLLECTION_NAMES.users}/${validUid}`;

    const existing = await this.getUserProfile(validUid);

    if (!existing) {
      const payload = {
        uid: validUid,
        displayName: sanitizedName,
        eligibility: {
          isEighteenOrOlderDeclared: true,
          ageVerificationStatus: 'self_declared_unverified',
          declaredAt: this.timestampToken(),
        },
        consents: {
          termsAccepted: true,
          termsVersion,
          termsAcceptedAt: this.timestampToken(),
          privacyPolicyAccepted: true,
          privacyPolicyVersion,
          privacyAcceptedAt: this.timestampToken(),
        },
        createdAt: this.timestampToken(),
        updatedAt: this.timestampToken(),
        schemaVersion: 1,
      };

      try {
        await this.store.createUserDoc(validUid, payload);
      } catch (err) {
        throw mapUserFirestoreError(err, OperationType.CREATE, path, this.auth);
      }
    } else {
      const consentsChanged =
        existing.consents.termsVersion !== termsVersion ||
        existing.consents.privacyPolicyVersion !== privacyPolicyVersion;

      const updateFields: Record<string, unknown> = {
        displayName: sanitizedName,
        updatedAt: this.timestampToken(),
      };

      if (consentsChanged) {
        updateFields.consents = {
          termsAccepted: true,
          termsVersion,
          termsAcceptedAt: this.timestampToken(),
          privacyPolicyAccepted: true,
          privacyPolicyVersion,
          privacyAcceptedAt: this.timestampToken(),
        };
      }

      try {
        await this.store.updateUserDoc(validUid, updateFields);
      } catch (err) {
        throw mapUserFirestoreError(err, OperationType.UPDATE, path, this.auth);
      }
    }

    const saved = await this.getUserProfile(validUid);
    if (!saved) {
      throw new RepositoryError({
        code: 'invalid_record',
        userMessage: 'Account creation completed, but your profile could not be verified from Firestore.',
        retryable: true,
      });
    }
    return saved;
  }

  public async listSavedOpportunities(
    uid: string
  ): Promise<readonly SavedOpportunityDocument[]> {
    const validUid = this.assertValidUid(uid);
    const path = `${FIRESTORE_COLLECTION_NAMES.users}/${validUid}/savedOpportunities`;

    let docs: readonly FirestoreUserStoreSnapshot[];
    try {
      docs = await this.store.listSavedDocs(validUid);
    } catch (err) {
      throw mapUserFirestoreError(err, OperationType.LIST, path, this.auth);
    }

    const items: SavedOpportunityDocument[] = [];
    for (const snap of docs) {
      const validation = validateSavedOpportunityDocument(snap.id, snap.data(), {
        allowPublishedIds: true,
      });
      if (validation.ok && validation.value) {
        items.push(validation.value);
      }
    }

    items.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
    return items;
  }

  public async saveOpportunity(
    uid: string,
    problemId: string,
    sourceScreen: SavedOpportunitySourceScreen
  ): Promise<{ readonly item: SavedOpportunityDocument; readonly alreadyExisted: boolean }> {
    const validUid = this.assertValidUid(uid);
    const validProblemId = await this.assertSaveableProblemId(problemId);
    const path = `${FIRESTORE_COLLECTION_NAMES.users}/${validUid}/savedOpportunities/${validProblemId}`;

    let existingSnap: FirestoreUserStoreSnapshot;
    try {
      existingSnap = await this.store.getSavedDoc(validUid, validProblemId);
    } catch (err) {
      throw mapUserFirestoreError(err, OperationType.GET, path, this.auth);
    }

    if (existingSnap.exists) {
      const validatedExisting = validateSavedOpportunityDocument(
        validProblemId,
        existingSnap.data(),
        { allowPublishedIds: true }
      );
      if (validatedExisting.ok && validatedExisting.value) {
        return { item: validatedExisting.value, alreadyExisted: true };
      }
    }

    const payload = {
      problemId: validProblemId,
      savedAt: this.timestampToken(),
      sourceScreen,
      schemaVersion: 1,
    };

    try {
      await this.store.createSavedDoc(validUid, validProblemId, payload);
    } catch (err) {
      throw mapUserFirestoreError(err, OperationType.CREATE, path, this.auth);
    }

    let createdSnap: FirestoreUserStoreSnapshot;
    try {
      createdSnap = await this.store.getSavedDoc(validUid, validProblemId);
    } catch (err) {
      throw mapUserFirestoreError(err, OperationType.GET, path, this.auth);
    }

    const validation = validateSavedOpportunityDocument(
      validProblemId,
      createdSnap.data(),
      { allowPublishedIds: true }
    );
    if (!validation.ok || !validation.value) {
      throw new RepositoryError({
        code: 'invalid_record',
        userMessage: 'Saved opportunity record could not be verified after writing.',
        retryable: true,
        causeMessage: validation.errors.join(' '),
      });
    }

    return { item: validation.value, alreadyExisted: false };
  }

  public async removeSavedOpportunity(uid: string, problemId: string): Promise<void> {
    const validUid = this.assertValidUid(uid);
    const validProblemId = this.assertValidProblemDocId(problemId);
    const path = `${FIRESTORE_COLLECTION_NAMES.users}/${validUid}/savedOpportunities/${validProblemId}`;

    try {
      await this.store.deleteSavedDoc(validUid, validProblemId);
    } catch (err) {
      throw mapUserFirestoreError(err, OperationType.DELETE, path, this.auth);
    }
  }
}

let defaultUserRepo: FirestoreUserAccountRepository | null = null;

export function getUserAccountRepository(): FirestoreUserAccountRepository {
  if (!defaultUserRepo) {
    defaultUserRepo = new FirestoreUserAccountRepository(
      createFirestoreUserAccountStore(),
      {
        auth: firebaseAuth,
        verifyPublishedProblemExists: async (problemId) =>
          Boolean(await getProblemRepository().getProblemById(problemId)),
      }
    );
  }
  return defaultUserRepo;
}
