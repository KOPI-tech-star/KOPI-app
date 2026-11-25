import { doc, getDoc, type Firestore } from 'firebase/firestore';
import type {
  OpportunityCardItem,
  OpportunityIllustrationKey,
} from '../../config/opportunityRadar';
import type { Problem } from '../../config/problemExplorer';
import {
  firebaseClientConfig,
  firestoreDb,
  getFirestoreTarget,
} from '../../lib/firebase';
import {
  APPROVED_DEMO_PROBLEM_IDS,
  FIRESTORE_COLLECTION_NAMES,
  type ApprovedDemoProblemId,
} from '../firestoreContracts';
import {
  adaptValidatedDemoProblem,
  isApprovedDemoProblemId,
  isValidFirestoreDocId,
  validateDemoProblemDocument,
} from '../firestoreValidation';
import {
  RepositoryError,
  type DemoProblemBundle,
  type ProblemRepository,
  type RepositoryReadOptions,
  type SingleDemoProblemResult,
} from './problemRepository';

export interface FirestoreDocSnapshotLike {
  readonly exists: boolean;
  readonly id: string;
  data(): unknown;
}

export interface FirestoreDocReader {
  readonly projectId: string;
  readonly databaseId: string;
  readDocument(
    collectionName: string,
    documentId: string
  ): Promise<FirestoreDocSnapshotLike>;
}

const SAFE_ERROR_MESSAGES = {
  permission_denied:
    'Access to Firestore demonstration records is currently blocked by Security Rules. No unverified local fallback has been substituted.',
  unavailable:
    'Unable to reach the Cloud Firestore database right now. Check your network connection and retry.',
  invalid_record:
    'A retrieved Firestore document failed runtime data-integrity validation and was withheld.',
  invalid_id: 'The requested problem identifier is invalid.',
  not_found: 'The requested demonstration document does not exist in Firestore.',
  unknown:
    'An unexpected error occurred while reading from Cloud Firestore. Please retry.',
} as const;

export function mapUnknownFirestoreError(error: unknown): RepositoryError {
  if (error instanceof RepositoryError) {
    return error;
  }

  const rawCode =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code ?? '').toLowerCase()
      : '';
  const rawMessage =
    error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();

  if (
    rawCode.includes('permission-denied') ||
    rawCode.includes('permission_denied') ||
    rawMessage.includes('missing or insufficient permissions') ||
    rawMessage.includes('permission_denied')
  ) {
    return new RepositoryError({
      code: 'permission_denied',
      userMessage: SAFE_ERROR_MESSAGES.permission_denied,
      retryable: true,
    });
  }

  if (
    rawCode.includes('unavailable') ||
    rawCode.includes('failed-precondition') ||
    rawCode.includes('deadline-exceeded') ||
    rawCode.includes('aborted') ||
    rawMessage.includes('client is offline') ||
    rawMessage.includes('failed to get document because the client is offline') ||
    rawMessage.includes('network')
  ) {
    return new RepositoryError({
      code: 'unavailable',
      userMessage: SAFE_ERROR_MESSAGES.unavailable,
      retryable: true,
    });
  }

  return new RepositoryError({
    code: 'unknown',
    userMessage: SAFE_ERROR_MESSAGES.unknown,
    retryable: true,
  });
}

export function createFirestoreSdkDocReader(
  db: Firestore = firestoreDb,
  expectedDatabaseId: string = firebaseClientConfig.firestoreDatabaseId
): FirestoreDocReader {
  const target = getFirestoreTarget(db);
  if (target.databaseId === '(default)') {
    throw new Error(
      'Refusing to create FirestoreDocReader against "(default)" database.'
    );
  }
  if (target.databaseId !== expectedDatabaseId) {
    throw new Error(
      `FirestoreDocReader target mismatch: got "${target.databaseId}", expected "${expectedDatabaseId}".`
    );
  }

  return {
    projectId: target.projectId,
    databaseId: target.databaseId,
    async readDocument(collectionName: string, documentId: string) {
      const ref = doc(db, collectionName, documentId);
      const snap = await getDoc(ref);
      return {
        exists: snap.exists(),
        id: snap.id,
        data: () => snap.data(),
      };
    },
  };
}

export class FirestoreProblemRepository implements ProblemRepository {
  private readonly reader: FirestoreDocReader;
  private bundleCache: DemoProblemBundle | null = null;
  private bundleInFlight: Promise<DemoProblemBundle> | null = null;
  private readonly singleCache = new Map<ApprovedDemoProblemId, SingleDemoProblemResult | null>();
  private readonly singleInFlight = new Map<
    ApprovedDemoProblemId,
    Promise<SingleDemoProblemResult | null>
  >();

  constructor(reader: FirestoreDocReader) {
    if (!reader.databaseId || reader.databaseId === '(default)') {
      throw new Error(
        'FirestoreProblemRepository must target a named Firestore database, not "(default)".'
      );
    }
    this.reader = reader;
  }

  public getTargetInfo(): { readonly projectId: string; readonly databaseId: string } {
    return {
      projectId: this.reader.projectId,
      databaseId: this.reader.databaseId,
    };
  }

