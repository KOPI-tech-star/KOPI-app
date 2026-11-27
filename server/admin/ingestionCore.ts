import crypto from 'node:crypto';
import type { Problem } from '../../src/config/problemExplorer';
import {
  DEMO_PROBLEMS_SEED_MANIFEST,
} from '../../src/data/demoSeedManifest';
import {
  APPROVED_DEMO_PROBLEM_IDS,
  FIRESTORE_COLLECTION_NAMES,
  type EvidenceLinkDocument,
  type FirestoreCollectionName,
} from '../../src/data/firestoreContracts';
import {
  containsUnsafeHtmlOrScript,
  deduplicateEvidenceLinks,
  isPlainObject,
  isValidFirestoreDocId,
  parseValidIsoTimestamp,
  validateDataSourceRecord,
  validateDemoProblemDocument,
  validateFirestoreEvaluationRecord,
  validateProblemClusterRecord,
  validatePublishedProblemDocument,
  validateResearchInsightRecord,
  validateSourceObservationRecord,
  type ValidationOutcome,
} from '../../src/data/firestoreValidation';
import { invalidateStaleClusterApproval } from './clusteringAndEvidence';
import type { AdminFirestoreStore } from './firebaseAdminClient';

export type ConflictPolicy = 'abort' | 'skip' | 'overwrite';

export interface IngestionRecordInput {
  readonly collection: FirestoreCollectionName;
  readonly documentId: string;
  readonly data: Record<string, unknown>;
}

export interface BatchValidationContext {
  readonly problemById?: ReadonlyMap<string, Problem>;
  readonly knownSourceIds?: ReadonlySet<string>;
  readonly verifiedObservationIds?: ReadonlySet<string>;
}

export type PlannedRecordAction =
  | 'create'
  | 'unchanged'
  | 'conflict'
  | 'approved_overwrite';

export interface PlannedRecordDecision {
  readonly collection: FirestoreCollectionName;
  readonly documentId: string;
  readonly documentPath: string;
  readonly action: PlannedRecordAction;
  readonly changedFields: readonly string[];
  readonly digest: string;
  readonly existingDigest: string | null;
  readonly existingUpdateTimeMs: number | null;
  readonly normalizedData: Record<string, unknown>;
}

export interface IngestionValidationIssue {
  readonly collection: string;
  readonly documentId: string;
  readonly errors: readonly string[];
}

export interface PostWriteVerificationEntry {
  readonly documentPath: string;
  readonly ok: boolean;
  readonly error: string | null;
}

export interface IngestionExecutionReport {
  readonly mode: 'dry-run' | 'apply';
  readonly projectId: string;
  readonly databaseId: string;
  readonly conflictPolicy: ConflictPolicy;
  readonly approved: boolean;
  readonly validationPassed: boolean;
  readonly validationIssues: readonly IngestionValidationIssue[];
  readonly totalRecords: number;
  readonly planned: readonly PlannedRecordDecision[];
  readonly summary: {
    readonly create: number;
    readonly unchanged: number;
    readonly conflict: number;
    readonly approvedOverwrite: number;
    readonly appliedCreates: number;
    readonly appliedUpdates: number;
    readonly skippedConflicts: number;
    readonly verifiedWrites: number;
  };
  readonly blockedReason: string | null;
  readonly postWriteVerification: readonly PostWriteVerificationEntry[];
}

export interface DemoVerificationItem {
  readonly documentId: string;
  readonly documentPath: string;
  readonly exists: boolean;
  readonly validationOk: boolean;
  readonly matchesManifest: boolean;
  readonly changedFields: readonly string[];
  readonly errors: readonly string[];
}

export interface DemoConnectivityReport {
  readonly projectId: string;
  readonly databaseId: string;
  readonly connected: boolean;
  readonly allValidAndMatching: boolean;
  readonly items: readonly DemoVerificationItem[];
}

const SUPPORTED_COLLECTIONS = new Set<string>(
  Object.values(FIRESTORE_COLLECTION_NAMES)
);

export function isSupportedIngestionCollection(
  value: string
): value is FirestoreCollectionName {
  return SUPPORTED_COLLECTIONS.has(value);
}

/**
 * Recursively normalizes values (including Firestore Timestamp-like objects)
 * so canonical comparison and SHA-256 digests are deterministic.
 */
export function canonicalizeValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeValue(item));
  }

  if (typeof value === 'object') {
    const maybeTimestamp = parseValidIsoTimestamp(value);
    if (
      maybeTimestamp &&
      'seconds' in value &&
      typeof (value as { seconds?: unknown }).seconds === 'number' &&
      ('nanoseconds' in value || typeof (value as { toDate?: unknown }).toDate === 'function')
    ) {
      return maybeTimestamp;
    }

    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (entry !== undefined) {
        sorted[key] = canonicalizeValue(entry);
      }
    }
    return sorted;
  }

  return String(value);
}

export function computeRecordDigest(data: Record<string, unknown>): string {
  const normalized = canonicalizeValue(data);
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex');
}

export function diffTopLevelFields(
  existingData: Record<string, unknown>,
  incomingData: Record<string, unknown>
): readonly string[] {
  const existingNorm = canonicalizeValue(existingData) as Record<string, unknown>;
  const incomingNorm = canonicalizeValue(incomingData) as Record<string, unknown>;
  const keys = Array.from(
    new Set([...Object.keys(existingNorm), ...Object.keys(incomingNorm)])
  ).sort();

  const changed: string[] = [];
  for (const key of keys) {
    if (
      JSON.stringify(existingNorm[key]) !== JSON.stringify(incomingNorm[key])
    ) {
      changed.push(key);
    }
  }
  return changed;
}

