import crypto from 'node:crypto';
import type { Problem } from '../../src/config/problemExplorer';
import { validateEvidenceReferences } from '../../src/config/problemExplorer';
import {
  DEMO_PROBLEMS_SEED_MANIFEST,
} from '../../src/data/demoSeedManifest';
import {
  APPROVED_DEMO_PROBLEM_IDS,
  FIRESTORE_COLLECTION_NAMES,
  type EvidenceLinkDocument,
  type FirestoreCollectionName,
  type PublishedProblemDocument,
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
  validateResearchInsightRecord,
  validateSourceObservationRecord,
  type ValidationOutcome,
} from '../../src/data/firestoreValidation';
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

function validatePublishedProblemRecord(
  expectedDocId: string,
  raw: unknown
): ValidationOutcome<PublishedProblemDocument> {
  const errors: string[] = [];
  if (!isPlainObject(raw)) {
    return { ok: false, value: null, errors: ['publishedProblems document must be an object.'] };
  }

  if (raw.id !== expectedDocId || raw.slug !== expectedDocId) {
    errors.push(`Published problem "id" and "slug" must equal document ID "${expectedDocId}".`);
  }
  if (raw.isIllustrativeDemo !== false) {
    errors.push('Published problem must set isIllustrativeDemo === false.');
  }
  if (raw.publicationStatus !== 'published') {
    errors.push('Published problem must set publicationStatus === "published".');
  }
  if (
    typeof raw.verifiedEvidenceCount !== 'number' ||
    !Number.isInteger(raw.verifiedEvidenceCount) ||
    raw.verifiedEvidenceCount < 1
  ) {
    errors.push('Published problem requires verifiedEvidenceCount >= 1.');
  }
  const publishedAt = parseValidIsoTimestamp(raw.publishedAt);
  if (!publishedAt) {
    errors.push('Published problem "publishedAt" must be a valid timestamp.');
  }
  if (
    typeof raw.schemaVersion !== 'number' ||
    !Number.isInteger(raw.schemaVersion) ||
    raw.schemaVersion < 1
  ) {
    errors.push('Field "schemaVersion" must be a positive integer.');
  }
  if (typeof raw.title !== 'string' || !raw.title.trim() || containsUnsafeHtmlOrScript(raw.title)) {
    errors.push('Published problem "title" must be a safe non-empty string.');
  }
  if (typeof raw.summary !== 'string' || !raw.summary.trim() || containsUnsafeHtmlOrScript(raw.summary)) {
    errors.push('Published problem "summary" must be a safe non-empty string.');
  }

  const candidateProblem: Problem = {
    id: expectedDocId,
    slug: expectedDocId,
    title: typeof raw.title === 'string' ? raw.title : '',
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    categories: Array.isArray(raw.categories) ? (raw.categories as Problem['categories']) : [],
    affectedAudience: Array.isArray(raw.affectedAudience)
      ? (raw.affectedAudience as readonly string[])
      : [],
    recurrenceNote: typeof raw.recurrenceNote === 'string' ? raw.recurrenceNote : '',
    isIllustrativeDemo: false,
    evidenceCoverage: {
      sourceCount: typeof raw.sourceCoverage === 'number' ? raw.sourceCoverage : null,
      verifiedCount:
        typeof raw.verifiedEvidenceCount === 'number' ? raw.verifiedEvidenceCount : 0,
      illustrativeCount: 0,
      lastUpdated: typeof raw.lastUpdated === 'string' ? raw.lastUpdated : null,
      coverageNote: typeof raw.coverageNote === 'string' ? raw.coverageNote : '',
    },
    evidence: [],
    insights: Array.isArray(raw.insights) ? (raw.insights as Problem['insights']) : [],
    existingAlternatives: Array.isArray(raw.existingAlternatives)
      ? (raw.existingAlternatives as Problem['existingAlternatives'])
      : [],
    unknownsAndRisks: Array.isArray(raw.unknownsAndRisks)
      ? (raw.unknownsAndRisks as readonly string[])
      : [],
  };
  const evidenceIntegrity = validateEvidenceReferences(candidateProblem);
  if (!evidenceIntegrity.valid) {
    errors.push(...evidenceIntegrity.errors);
  }

  if (errors.length > 0) {
    return { ok: false, value: null, errors };
  }

  return {
    ok: true,
    value: raw as unknown as PublishedProblemDocument,
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
      const result = validatePublishedProblemRecord(documentId, rawData);
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
}

/**
 * Reusable, validated, idempotent ingestion and seeding engine.
 * Enforces:
 * - Pre-write schema/integrity validation across the entire batch.
 * - Cross-record deduplication on `evidenceLinks`.
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

  const validationIssues: IngestionValidationIssue[] = [];
  const seenPaths = new Set<string>();
  const validatedRecords: {
    collection: FirestoreCollectionName;
    documentId: string;
    documentPath: string;
    data: Record<string, unknown>;
    digest: string;
  }[] = [];

  const batchSourceIds = new Set<string>(options.batchContext?.knownSourceIds ?? []);
  for (const record of records) {
    if (record.collection === 'dataSources' && typeof record.data.sourceId === 'string') {
      batchSourceIds.add(record.data.sourceId.trim());
    }
  }

  const context: BatchValidationContext = {
    ...options.batchContext,
    knownSourceIds: batchSourceIds.size > 0 ? batchSourceIds : undefined,
  };

  const validatedEvidenceLinks: EvidenceLinkDocument[] = [];

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

    if (record.collection === 'evidenceLinks') {
      validatedEvidenceLinks.push(outcome.value as unknown as EvidenceLinkDocument);
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