  public clearCache(): void {
    this.bundleCache = null;
    this.bundleInFlight = null;
    this.singleCache.clear();
    this.singleInFlight.clear();
  }

  private async fetchSingleValidatedDoc(
    problemId: ApprovedDemoProblemId
  ): Promise<SingleDemoProblemResult | null> {
    let snapshot: FirestoreDocSnapshotLike;
    try {
      snapshot = await this.reader.readDocument(
        FIRESTORE_COLLECTION_NAMES.demoProblems,
        problemId
      );
    } catch (err) {
      throw mapUnknownFirestoreError(err);
    }

    if (!snapshot.exists) {
      return null;
    }

    const validation = validateDemoProblemDocument(problemId, snapshot.data());
    if (!validation.ok || !validation.value) {
      throw new RepositoryError({
        code: 'invalid_record',
        userMessage: SAFE_ERROR_MESSAGES.invalid_record,
        retryable: false,
      });
    }

    const adapted = adaptValidatedDemoProblem(validation.value);
    const result: SingleDemoProblemResult = {
      problem: adapted.problem,
      opportunity: adapted.opportunity,
      illustration: adapted.illustration,
      retrievedAt: new Date().toISOString(),
      source: 'firestore',
    };

    return result;
  }

  public async getApprovedDemoProblems(
    options: RepositoryReadOptions = {}
  ): Promise<DemoProblemBundle> {
    if (options.forceRefresh) {
      this.clearCache();
    }

    if (this.bundleCache) {
      return this.bundleCache;
    }

    if (this.bundleInFlight) {
      return this.bundleInFlight;
    }

    const loadPromise = (async (): Promise<DemoProblemBundle> => {
      const results = await Promise.all(
        APPROVED_DEMO_PROBLEM_IDS.map(async (id) => ({
          id,
          record: await this.fetchSingleValidatedDoc(id),
        }))
      );

      const problems: Problem[] = [];
      const opportunities: OpportunityCardItem[] = [];
      const illustrationByProblemId: Record<string, OpportunityIllustrationKey> = {};
      const missingIds: string[] = [];

      for (const entry of results) {
        this.singleCache.set(entry.id, entry.record);
        if (!entry.record) {
          missingIds.push(entry.id);
          continue;
        }
        problems.push(entry.record.problem);
        opportunities.push(entry.record.opportunity);
        illustrationByProblemId[entry.id] = entry.record.illustration;
      }

      const bundle: DemoProblemBundle = {
        problems,
        opportunities,
        illustrationByProblemId,
        missingIds,
        retrievedAt: new Date().toISOString(),
        source: 'firestore',
      };

      this.bundleCache = bundle;
      return bundle;
    })();

    this.bundleInFlight = loadPromise;
    try {
      return await loadPromise;
    } finally {
      if (this.bundleInFlight === loadPromise) {
        this.bundleInFlight = null;
      }
    }
  }

  public async getProblemById(
    problemId: string,
    options: RepositoryReadOptions = {}
  ): Promise<SingleDemoProblemResult | null> {
    const trimmed = problemId.trim();
    if (!trimmed || !isValidFirestoreDocId(trimmed) || !isApprovedDemoProblemId(trimmed)) {
      return null;
    }

    if (options.forceRefresh) {
      this.singleCache.delete(trimmed);
      this.bundleCache = null;
    }

    if (this.singleCache.has(trimmed)) {
      return this.singleCache.get(trimmed) ?? null;
    }

    if (this.bundleInFlight) {
      const bundle = await this.bundleInFlight;
      const found = bundle.problems.find((p) => p.id === trimmed);
      const foundOpp = bundle.opportunities.find((o) => o.id === trimmed);
      const foundIllus = bundle.illustrationByProblemId[trimmed];
      if (found && foundOpp && foundIllus) {
        return {
          problem: found,
          opportunity: foundOpp,
          illustration: foundIllus,
          retrievedAt: bundle.retrievedAt,
          source: 'firestore',
        };
      }
      if (bundle.missingIds.includes(trimmed)) {
        return null;
      }
    }

    const existingSingleFlight = this.singleInFlight.get(trimmed);
    if (existingSingleFlight) {
      return existingSingleFlight;
    }

    const singlePromise = (async (): Promise<SingleDemoProblemResult | null> => {
      const fetched = await this.fetchSingleValidatedDoc(trimmed);
      this.singleCache.set(trimmed, fetched);
      return fetched;
    })();

    this.singleInFlight.set(trimmed, singlePromise);
    try {
      return await singlePromise;
    } finally {
      if (this.singleInFlight.get(trimmed) === singlePromise) {
        this.singleInFlight.delete(trimmed);
      }
    }
  }
}

export function createFirestoreProblemRepository(
  reader: FirestoreDocReader = createFirestoreSdkDocReader()
): FirestoreProblemRepository {
  return new FirestoreProblemRepository(reader);
}

let defaultRepositoryInstance: FirestoreProblemRepository | null = null;

export function getProblemRepository(): FirestoreProblemRepository {
  if (!defaultRepositoryInstance) {
    defaultRepositoryInstance = createFirestoreProblemRepository();
  }
  return defaultRepositoryInstance;
}