function validateEvidenceLinkRecord(
  expectedDocId: string,
  raw: unknown
): ValidationOutcome<EvidenceLinkDocument> {
  const errors: string[] = [];
  if (!isPlainObject(raw)) {
    return { ok: false, value: null, errors: ['evidenceLinks document must be an object.'] };
  }

  const linkId = typeof raw.linkId === 'string' ? raw.linkId.trim() : '';
  const problemId = typeof raw.problemId === 'string' ? raw.problemId.trim() : '';
  const observationId =
    typeof raw.observationId === 'string' ? raw.observationId.trim() : '';
  const contentFingerprint =
    typeof raw.contentFingerprint === 'string' ? raw.contentFingerprint.trim() : '';

  if (!isValidFirestoreDocId(linkId) || linkId !== expectedDocId) {
    errors.push(`Field "linkId" must match document ID "${expectedDocId}".`);
  }
  if (!isValidFirestoreDocId(problemId)) {
    errors.push('Field "problemId" must be a valid Firestore document ID.');
  }
  if (!isValidFirestoreDocId(observationId)) {
    errors.push('Field "observationId" must be a valid Firestore document ID.');
  }
  if (!contentFingerprint || contentFingerprint.length > 128 || containsUnsafeHtmlOrScript(contentFingerprint)) {
    errors.push('Field "contentFingerprint" must be a safe non-empty string (<= 128 chars).');
  }

  const role = raw.evidenceRole;
  if (role !== 'supporting' && role !== 'contradictory' && role !== 'contextual') {
    errors.push('Invalid "evidenceRole" on evidenceLink.');
  }

  const verificationStatus = raw.verificationStatus;
  if (
    verificationStatus !== 'verified' &&
    verificationStatus !== 'illustrative_demo' &&
    verificationStatus !== 'unverified'
  ) {
    errors.push('Invalid "verificationStatus" on evidenceLink.');
  }

  const createdAt = parseValidIsoTimestamp(raw.createdAt);
  if (!createdAt) {
    errors.push('Field "createdAt" must be a valid timestamp.');
  }

  if (
    typeof raw.schemaVersion !== 'number' ||
    !Number.isInteger(raw.schemaVersion) ||
    raw.schemaVersion < 1
  ) {
    errors.push('Field "schemaVersion" must be a positive integer.');
  }

  if (errors.length > 0) {
    return { ok: false, value: null, errors };
  }

  return {
    ok: true,
    value: {
      linkId,
      problemId,
      observationId,
      evidenceRole: role as EvidenceLinkDocument['evidenceRole'],
      contentFingerprint,
      verificationStatus: verificationStatus as EvidenceLinkDocument['verificationStatus'],
      createdAt: createdAt!,
      schemaVersion: raw.schemaVersion as number,
    },
    errors: [],
  };
}

function createZeroEvidenceEvaluationFallbackProblem(problemId: string): Problem {
  return {
    id: problemId,
    slug: problemId,
    title: problemId,
    summary: 'Evaluation validation context',
    categories: ['Daily Life'],
    affectedAudience: ['Unspecified'],
    recurrenceNote: 'Recurrence unknown',
    isIllustrativeDemo: true,
    evidenceCoverage: {
      sourceCount: null,
      verifiedCount: 0,
      illustrativeCount: 0,
      lastUpdated: null,
      coverageNote: 'No verified evidence linked.',
    },
    evidence: [],
    insights: [],
    existingAlternatives: [],
    unknownsAndRisks: ['Evidence unavailable'],
  };
}

/**
 * Validates any candidate ingestion record strictly using Kopi's canonical
 * contracts and validators without duplicating schema rules.
 */
export function validateCollectionRecord(
  collection: string,
  documentId: string,
  rawData: unknown,
  context: BatchValidationContext = {}
): ValidationOutcome<Record<string, unknown>> {
  if (!isSupportedIngestionCollection(collection)) {
    return {
      ok: false,
      value: null,
      errors: [`Unsupported Firestore collection "${collection}".`],
    };
  }

  if (!isValidFirestoreDocId(documentId)) {
    return {
      ok: false,
      value: null,
      errors: [`Invalid Firestore document ID "${documentId}".`],
    };
  }

  if (!isPlainObject(rawData)) {
    return {
      ok: false,
      value: null,
      errors: [`Record "${collection}/${documentId}" data must be a plain object.`],
    };
  }

  switch (collection) {
    case 'demoProblems': {
      const result = validateDemoProblemDocument(documentId, rawData);
      return {
        ok: result.ok,
        value: result.value as Record<string, unknown> | null,
        errors: result.errors,
      };
    }

    case 'dataSources': {
      const result = validateDataSourceRecord(rawData);
      const errors = [...result.errors];
      if (result.ok && result.value && result.value.sourceId !== documentId) {
        errors.push(`Field "sourceId" (${result.value.sourceId}) must match documentId "${documentId}".`);
      }
      return errors.length > 0
        ? { ok: false, value: null, errors }
        : { ok: true, value: result.value as unknown as Record<string, unknown>, errors: [] };
    }

    case 'sourceObservations': {
      const result = validateSourceObservationRecord(rawData, context.knownSourceIds);
      const errors = [...result.errors];
      if (result.ok && result.value && result.value.observationId !== documentId) {
        errors.push(
          `Field "observationId" (${result.value.observationId}) must match documentId "${documentId}".`
        );
      }
      return errors.length > 0
        ? { ok: false, value: null, errors }
        : { ok: true, value: result.value as unknown as Record<string, unknown>, errors: [] };
    }

    case 'problemClusters': {
      const result = validateProblemClusterRecord(rawData);
      const errors = [...result.errors];
      if (result.ok && result.value && result.value.problemId !== documentId) {
        errors.push(
          `Field "problemId" (${result.value.problemId}) must match documentId "${documentId}".`
        );
      }
      return errors.length > 0
        ? { ok: false, value: null, errors }
        : { ok: true, value: result.value as unknown as Record<string, unknown>, errors: [] };
    }

    case 'evidenceLinks': {
      const result = validateEvidenceLinkRecord(documentId, rawData);
      return result.ok && result.value
        ? { ok: true, value: result.value as unknown as Record<string, unknown>, errors: [] }
        : { ok: false, value: null, errors: result.errors };
    }

    case 'researchInsights': {
      const result = validateResearchInsightRecord(rawData, context.verifiedObservationIds);
      const errors = [...result.errors];
      if (result.ok && result.value && result.value.insightId !== documentId) {
        errors.push(
          `Field "insightId" (${result.value.insightId}) must match documentId "${documentId}".`
        );
      }
      return errors.length > 0
        ? { ok: false, value: null, errors }
        : { ok: true, value: result.value as unknown as Record<string, unknown>, errors: [] };
    }

    case 'opportunityEvaluations': {
      const errors: string[] = [];
      if (
        typeof rawData.schemaVersion !== 'number' ||
        !Number.isInteger(rawData.schemaVersion) ||
        rawData.schemaVersion < 1
      ) {
        errors.push('Field "schemaVersion" must be a positive integer.');
      }
      const problemId = typeof rawData.problemId === 'string' ? rawData.problemId.trim() : '';
      if (!problemId || problemId !== documentId) {
        errors.push(`Field "problemId" must match documentId "${documentId}".`);
      }

      const problemContext =
        context.problemById?.get(problemId) ??
        createZeroEvidenceEvaluationFallbackProblem(problemId || documentId);

      const evalOutcome = validateFirestoreEvaluationRecord(rawData, problemContext);
      if (!evalOutcome.ok) {
        errors.push(...evalOutcome.errors);
      }

      return errors.length > 0
        ? { ok: false, value: null, errors }
        : { ok: true, value: canonicalizeValue(rawData) as Record<string, unknown>, errors: [] };
    }

    case 'publishedProblems': {
      const result = validatePublishedProblemDocument(documentId, rawData);
      return result.ok && result.value
        ? { ok: true, value: result.value as unknown as Record<string, unknown>, errors: [] }
        : { ok: false, value: null, errors: result.errors };
    }

    default:
      return {
        ok: false,
        value: null,
        errors: [`Unsupported Firestore collection "${collection}".`],
      };
  }
}

export function parseIngestionPayload(rawJson: unknown): readonly IngestionRecordInput[] {
  let items: unknown[];
  let defaultCollection: string | null = null;

  if (Array.isArray(rawJson)) {
    items = rawJson;
  } else if (isPlainObject(rawJson) && Array.isArray(rawJson.records)) {
    if (typeof rawJson.collection === 'string') {
      defaultCollection = rawJson.collection.trim();
    }
    items = rawJson.records;
  } else {
    throw new Error(
      'Ingestion JSON must be either { "collection": "<name>", "records": [...] } or an array of { "collection", "documentId", "data" } objects.'
    );
  }

  if (items.length === 0) {
    throw new Error('Ingestion payload contains zero records.');
  }

  const parsed: IngestionRecordInput[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const entry = items[i];
    if (!isPlainObject(entry)) {
      throw new Error(`Ingestion record at index ${i} must be an object.`);
    }

    const collection =
      typeof entry.collection === 'string'
        ? entry.collection.trim()
        : defaultCollection ?? '';
    if (!isSupportedIngestionCollection(collection)) {
      throw new Error(
        `Ingestion record at index ${i} specifies unsupported collection "${collection}".`
      );
    }

    const documentId =
      typeof entry.documentId === 'string' ? entry.documentId.trim() : '';
    if (!isValidFirestoreDocId(documentId)) {
      throw new Error(
        `Ingestion record at index ${i} has invalid documentId "${documentId}".`
      );
    }

    if (!isPlainObject(entry.data)) {
      throw new Error(
        `Ingestion record "${collection}/${documentId}" must contain a plain object "data" field.`
      );
    }

    parsed.push({
      collection,
      documentId,
      data: entry.data,
    });
  }

  return parsed;
}

/**
 * Performs read-only connectivity and integrity verification against the three
 * approved `demoProblems` documents using `DEMO_PROBLEMS_SEED_MANIFEST`.
 */
export async function verifyDemoSeedReadOnly(
  store: AdminFirestoreStore
): Promise<DemoConnectivityReport> {
  const items: DemoVerificationItem[] = [];

  for (const id of APPROVED_DEMO_PROBLEM_IDS) {
    const manifestEntry = DEMO_PROBLEMS_SEED_MANIFEST.find((m) => m.documentId === id);
    const snap = await store.getDocument(FIRESTORE_COLLECTION_NAMES.demoProblems, id);

    if (!snap.exists || !snap.data) {
      items.push({
        documentId: id,
        documentPath: `demoProblems/${id}`,
        exists: false,
        validationOk: false,
        matchesManifest: false,
        changedFields: [],
        errors: [`Document "demoProblems/${id}" does not exist.`],
      });
      continue;
    }

    const validation = validateDemoProblemDocument(id, snap.data);
    const expected = (manifestEntry?.data ?? {}) as unknown as Record<string, unknown>;
    const changedFields = manifestEntry
      ? diffTopLevelFields(snap.data, expected)
      : [];

    items.push({
      documentId: id,
      documentPath: `demoProblems/${id}`,
      exists: true,
      validationOk: validation.ok,
      matchesManifest: validation.ok && changedFields.length === 0,
      changedFields,
      errors: validation.errors,
    });
  }

  const allValidAndMatching = items.every(
    (item) => item.exists && item.validationOk && item.matchesManifest
  );

  return {
    projectId: store.projectId,
    databaseId: store.databaseId,
    connected: true,
    allValidAndMatching,
    items,
  };
}

export function buildDemoSeedRecords(): readonly IngestionRecordInput[] {
  return DEMO_PROBLEMS_SEED_MANIFEST.map((entry) => ({
    collection: entry.collection,
    documentId: entry.documentId,
    data: entry.data as unknown as Record<string, unknown>,
  }));
}

export interface ExecuteIngestionOptions {
  readonly mode: 'dry-run' | 'apply';
  readonly approved: boolean;
  readonly conflictPolicy?: ConflictPolicy;
  readonly approvedOverwritePaths?: readonly string[];
  readonly batchContext?: BatchValidationContext;
  readonly allowEditorialClusterTransitions?: boolean;
}

const RESEARCH_COLLECTIONS = new Set<FirestoreCollectionName>([
  'dataSources',
  'sourceObservations',
  'problemClusters',
  'evidenceLinks',
  'researchInsights',
]);

/**
 * Reusable, validated, idempotent ingestion and seeding engine.
 * Enforces:
 * - Pre-write schema/integrity validation across the entire batch.
 * - Cross-record deduplication on `evidenceLinks`.
 * - Publication governance: blocks direct `publishedProblems` ingestion, restricts
 *   editorial statuses unless invoked by `review-cluster`, verifies active/approved
 *   sources and verified observations, blocks mutations to published clusters, and
 *   atomically invalidates stale approval on modified approved clusters.
 * - Conflict detection (never overwrites conflicting records silently).
 * - Explicit approval gating before any write.
 * - Post-write read-back + integrity re-validation.
 */
export async function executeIngestionPlan(
  store: AdminFirestoreStore,
  records: readonly IngestionRecordInput[],
  options: ExecuteIngestionOptions
): Promise<IngestionExecutionReport> {
  const conflictPolicy: ConflictPolicy = options.conflictPolicy ?? 'abort';
  const approvedOverwriteSet = new Set(options.approvedOverwritePaths ?? []);
  const allowEditorialClusterTransitions = Boolean(
    options.allowEditorialClusterTransitions
  );

  const touchesResearchCollections = records.some((r) =>
    RESEARCH_COLLECTIONS.has(r.collection)
  );

  const storeSourcesById = new Map<string, Record<string, unknown>>();
  const storeObsById = new Map<string, Record<string, unknown>>();
  const storeClustersById = new Map<
    string,
    { data: Record<string, unknown>; updateTimeMs: number | null }
  >();
  const storeLinks: Array<{ problemId: string; observationId: string }> = [];

  if (touchesResearchCollections) {
    const [sourceSnaps, obsSnaps, clusterSnaps, linkSnaps] = await Promise.all([
      store.listDocuments(FIRESTORE_COLLECTION_NAMES.dataSources, { limit: 500 }),
      store.listDocuments(FIRESTORE_COLLECTION_NAMES.sourceObservations, { limit: 1000 }),
      store.listDocuments(FIRESTORE_COLLECTION_NAMES.problemClusters, { limit: 1000 }),
      store.listDocuments(FIRESTORE_COLLECTION_NAMES.evidenceLinks, { limit: 1000 }),
    ]);

    for (const s of sourceSnaps) {
      if (s.exists && s.data) {
        const sid = typeof s.data.sourceId === 'string' ? s.data.sourceId.trim() : s.id;
        storeSourcesById.set(sid, s.data);
      }
    }
    for (const o of obsSnaps) {
      if (o.exists && o.data) {
        const oid =
          typeof o.data.observationId === 'string' ? o.data.observationId.trim() : o.id;
        storeObsById.set(oid, o.data);
      }
    }
    for (const c of clusterSnaps) {
      if (c.exists && c.data) {
        const cid = typeof c.data.problemId === 'string' ? c.data.problemId.trim() : c.id;
        storeClustersById.set(cid, { data: c.data, updateTimeMs: c.updateTimeMs });
      }
    }
    for (const l of linkSnaps) {
      if (
        l.exists &&
        l.data &&
        typeof l.data.problemId === 'string' &&
        typeof l.data.observationId === 'string'
      ) {
        storeLinks.push({
          problemId: l.data.problemId.trim(),
          observationId: l.data.observationId.trim(),
        });
      }
    }
  }

  const effectiveSourcesById = new Map(storeSourcesById);
  const effectiveObsById = new Map(storeObsById);
  const effectiveClusterIds = new Set<string>(storeClustersById.keys());

  for (const record of records) {
    if (!isPlainObject(record.data)) continue;
    if (record.collection === 'dataSources') {
      effectiveSourcesById.set(record.documentId, record.data);
    } else if (record.collection === 'sourceObservations') {
      effectiveObsById.set(record.documentId, record.data);
    } else if (record.collection === 'problemClusters') {
      effectiveClusterIds.add(record.documentId);
    }
  }

  const activeApprovedSourceIds = new Set<string>();
  for (const [sourceId, src] of effectiveSourcesById.entries()) {
    if (
      src.permissionReviewStatus === 'approved' &&
      src.activationStatus === 'active'
    ) {
      activeApprovedSourceIds.add(sourceId);
    }
  }

  const activeObservationIds = new Set<string>();
  const verifiedObservationIds = new Set<string>();
  for (const [obsId, obs] of effectiveObsById.entries()) {
    if (obs.removalOrRestrictionStatus !== 'active') continue;
    activeObservationIds.add(obsId);
    const sourceId = typeof obs.sourceId === 'string' ? obs.sourceId.trim() : '';
    if (
      obs.verificationStatus === 'verified' &&
      activeApprovedSourceIds.has(sourceId)
    ) {
      verifiedObservationIds.add(obsId);
    }
  }

  const context: BatchValidationContext = {
    ...options.batchContext,
    ...(touchesResearchCollections
      ? {
          knownSourceIds: activeApprovedSourceIds,
          verifiedObservationIds,
        }
      : {}),
  };

  const validationIssues: IngestionValidationIssue[] = [];
  const seenPaths = new Set<string>();
  const validatedRecords: {
    collection: FirestoreCollectionName;
    documentId: string;
    documentPath: string;
    data: Record<string, unknown>;
    digest: string;
  }[] = [];

  const validatedEvidenceLinks: EvidenceLinkDocument[] = [];
  const directlyWrittenClusterIds = new Set<string>();

  for (const record of records) {
    const docPath = `${record.collection}/${record.documentId}`;
    if (seenPaths.has(docPath)) {
      validationIssues.push({
        collection: record.collection,
        documentId: record.documentId,
        errors: [`Duplicate record path "${docPath}" in ingestion batch.`],
      });
      continue;
    }
    seenPaths.add(docPath);

    if (record.collection === 'publishedProblems') {
      validationIssues.push({
        collection: record.collection,
        documentId: record.documentId,
        errors: [
          'Direct ingestion into "publishedProblems" is prohibited. Use review-cluster and publish-problem after editorial approval and sanitization.',
        ],
      });
      continue;
    }

    const outcome = validateCollectionRecord(
      record.collection,
      record.documentId,
      record.data,
      context
    );

    if (!outcome.ok || !outcome.value) {
      validationIssues.push({
        collection: record.collection,
        documentId: record.documentId,
        errors: outcome.errors,
      });
      continue;
    }

    if (record.collection === 'problemClusters') {
      const clusterData = outcome.value;
      const incomingStatus = String(clusterData.publicationStatus ?? '');
      const existingCluster = storeClustersById.get(record.documentId);
      const existingStatus = existingCluster
        ? String(existingCluster.data.publicationStatus ?? '')
        : null;

      if (!allowEditorialClusterTransitions) {
        const hasEditorialMetadata =
          (typeof clusterData.approvedBy === 'string' && clusterData.approvedBy.trim().length > 0) ||
          Boolean(clusterData.approvedAt) ||
          Boolean(clusterData.publishedAt) ||
          Boolean(clusterData.archivedAt) ||
          (typeof clusterData.archiveReason === 'string' && clusterData.archiveReason.trim().length > 0);

        if (
          incomingStatus === 'approved' ||
          incomingStatus === 'published' ||
          incomingStatus === 'archived' ||
          hasEditorialMetadata
        ) {
          validationIssues.push({
            collection: record.collection,
            documentId: record.documentId,
            errors: [
              `Cluster "${record.documentId}" cannot set publicationStatus="${incomingStatus}" or approval/publication/archive metadata via generic ingestion. Use review-cluster, publish-problem, and archive-problem.`,
            ],
          });
          continue;
        }

        if (existingStatus === 'approved' && incomingStatus !== 'draft') {
          validationIssues.push({
            collection: record.collection,
            documentId: record.documentId,
            errors: [
              `Cluster "${record.documentId}" is currently approved; material edits outside editorial review must reset publicationStatus to "draft".`,
            ],
          });
          continue;
        }
      }

      if (existingStatus === 'published') {
        validationIssues.push({
          collection: record.collection,
          documentId: record.documentId,
          errors: [
            `Cluster "${record.documentId}" is currently published and cannot be overwritten via ingestion. Archive it via archive-problem first.`,
          ],
        });
        continue;
      }

      directlyWrittenClusterIds.add(record.documentId);
    }

    if (record.collection === 'evidenceLinks') {
      const link = outcome.value as unknown as EvidenceLinkDocument;
      const linkErrors: string[] = [];
      if (!activeObservationIds.has(link.observationId)) {
        linkErrors.push(
          `Evidence link "${record.documentId}" references missing or inactive observation "${link.observationId}".`
        );
      }
      if (!effectiveClusterIds.has(link.problemId)) {
        linkErrors.push(
          `Evidence link "${record.documentId}" references unknown problem cluster "${link.problemId}".`
        );
      }
      if (linkErrors.length > 0) {
        validationIssues.push({
          collection: record.collection,
          documentId: record.documentId,
          errors: linkErrors,
        });
        continue;
      }
      validatedEvidenceLinks.push(link);
    }

    const normalizedData = canonicalizeValue(outcome.value) as Record<string, unknown>;
    validatedRecords.push({
      collection: record.collection,
      documentId: record.documentId,
      documentPath: docPath,
      data: normalizedData,
      digest: computeRecordDigest(normalizedData),
    });
  }

  if (validatedEvidenceLinks.length > 0) {
    const dedup = deduplicateEvidenceLinks(validatedEvidenceLinks);
    if (dedup.duplicateCount > 0) {
      validationIssues.push({
        collection: 'evidenceLinks',
        documentId: '*',
        errors: [
          `Detected ${dedup.duplicateCount} duplicate evidenceLink observation/fingerprint entries in batch.`,
        ],
      });
    }
  }

  if (validationIssues.length > 0) {
    return {
      mode: options.mode,
      projectId: store.projectId,
      databaseId: store.databaseId,
      conflictPolicy,
      approved: options.approved,
      validationPassed: false,
      validationIssues,
      totalRecords: records.length,
      planned: [],
      summary: {
        create: 0,
        unchanged: 0,
        conflict: 0,
        approvedOverwrite: 0,
        appliedCreates: 0,
        appliedUpdates: 0,
        skippedConflicts: 0,
        verifiedWrites: 0,
      },
      blockedReason: 'Pre-write validation failed. Zero writes executed.',
      postWriteVerification: [],
    };
  }

  const MAX_ATOMIC_TRANSACTION_WRITES = 500;
  const planned: PlannedRecordDecision[] = [];
  for (const item of validatedRecords) {
    const existing = await store.getDocument(item.collection, item.documentId);
    if (!existing.exists || !existing.data) {
      planned.push({
        collection: item.collection,
        documentId: item.documentId,
        documentPath: item.documentPath,
        action: 'create',
        changedFields: Object.keys(item.data).sort(),
        digest: item.digest,
        existingDigest: null,
        existingUpdateTimeMs: null,
        normalizedData: item.data,
      });
      continue;
    }

    const existingDigest = computeRecordDigest(existing.data);
    if (existingDigest === item.digest) {
      planned.push({
        collection: item.collection,
        documentId: item.documentId,
        documentPath: item.documentPath,
        action: 'unchanged',
        changedFields: [],
        digest: item.digest,
        existingDigest,
        existingUpdateTimeMs: existing.updateTimeMs,
        normalizedData: item.data,
      });
      continue;
    }

    const changedFields = diffTopLevelFields(existing.data, item.data);
    const isExplicitlyApprovedOverwrite =
      conflictPolicy === 'overwrite' &&
      options.approved &&
      (approvedOverwriteSet.has(item.documentPath) ||
        approvedOverwriteSet.has(item.documentId));

    planned.push({
      collection: item.collection,
      documentId: item.documentId,
      documentPath: item.documentPath,
      action: isExplicitlyApprovedOverwrite ? 'approved_overwrite' : 'conflict',
      changedFields,
      digest: item.digest,
      existingDigest,
      existingUpdateTimeMs: existing.updateTimeMs,
      normalizedData: item.data,
    });
  }

  if (touchesResearchCollections) {
    const allLinks = [
      ...storeLinks,
      ...validatedEvidenceLinks.map((l) => ({
        problemId: l.problemId,
        observationId: l.observationId,
      })),
    ];
    const obsToClusterIds = new Map<string, Set<string>>();
    for (const l of allLinks) {
      let set = obsToClusterIds.get(l.observationId);
      if (!set) {
        set = new Set();
        obsToClusterIds.set(l.observationId, set);
      }
      set.add(l.problemId);
    }

    const sourceToClusterIds = new Map<string, Set<string>>();
    for (const [obsId, obs] of effectiveObsById.entries()) {
      const sourceId = typeof obs.sourceId === 'string' ? obs.sourceId.trim() : '';
      const linkedClusters = obsToClusterIds.get(obsId);
      if (!sourceId || !linkedClusters) continue;
      let set = sourceToClusterIds.get(sourceId);
      if (!set) {
        set = new Set();
        sourceToClusterIds.set(sourceId, set);
      }
      for (const cid of linkedClusters) set.add(cid);
    }

    const affectedPublishedIds = new Set<string>();
    const executableAffectedApprovedIds = new Set<string>();

    for (const decision of planned) {
      if (decision.action === 'unchanged') continue;
      if (decision.action === 'conflict' && conflictPolicy === 'skip') continue;

      const linkedClusterIds = new Set<string>();
      if (decision.collection === 'evidenceLinks' || decision.collection === 'researchInsights') {
        const pid = String(decision.normalizedData.problemId ?? '').trim();
        if (pid) linkedClusterIds.add(pid);
      } else if (decision.collection === 'sourceObservations') {
        for (const cid of obsToClusterIds.get(decision.documentId) ?? []) {
          linkedClusterIds.add(cid);
        }
      } else if (decision.collection === 'dataSources') {
        for (const cid of sourceToClusterIds.get(decision.documentId) ?? []) {
          linkedClusterIds.add(cid);
        }
      }

      for (const cid of linkedClusterIds) {
        if (directlyWrittenClusterIds.has(cid)) continue;
        const existingCluster = storeClustersById.get(cid);
        if (!existingCluster) continue;
        const status = String(existingCluster.data.publicationStatus ?? '');
        if (status === 'published') {
          affectedPublishedIds.add(cid);
        } else if (
          status === 'approved' &&
          (decision.action === 'create' || decision.action === 'approved_overwrite')
        ) {
          executableAffectedApprovedIds.add(cid);
        }
      }
    }

    if (affectedPublishedIds.size > 0) {
      const pubIssues: IngestionValidationIssue[] = Array.from(affectedPublishedIds)
        .sort()
        .map((cid) => ({
          collection: 'problemClusters',
          documentId: cid,
          errors: [
            `Cannot modify sources, observations, evidenceLinks, or researchInsights linked to published cluster "${cid}". Archive it via archive-problem first.`,
          ],
        }));

      return {
        mode: options.mode,
        projectId: store.projectId,
        databaseId: store.databaseId,
        conflictPolicy,
        approved: options.approved,
        validationPassed: false,
        validationIssues: pubIssues,
        totalRecords: records.length,
        planned: [],
        summary: {
          create: 0,
          unchanged: 0,
          conflict: 0,
          approvedOverwrite: 0,
          appliedCreates: 0,
          appliedUpdates: 0,
          skippedConflicts: 0,
          verifiedWrites: 0,
        },
        blockedReason:
          'Pre-write governance validation failed: published cluster inputs cannot be mutated directly. Zero writes executed.',
        postWriteVerification: [],
      };
    }

    for (const cid of executableAffectedApprovedIds) {
      const existingSnap = await store.getDocument(
        FIRESTORE_COLLECTION_NAMES.problemClusters,
        cid
      );
      if (!existingSnap.exists || !existingSnap.data) continue;
      const parsedCluster = validateProblemClusterRecord(existingSnap.data);
      if (!parsedCluster.ok || !parsedCluster.value) continue;
      if (parsedCluster.value.publicationStatus !== 'approved') continue;

      const invalidated = invalidateStaleClusterApproval(parsedCluster.value, {
        reasonNote: 'Linked research records updated via administrative ingestion.',
      });
      const normalizedInvalidated = canonicalizeValue(
        invalidated
      ) as Record<string, unknown>;
      const changedFields = diffTopLevelFields(
        existingSnap.data,
        normalizedInvalidated
      );
      if (changedFields.length > 0) {
        planned.push({
          collection: FIRESTORE_COLLECTION_NAMES.problemClusters,
          documentId: cid,
          documentPath: `problemClusters/${cid}`,
          action: 'approved_overwrite',
          changedFields,
          digest: computeRecordDigest(normalizedInvalidated),
          existingDigest: computeRecordDigest(existingSnap.data),
          existingUpdateTimeMs: existingSnap.updateTimeMs,
          normalizedData: normalizedInvalidated,
        });
      }
    }
  }

  const createCount = planned.filter((p) => p.action === 'create').length;
  const unchangedCount = planned.filter((p) => p.action === 'unchanged').length;
  const conflictCount = planned.filter((p) => p.action === 'conflict').length;
  const approvedOverwriteCount = planned.filter(
    (p) => p.action === 'approved_overwrite'
  ).length;

  if (options.mode === 'dry-run') {
    return {
      mode: 'dry-run',
      projectId: store.projectId,
      databaseId: store.databaseId,
      conflictPolicy,
      approved: options.approved,
      validationPassed: true,
      validationIssues: [],
      totalRecords: records.length,
      planned,
      summary: {
        create: createCount,
        unchanged: unchangedCount,
        conflict: conflictCount,
        approvedOverwrite: approvedOverwriteCount,
        appliedCreates: 0,
        appliedUpdates: 0,
        skippedConflicts: 0,
        verifiedWrites: 0,
      },
      blockedReason:
        conflictCount > 0 && conflictPolicy === 'abort'
          ? 'Conflicts detected (dry-run). Conflicting existing records will not be overwritten automatically.'
          : null,
      postWriteVerification: [],
    };
  }

  if (!options.approved) {
    return {
      mode: 'apply',
      projectId: store.projectId,
      databaseId: store.databaseId,
      conflictPolicy,
      approved: false,
      validationPassed: true,
      validationIssues: [],
      totalRecords: records.length,
      planned,
      summary: {
        create: createCount,
        unchanged: unchangedCount,
        conflict: conflictCount,
        approvedOverwrite: approvedOverwriteCount,
        appliedCreates: 0,
        appliedUpdates: 0,
        skippedConflicts: 0,
        verifiedWrites: 0,
      },
      blockedReason:
        'Explicit operator approval is required before executing Firestore writes.',
      postWriteVerification: [],
    };
  }

  if (conflictCount > 0 && conflictPolicy === 'abort') {
    return {
      mode: 'apply',
      projectId: store.projectId,
      databaseId: store.databaseId,
      conflictPolicy,
      approved: options.approved,
      validationPassed: true,
      validationIssues: [],
      totalRecords: records.length,
      planned,
      summary: {
        create: createCount,
        unchanged: unchangedCount,
        conflict: conflictCount,
        approvedOverwrite: approvedOverwriteCount,
        appliedCreates: 0,
        appliedUpdates: 0,
        skippedConflicts: 0,
        verifiedWrites: 0,
      },
      blockedReason: `Aborted apply: ${conflictCount} conflicting existing document(s) detected and silent overwrites are disabled.`,
      postWriteVerification: [],
    };
  }

  if (conflictCount > 0 && conflictPolicy === 'overwrite') {
    return {
      mode: 'apply',
      projectId: store.projectId,
      databaseId: store.databaseId,
      conflictPolicy,
      approved: options.approved,
      validationPassed: true,
      validationIssues: [],
      totalRecords: records.length,
      planned,
      summary: {
        create: createCount,
        unchanged: unchangedCount,
        conflict: conflictCount,
        approvedOverwrite: approvedOverwriteCount,
        appliedCreates: 0,
        appliedUpdates: 0,
        skippedConflicts: 0,
        verifiedWrites: 0,
      },
      blockedReason:
        'Aborted apply: conflictPolicy="overwrite" requires every conflicting document ID/path to be listed in --confirm-overwrite.',
      postWriteVerification: [],
    };
  }

  const writeTargets = planned.filter(
    (decision) =>
      decision.action === 'create' || decision.action === 'approved_overwrite'
  );
  const skippedConflicts = planned.filter(
    (decision) => decision.action === 'conflict'
  ).length;

  if (writeTargets.length > MAX_ATOMIC_TRANSACTION_WRITES) {
    return {
      mode: 'apply',
      projectId: store.projectId,
      databaseId: store.databaseId,
      conflictPolicy,
      approved: options.approved,
      validationPassed: true,
      validationIssues: [],
      totalRecords: records.length,
      planned,
      summary: {
        create: createCount,
        unchanged: unchangedCount,
        conflict: conflictCount,
        approvedOverwrite: approvedOverwriteCount,
        appliedCreates: 0,
        appliedUpdates: 0,
        skippedConflicts: 0,
        verifiedWrites: 0,
      },
      blockedReason: `Batch contains ${writeTargets.length} writes, exceeding Firestore's atomic transaction limit (${MAX_ATOMIC_TRANSACTION_WRITES}). Split into smaller batches.`,
      postWriteVerification: [],
    };
  }

  let appliedCreates = 0;
  let appliedUpdates = 0;
  const writtenItems: PlannedRecordDecision[] = [];

  if (writeTargets.length > 0) {
    try {
      await store.runTransaction(async (txStore) => {
        // Firestore transactions require all reads before any writes.
        const liveSnapshots = new Map<
          string,
          Awaited<ReturnType<typeof txStore.getDocument>>
        >();
        for (const decision of writeTargets) {
          const snap = await txStore.getDocument(
            decision.collection,
            decision.documentId
          );
          liveSnapshots.set(decision.documentPath, snap);
        }

        for (const decision of writeTargets) {
          const liveSnap = liveSnapshots.get(decision.documentPath)!;
          if (decision.action === 'create') {
            if (liveSnap.exists) {
              throw new Error(
                `CONCURRENT_MODIFICATION_CONFLICT: "${decision.documentPath}" was created concurrently after planning.`
              );
            }
          } else if (decision.action === 'approved_overwrite') {
            if (!liveSnap.exists || !liveSnap.data) {
              throw new Error(
                `CONCURRENT_MODIFICATION_CONFLICT: "${decision.documentPath}" disappeared concurrently before approved overwrite.`
              );
            }
            const liveDigest = computeRecordDigest(liveSnap.data);
            if (
              liveSnap.updateTimeMs !== decision.existingUpdateTimeMs ||
              liveDigest !== decision.existingDigest
            ) {
              throw new Error(
                `CONCURRENT_MODIFICATION_CONFLICT: "${decision.documentPath}" changed concurrently since planning.`
              );
            }
          }
        }

        for (const decision of writeTargets) {
          if (decision.action === 'create') {
            txStore.createDocument(
              decision.collection,
              decision.documentId,
              decision.normalizedData
            );
            appliedCreates += 1;
            writtenItems.push(decision);
          } else if (decision.action === 'approved_overwrite') {
            txStore.updateDocument(
              decision.collection,
              decision.documentId,
              decision.normalizedData
            );
            appliedUpdates += 1;
            writtenItems.push(decision);
          }
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        mode: 'apply',
        projectId: store.projectId,
        databaseId: store.databaseId,
        conflictPolicy,
        approved: options.approved,
        validationPassed: true,
        validationIssues: [],
        totalRecords: records.length,
        planned,
        summary: {
          create: createCount,
          unchanged: unchangedCount,
          conflict: conflictCount,
          approvedOverwrite: approvedOverwriteCount,
          appliedCreates: 0,
          appliedUpdates: 0,
          skippedConflicts: 0,
          verifiedWrites: 0,
        },
        blockedReason: message,
        postWriteVerification: [],
      };
    }
  }

  const postWriteVerification: PostWriteVerificationEntry[] = [];
  for (const written of writtenItems) {
    const readBack = await store.getDocument(written.collection, written.documentId);
    if (!readBack.exists || !readBack.data) {
      postWriteVerification.push({
        documentPath: written.documentPath,
        ok: false,
        error: 'Document missing during post-write verification read-back.',
      });
      continue;
    }

    const revalidated = validateCollectionRecord(
      written.collection,
      written.documentId,
      readBack.data,
      context
    );
    if (!revalidated.ok) {
      postWriteVerification.push({
        documentPath: written.documentPath,
        ok: false,
        error: `Post-write validation failed: ${revalidated.errors.join('; ')}`,
      });
      continue;
    }

    const liveDigest = computeRecordDigest(readBack.data);
    if (liveDigest !== written.digest) {
      postWriteVerification.push({
        documentPath: written.documentPath,
        ok: false,
        error: `Post-write digest mismatch (expected ${written.digest.slice(0, 12)}, got ${liveDigest.slice(0, 12)}).`,
      });
      continue;
    }

    postWriteVerification.push({
      documentPath: written.documentPath,
      ok: true,
      error: null,
    });
  }

  const verifiedWrites = postWriteVerification.filter((v) => v.ok).length;
  const allVerified = postWriteVerification.every((v) => v.ok);

  return {
    mode: 'apply',
    projectId: store.projectId,
    databaseId: store.databaseId,
    conflictPolicy,
    approved: options.approved,
    validationPassed: true,
    validationIssues: [],
    totalRecords: records.length,
    planned,
    summary: {
      create: createCount,
      unchanged: unchangedCount,
      conflict: conflictCount,
      approvedOverwrite: approvedOverwriteCount,
      appliedCreates,
      appliedUpdates,
      skippedConflicts,
      verifiedWrites,
    },
    blockedReason: allVerified
      ? null
      : 'Post-write integrity verification failed for one or more documents.',
    postWriteVerification,
  };
}
