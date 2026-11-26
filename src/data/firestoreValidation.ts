import type {
  OpportunityCardItem,
  QuickExploreCategory,
  TrendingTopic,
} from '../config/opportunityRadar';
import {
  sanitizeExternalUrl,
  validateEvidenceReferences,
  type Problem,
} from '../config/problemExplorer';
import {
  isApprovedScoringMethodology,
  validateEvaluationClaims,
  type OpportunityEvaluation,
} from '../config/opportunityEvaluation';
import {
  APPROVED_DEMO_PROBLEM_IDS,
  SUPPORTED_ILLUSTRATION_KEYS,
  SUPPORTED_PROBLEM_CATEGORIES,
  SUPPORTED_TRENDING_TOPICS,
  VALID_PUBLICATION_TRANSITIONS,
  type ApprovedDemoProblemId,
  type DataSourceDocument,
  type DemoProblemDocument,
  type EvidenceLinkDocument,
  type ProblemClusterDocument,
  type ProblemPublicationStatus,
  type ResearchInsightDocument,
  type SavedOpportunityDocument,
  type SavedOpportunitySourceScreen,
  type SourceObservationDocument,
  type UserProfileDocument,
  type ValidatedProblemAdapter,
} from './firestoreContracts';

export interface ValidationOutcome<T> {
  readonly ok: boolean;
  readonly value: T | null;
  readonly errors: readonly string[];
}

const DOC_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const MAX_STRING_SHORT = 240;
const MAX_STRING_LONG = 1200;
const MAX_ARRAY_ITEMS = 25;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isValidFirestoreDocId(id: unknown): id is string {
  return typeof id === 'string' && DOC_ID_PATTERN.test(id);
}

export function isApprovedDemoProblemId(
  id: string
): id is ApprovedDemoProblemId {
  return (APPROVED_DEMO_PROBLEM_IDS as readonly string[]).includes(id);
}

export function containsUnsafeHtmlOrScript(text: string): boolean {
  return /<\s*\/?\s*[a-z][^>]*>|javascript:|data:text\/html/i.test(text);
}

export function parseValidIsoTimestamp(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const ms = Date.parse(trimmed);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString();
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }

  // Support Firestore Timestamp-like objects ({ seconds, nanoseconds } or toDate())
  if (isPlainObject(value)) {
    if (typeof value.toDate === 'function') {
      const d = (value.toDate as () => unknown)();
      if (d instanceof Date && Number.isFinite(d.getTime())) {
        return d.toISOString();
      }
    }
    if (typeof value.seconds === 'number' && Number.isFinite(value.seconds)) {
      const ms = value.seconds * 1000;
      return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
    }
  }

  return null;
}

function readSafeString(
  obj: Record<string, unknown>,
  field: string,
  maxLength: number,
  errors: string[]
): string | null {
  const raw = obj[field];
  if (typeof raw !== 'string') {
    errors.push(`Field "${field}" must be a string.`);
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    errors.push(`Field "${field}" cannot be empty.`);
    return null;
  }
  if (trimmed.length > maxLength) {
    errors.push(`Field "${field}" exceeds maximum length of ${maxLength}.`);
    return null;
  }
  if (containsUnsafeHtmlOrScript(trimmed)) {
    errors.push(`Field "${field}" contains disallowed HTML or script content.`);
    return null;
  }
  return trimmed;
}

function readSafeStringArray(
  obj: Record<string, unknown>,
  field: string,
  options: { allowEmpty?: boolean; maxItems?: number; maxItemLength?: number },
  errors: string[]
): readonly string[] | null {
  const raw = obj[field];
  if (!Array.isArray(raw)) {
    errors.push(`Field "${field}" must be an array.`);
    return null;
  }
  const maxItems = options.maxItems ?? MAX_ARRAY_ITEMS;
  const maxItemLength = options.maxItemLength ?? MAX_STRING_LONG;
  if (!options.allowEmpty && raw.length === 0) {
    errors.push(`Field "${field}" must contain at least one entry.`);
    return null;
  }
  if (raw.length > maxItems) {
    errors.push(`Field "${field}" exceeds maximum item limit (${maxItems}).`);
    return null;
  }

  const out: string[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i];
    if (typeof entry !== 'string' || !entry.trim()) {
      errors.push(`Field "${field}[${i}]" must be a non-empty string.`);
      return null;
    }
    const trimmed = entry.trim();
    if (trimmed.length > maxItemLength) {
      errors.push(`Field "${field}[${i}]" exceeds max length (${maxItemLength}).`);
      return null;
    }
    if (containsUnsafeHtmlOrScript(trimmed)) {
      errors.push(`Field "${field}[${i}]" contains disallowed HTML or script content.`);
      return null;
    }
    out.push(trimmed);
  }
  return out;
}

export function isValidPublicationTransition(
  from: ProblemPublicationStatus,
  to: ProblemPublicationStatus
): boolean {
  return VALID_PUBLICATION_TRANSITIONS[from].includes(to);
}

/**
 * Runtime validator for `dataSources` records.
 */
export function validateDataSourceRecord(
  raw: unknown
): ValidationOutcome<DataSourceDocument> {
  const errors: string[] = [];
  if (!isPlainObject(raw)) {
    return { ok: false, value: null, errors: ['dataSources document must be an object.'] };
  }

  const sourceId = readSafeString(raw, 'sourceId', 128, errors);
  if (sourceId && !isValidFirestoreDocId(sourceId)) {
    errors.push('Field "sourceId" must be a valid Firestore document ID.');
  }

  const sourceName = readSafeString(raw, 'sourceName', MAX_STRING_SHORT, errors);
  const sourceCategory = readSafeString(raw, 'sourceCategory', 120, errors);
  const termsOrLicenceReference = readSafeString(raw, 'termsOrLicenceReference', MAX_STRING_LONG, errors);
  const attributionRequirements = readSafeString(raw, 'attributionRequirements', MAX_STRING_LONG, errors);
  const retentionRestrictions = readSafeString(raw, 'retentionRestrictions', MAX_STRING_LONG, errors);

  const allowedMechanisms = ['official_api', 'public_feed', 'manual_field_notes', 'dataset_license'];
  const permittedAccessMechanism = raw.permittedAccessMechanism;
  if (typeof permittedAccessMechanism !== 'string' || !allowedMechanisms.includes(permittedAccessMechanism)) {
    errors.push('Invalid "permittedAccessMechanism".');
  }

  const allowedReviewStatuses = ['pending_review', 'approved', 'rejected', 'suspended'];
  const permissionReviewStatus = raw.permissionReviewStatus;
  if (typeof permissionReviewStatus !== 'string' || !allowedReviewStatuses.includes(permissionReviewStatus)) {
    errors.push('Invalid "permissionReviewStatus".');
  }

  const activationStatus = raw.activationStatus;
  if (activationStatus !== 'disabled' && activationStatus !== 'active') {
    errors.push('Field "activationStatus" must be "disabled" or "active".');
  } else if (activationStatus === 'active' && permissionReviewStatus !== 'approved') {
    errors.push('A data source cannot be active unless permissionReviewStatus is "approved".');
  }

  const reviewDate = raw.reviewDate === null ? null : parseValidIsoTimestamp(raw.reviewDate);
  if (raw.reviewDate !== null && reviewDate === null) {
    errors.push('Field "reviewDate" must be null or a valid ISO timestamp.');
  }
  if (permissionReviewStatus === 'approved' && reviewDate === null) {
    errors.push('Approved sources must record a valid "reviewDate".');
  }

  const createdAt = parseValidIsoTimestamp(raw.createdAt);
  const updatedAt = parseValidIsoTimestamp(raw.updatedAt);
  if (!createdAt) errors.push('Field "createdAt" must be a valid timestamp.');
  if (!updatedAt) errors.push('Field "updatedAt" must be a valid timestamp.');

  if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) {
    errors.push('Field "schemaVersion" must be a positive integer.');
  }

  if (errors.length > 0) {
    return { ok: false, value: null, errors };
  }

  return {
    ok: true,
    value: {
      sourceId: sourceId!,
      sourceName: sourceName!,
      sourceCategory: sourceCategory!,
      permittedAccessMechanism: permittedAccessMechanism as DataSourceDocument['permittedAccessMechanism'],
      termsOrLicenceReference: termsOrLicenceReference!,
      permissionReviewStatus: permissionReviewStatus as DataSourceDocument['permissionReviewStatus'],
      reviewDate,
      attributionRequirements: attributionRequirements!,
      retentionRestrictions: retentionRestrictions!,
      activationStatus: activationStatus as DataSourceDocument['activationStatus'],
      createdAt: createdAt!,
      updatedAt: updatedAt!,
      schemaVersion: raw.schemaVersion as number,
    },
    errors: [],
  };
}

/**
 * Runtime validator for `sourceObservations` records.
 */
export function validateSourceObservationRecord(
  raw: unknown,
  knownSourceIds?: ReadonlySet<string>
): ValidationOutcome<SourceObservationDocument> {
  const errors: string[] = [];
  if (!isPlainObject(raw)) {
    return { ok: false, value: null, errors: ['sourceObservations document must be an object.'] };
  }

  const observationId = readSafeString(raw, 'observationId', 128, errors);
  if (observationId && !isValidFirestoreDocId(observationId)) {
    errors.push('Field "observationId" must be a valid document ID.');
  }

  const sourceId = readSafeString(raw, 'sourceId', 128, errors);
  if (sourceId && !isValidFirestoreDocId(sourceId)) {
    errors.push('Field "sourceId" must be a valid document ID.');
  }
  if (sourceId && knownSourceIds && !knownSourceIds.has(sourceId)) {
    errors.push(`Observation references missing sourceId "${sourceId}".`);
  }

  const externalReference = readSafeString(raw, 'externalReference', MAX_STRING_SHORT, errors);
  const permittedExcerptOrSummary = readSafeString(raw, 'permittedExcerptOrSummary', MAX_STRING_LONG, errors);
  const provenance = readSafeString(raw, 'provenance', MAX_STRING_SHORT, errors);
  const retentionPolicy = readSafeString(raw, 'retentionPolicy', MAX_STRING_SHORT, errors);

  let permittedSourceUrl: string | null = null;
  if (raw.permittedSourceUrl !== null) {
    const sanitized = sanitizeExternalUrl(
      typeof raw.permittedSourceUrl === 'string' ? raw.permittedSourceUrl : null
    );
    if (!sanitized) {
      errors.push('Field "permittedSourceUrl" must be null or a valid HTTPS URL.');
    } else {
      permittedSourceUrl = sanitized;
    }
  }

  const observationTimestamp = parseValidIsoTimestamp(raw.observationTimestamp);
  if (!observationTimestamp) {
    errors.push('Field "observationTimestamp" must be a valid timestamp.');
  }

  const publicationTimestamp =
    raw.publicationTimestamp === null ? null : parseValidIsoTimestamp(raw.publicationTimestamp);
  if (raw.publicationTimestamp !== null && publicationTimestamp === null) {
    errors.push('Field "publicationTimestamp" must be null or a valid timestamp.');
  }

  const contentFingerprint = readSafeString(raw, 'contentFingerprint', 128, errors);

  const verificationStatus = raw.verificationStatus;
  if (
    verificationStatus !== 'verified' &&
    verificationStatus !== 'illustrative_demo' &&
    verificationStatus !== 'unverified'
  ) {
    errors.push('Invalid "verificationStatus" on sourceObservation.');
  }

  const removalOrRestrictionStatus = raw.removalOrRestrictionStatus;
  if (
    removalOrRestrictionStatus !== 'active' &&
    removalOrRestrictionStatus !== 'restricted' &&
    removalOrRestrictionStatus !== 'removed'
  ) {
    errors.push('Invalid "removalOrRestrictionStatus" on sourceObservation.');
  } else if (removalOrRestrictionStatus !== 'active') {
    errors.push(`Observation "${observationId ?? 'unknown'}" is ${removalOrRestrictionStatus} and cannot be used.`);
  }

  if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) {
    errors.push('Field "schemaVersion" must be a positive integer.');
  }

  if (errors.length > 0) {
    return { ok: false, value: null, errors };
  }

  return {
    ok: true,
    value: {
      observationId: observationId!,
      sourceId: sourceId!,
      externalReference: externalReference!,
      permittedSourceUrl,
      permittedExcerptOrSummary: permittedExcerptOrSummary!,
      observationTimestamp: observationTimestamp!,
      publicationTimestamp,
      contentFingerprint: contentFingerprint!,
      verificationStatus: verificationStatus as SourceObservationDocument['verificationStatus'],
      provenance: provenance!,
      retentionPolicy: retentionPolicy!,
      removalOrRestrictionStatus: removalOrRestrictionStatus as SourceObservationDocument['removalOrRestrictionStatus'],
      schemaVersion: raw.schemaVersion as number,
    },
    errors: [],
  };
}

/**
 * Deduplicates evidence links by observationId AND contentFingerprint so
 * repeated ingestion of the same underlying observation never inflates counts.
 */
export function deduplicateEvidenceLinks(
  links: readonly EvidenceLinkDocument[],
  validObservationIds?: ReadonlySet<string>
): {
  readonly uniqueLinks: readonly EvidenceLinkDocument[];
  readonly duplicateCount: number;
  readonly invalidReferenceErrors: readonly string[];
} {
  const seenObservationIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  const uniqueLinks: EvidenceLinkDocument[] = [];
  const invalidReferenceErrors: string[] = [];
  let duplicateCount = 0;

  for (const link of links) {
    if (validObservationIds && !validObservationIds.has(link.observationId)) {
      invalidReferenceErrors.push(
        `Evidence link "${link.linkId}" references missing observation "${link.observationId}".`
      );
      continue;
    }

    if (
      seenObservationIds.has(link.observationId) ||
      seenFingerprints.has(link.contentFingerprint)
    ) {
      duplicateCount += 1;
      continue;
    }

    seenObservationIds.add(link.observationId);
    seenFingerprints.add(link.contentFingerprint);
    uniqueLinks.push(link);
  }

  return { uniqueLinks, duplicateCount, invalidReferenceErrors };
}

/**
 * Validates internal `researchInsights` documents, blocking AI-generated text
 * from being upgraded to a verified observation and checking supporting links.
 */
export function validateResearchInsightRecord(
  raw: unknown,
  verifiedObservationIds?: ReadonlySet<string>
): ValidationOutcome<ResearchInsightDocument> {
  const errors: string[] = [];
  if (!isPlainObject(raw)) {
    return { ok: false, value: null, errors: ['researchInsights document must be an object.'] };
  }

  const insightId = readSafeString(raw, 'insightId', 128, errors);
  const problemId = readSafeString(raw, 'problemId', 128, errors);
  const statement = readSafeString(raw, 'statement', MAX_STRING_LONG, errors);
  const createdAt = parseValidIsoTimestamp(raw.createdAt);
  if (!createdAt) errors.push('Field "createdAt" must be a valid timestamp.');

  const allowedCategories = [
    'verified_observation',
    'evidence_supported_interpretation',
    'hypothesis',
    'unknown_information',
  ];
  const insightCategory = raw.insightCategory;
  if (typeof insightCategory !== 'string' || !allowedCategories.includes(insightCategory)) {
    errors.push('Invalid "insightCategory".');
  }

  const verificationOrigin = raw.verificationOrigin;
  if (
    verificationOrigin !== 'human_verified' &&
    verificationOrigin !== 'ai_generated' &&
    verificationOrigin !== 'unknown'
  ) {
    errors.push('Invalid "verificationOrigin".');
  }

  if (
    verificationOrigin === 'ai_generated' &&
    insightCategory === 'verified_observation'
  ) {
    errors.push('AI-generated interpretations cannot be classified as verified_observation.');
  }

  const supportingObservationIds = readSafeStringArray(
    raw,
    'supportingObservationIds',
    { allowEmpty: true, maxItems: MAX_ARRAY_ITEMS, maxItemLength: 128 },
    errors
  );

  if (
    (insightCategory === 'verified_observation' ||
      insightCategory === 'evidence_supported_interpretation') &&
    (!supportingObservationIds || supportingObservationIds.length === 0)
  ) {
    errors.push(`Insight category "${insightCategory}" requires at least one supporting observation.`);
  }

  if (
    supportingObservationIds &&
    verifiedObservationIds &&
    (insightCategory === 'verified_observation' ||
      insightCategory === 'evidence_supported_interpretation')
  ) {
    for (const obsId of supportingObservationIds) {
      if (!verifiedObservationIds.has(obsId)) {
        errors.push(`Insight "${insightId ?? 'unknown'}" references unverified or missing observation "${obsId}".`);
      }
    }
  }

  if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) {
    errors.push('Field "schemaVersion" must be a positive integer.');
  }

  if (errors.length > 0) {
    return { ok: false, value: null, errors };
  }

  return {
    ok: true,
    value: {
      insightId: insightId!,
      problemId: problemId!,
      statement: statement!,
      insightCategory: insightCategory as ResearchInsightDocument['insightCategory'],
      supportingObservationIds: supportingObservationIds!,
      verificationOrigin: verificationOrigin as ResearchInsightDocument['verificationOrigin'],
      createdAt: createdAt!,
      schemaVersion: raw.schemaVersion as number,
    },
    errors: [],
  };
}

/**
 * Runtime validator for `problemClusters` documents.
 */
export function validateProblemClusterRecord(
  raw: unknown
): ValidationOutcome<ProblemClusterDocument> {
  const errors: string[] = [];
  if (!isPlainObject(raw)) {
    return { ok: false, value: null, errors: ['problemClusters document must be an object.'] };
  }

  const problemId = readSafeString(raw, 'problemId', 128, errors);
  const slug = readSafeString(raw, 'slug', 128, errors);
  const title = readSafeString(raw, 'title', MAX_STRING_SHORT, errors);
  const summary = readSafeString(raw, 'summary', MAX_STRING_LONG, errors);
  const recurrenceNote = readSafeString(raw, 'recurrenceNote', MAX_STRING_SHORT, errors);

  if (problemId && !isValidFirestoreDocId(problemId)) {
    errors.push('Field "problemId" must be a valid document ID.');
  }

  const rawCategories = readSafeStringArray(
    raw,
    'categories',
    { allowEmpty: false, maxItems: 5, maxItemLength: 40 },
    errors
  );
  if (rawCategories) {
    for (const cat of rawCategories) {
      if (!(SUPPORTED_PROBLEM_CATEGORIES as readonly string[]).includes(cat)) {
        errors.push(`Unsupported problem category "${cat}".`);
      }
    }
  }

  const affectedAudience = readSafeStringArray(
    raw,
    'affectedAudience',
    { allowEmpty: true, maxItems: 10, maxItemLength: MAX_STRING_SHORT },
    errors
  );
  const researchLimitations = readSafeStringArray(
    raw,
    'researchLimitations',
    { allowEmpty: false, maxItems: 15, maxItemLength: MAX_STRING_LONG },
    errors
  );

  const publicationStatus = raw.publicationStatus;
  if (
    publicationStatus !== 'draft' &&
    publicationStatus !== 'under_review' &&
    publicationStatus !== 'published' &&
    publicationStatus !== 'withdrawn'
  ) {
    errors.push('Invalid "publicationStatus".');
  } else if (publicationStatus === 'withdrawn') {
    errors.push('Withdrawn problem clusters cannot be surfaced to active views.');
  }

  const recurrenceStatus = raw.recurrenceStatus;
  if (
    recurrenceStatus !== 'unknown' &&
    recurrenceStatus !== 'emerging' &&
    recurrenceStatus !== 'recurring'
  ) {
    errors.push('Invalid "recurrenceStatus".');
  }

  const evidenceAvailability = raw.evidenceAvailability;
  if (
    evidenceAvailability !== 'none' &&
    evidenceAvailability !== 'illustrative_only' &&
    evidenceAvailability !== 'unverified_only' &&
    evidenceAvailability !== 'verified'
  ) {
    errors.push('Invalid "evidenceAvailability".');
  }

  if (publicationStatus === 'published' && evidenceAvailability !== 'verified') {
    errors.push('Only verified problem clusters can hold publicationStatus "published".');
  }

  const createdAt = parseValidIsoTimestamp(raw.createdAt);
  const updatedAt = parseValidIsoTimestamp(raw.updatedAt);
  if (!createdAt) errors.push('Field "createdAt" must be a valid timestamp.');
  if (!updatedAt) errors.push('Field "updatedAt" must be a valid timestamp.');

  if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) {
    errors.push('Field "schemaVersion" must be a positive integer.');
  }

  if (errors.length > 0) {
    return { ok: false, value: null, errors };
  }

  return {
    ok: true,
    value: {
      problemId: problemId!,
      slug: slug!,
      title: title!,
      summary: summary!,
      categories: rawCategories as readonly QuickExploreCategory[],
      affectedAudience: affectedAudience!,
      recurrenceStatus: recurrenceStatus as ProblemClusterDocument['recurrenceStatus'],
      recurrenceNote: recurrenceNote!,
      evidenceAvailability: evidenceAvailability as ProblemClusterDocument['evidenceAvailability'],
      researchLimitations: researchLimitations!,
      publicationStatus: publicationStatus as ProblemPublicationStatus,
      createdAt: createdAt!,
      updatedAt: updatedAt!,
      schemaVersion: raw.schemaVersion as number,
    },
    errors: [],
  };
}

/**
 * Runtime validator for `opportunityEvaluations` wrapping existing claim & scoring invariants.
 */
export function validateFirestoreEvaluationRecord(
  raw: unknown,
  problem: Problem
): ValidationOutcome<OpportunityEvaluation> {
  if (!isPlainObject(raw)) {
    return { ok: false, value: null, errors: ['opportunityEvaluations document must be an object.'] };
  }

  const candidate = raw as unknown as OpportunityEvaluation;
  if (
    candidate.scoreMethodologyVersion !== null &&
    !isApprovedScoringMethodology(candidate.scoreMethodologyVersion)
  ) {
    return {
      ok: false,
      value: null,
      errors: [`Unapproved scoreMethodologyVersion "${String(candidate.scoreMethodologyVersion)}".`],
    };
  }

  const integrity = validateEvaluationClaims(candidate, problem);
  if (!integrity.valid) {
    return { ok: false, value: null, errors: integrity.errors };
  }

  return { ok: true, value: candidate, errors: [] };
}

/**
 * Strict runtime validator for `demoProblems` documents fetched from Firestore.
 * Rejects malformed documents, unapproved IDs, non-zero verified counts, fabricated scores,
 * unknown-as-zero substitutions, and unsafe HTML/script strings.
 */
export function validateDemoProblemDocument(
  expectedDocId: string,
  raw: unknown
): ValidationOutcome<DemoProblemDocument> {
  const errors: string[] = [];

  if (!isValidFirestoreDocId(expectedDocId) || !isApprovedDemoProblemId(expectedDocId)) {
    return {
      ok: false,
      value: null,
      errors: [`Document ID "${expectedDocId}" is not an approved demonstration problem ID.`],
    };
  }

  if (!isPlainObject(raw)) {
    return {
      ok: false,
      value: null,
      errors: [`Malformed Firestore document for "${expectedDocId}": expected object.`],
    };
  }

  const id = readSafeString(raw, 'id', 128, errors);
  const slug = readSafeString(raw, 'slug', 128, errors);
  if (id && id !== expectedDocId) {
    errors.push(`Document field "id" (${id}) does not match Firestore document ID "${expectedDocId}".`);
  }
  if (slug && slug !== expectedDocId) {
    errors.push(`Document field "slug" (${slug}) does not match "${expectedDocId}".`);
  }

  const title = readSafeString(raw, 'title', MAX_STRING_SHORT, errors);
  const summary = readSafeString(raw, 'summary', MAX_STRING_LONG, errors);
  const categoryLabel = readSafeString(raw, 'categoryLabel', 120, errors);
  const recurrenceNote = readSafeString(raw, 'recurrenceNote', MAX_STRING_SHORT, errors);
  const coverageNote = readSafeString(raw, 'coverageNote', MAX_STRING_LONG, errors);

  const categories = readSafeStringArray(
    raw,
    'categories',
    { allowEmpty: false, maxItems: 5, maxItemLength: 40 },
    errors
  );
  if (categories) {
    for (const cat of categories) {
      if (!(SUPPORTED_PROBLEM_CATEGORIES as readonly string[]).includes(cat)) {
        errors.push(`Demo problem "${expectedDocId}" contains unsupported category "${cat}".`);
      }
    }
  }

  const tags = readSafeStringArray(
    raw,
    'tags',
    { allowEmpty: false, maxItems: 6, maxItemLength: 60 },
    errors
  );
  if (tags) {
    for (const tag of tags) {
      if (!(SUPPORTED_TRENDING_TOPICS as readonly string[]).includes(tag)) {
        errors.push(`Demo problem "${expectedDocId}" contains unsupported tag "${tag}".`);
      }
    }
  }

  const illustration = raw.illustration;
  if (
    typeof illustration !== 'string' ||
    !(SUPPORTED_ILLUSTRATION_KEYS as readonly string[]).includes(illustration)
  ) {
    errors.push(`Demo problem "${expectedDocId}" has invalid illustration key.`);
  }

  const affectedAudience = readSafeStringArray(
    raw,
    'affectedAudience',
    { allowEmpty: false, maxItems: 10, maxItemLength: MAX_STRING_SHORT },
    errors
  );
  const researchLimitations = readSafeStringArray(
    raw,
    'researchLimitations',
    { allowEmpty: false, maxItems: 10, maxItemLength: MAX_STRING_LONG },
    errors
  );
  const unknownsAndRisks = readSafeStringArray(
    raw,
    'unknownsAndRisks',
    { allowEmpty: false, maxItems: 15, maxItemLength: MAX_STRING_LONG },
    errors
  );

  // Strict demonstration integrity invariants
  if (raw.isIllustrativeDemo !== true) {
    errors.push(`Demo problem "${expectedDocId}" must set isIllustrativeDemo === true.`);
  }
  if (raw.evidenceAvailability !== 'none') {
    errors.push(`Demo problem "${expectedDocId}" must set evidenceAvailability === "none".`);
  }
  if (raw.verifiedEvidenceCount !== 0) {
    errors.push(`Demo problem "${expectedDocId}" must report verifiedEvidenceCount === 0.`);
  }
  if (raw.sourceCoverage !== null) {
    errors.push(`Demo problem "${expectedDocId}" must keep sourceCoverage === null (unknown, not zero).`);
  }
  if (raw.lastUpdated !== null) {
    errors.push(`Demo problem "${expectedDocId}" must keep lastUpdated === null.`);
  }
  if (raw.opportunityScore !== null) {
    errors.push(`Demo problem "${expectedDocId}" must keep opportunityScore === null.`);
  }
  if (!Array.isArray(raw.evidence) || raw.evidence.length !== 0) {
    errors.push(`Demo problem "${expectedDocId}" must have an empty evidence array.`);
  }
  if (!Array.isArray(raw.insights) || raw.insights.length !== 0) {
    errors.push(`Demo problem "${expectedDocId}" must have an empty insights array.`);
  }
  if (!Array.isArray(raw.existingAlternatives) || raw.existingAlternatives.length !== 0) {
    errors.push(`Demo problem "${expectedDocId}" must have an empty existingAlternatives array.`);
  }
  if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) {
    errors.push(`Demo problem "${expectedDocId}" must have a positive integer schemaVersion.`);
  }

  if (errors.length > 0) {
    return { ok: false, value: null, errors };
  }

  const doc: DemoProblemDocument = {
    id: expectedDocId,
    slug: expectedDocId,
    title: title!,
    summary: summary!,
    categoryLabel: categoryLabel!,
    categories: categories as readonly QuickExploreCategory[],
    illustration: illustration as DemoProblemDocument['illustration'],
    tags: tags as readonly TrendingTopic[],
    affectedAudience: affectedAudience!,
    recurrenceNote: recurrenceNote!,
    isIllustrativeDemo: true,
    evidenceAvailability: 'none',
    verifiedEvidenceCount: 0,
    sourceCoverage: null,
    lastUpdated: null,
    coverageNote: coverageNote!,
    researchLimitations: researchLimitations!,
    unknownsAndRisks: unknownsAndRisks!,
    evidence: [],
    insights: [],
    existingAlternatives: [],
    opportunityScore: null,
    schemaVersion: raw.schemaVersion as number,
  };

  // Double-check against core Problem Explorer integrity validator
  const problem = toProblemDomainModel(doc);
  const integrity = validateEvidenceReferences(problem);
  if (!integrity.valid) {
    return { ok: false, value: null, errors: integrity.errors };
  }

  return { ok: true, value: doc, errors: [] };
}

export function toProblemDomainModel(doc: DemoProblemDocument): Problem {
  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    summary: doc.summary,
    categories: [...doc.categories],
    affectedAudience: [...doc.affectedAudience],
    recurrenceNote: doc.recurrenceNote,
    isIllustrativeDemo: doc.isIllustrativeDemo,
    evidenceCoverage: {
      sourceCount: doc.sourceCoverage,
      verifiedCount: doc.verifiedEvidenceCount,
      illustrativeCount: 0,
      lastUpdated: doc.lastUpdated,
      coverageNote: doc.coverageNote,
    },
    evidence: [],
    insights: [],
    existingAlternatives: [],
    unknownsAndRisks: [...doc.unknownsAndRisks],
  };
}

export function toOpportunityCardItem(
  doc: DemoProblemDocument
): OpportunityCardItem {
  return {
    id: doc.id,
    categoryLabel: doc.categoryLabel,
    categories: [...doc.categories],
    title: doc.title,
    description: doc.summary,
    illustration: doc.illustration,
    evidenceVolume: 'Not available',
    opportunityScore: 'Not available',
    isIllustrative: true,
    tags: [...doc.tags],
  };
}

export function adaptValidatedDemoProblem(
  doc: DemoProblemDocument
): ValidatedProblemAdapter {
  return {
    problem: toProblemDomainModel(doc),
    opportunity: toOpportunityCardItem(doc),
    illustration: doc.illustration,
  };
}

const ALLOWED_SAVED_SOURCE_SCREENS: readonly SavedOpportunitySourceScreen[] = [
  'opportunity-radar',
  'problem-explorer',
  'problem-investigation',
  'opportunity-evaluation',
  'guest-migration',
];

const DISALLOWED_USER_PROFILE_PII_FIELDS = new Set([
  'email',
  'phone',
  'phoneNumber',
  'photoURL',
  'address',
  'role',
  'isAdmin',
]);

export function sanitizeUserDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  const bounded = trimmed.slice(0, 120);
  if (containsUnsafeHtmlOrScript(bounded)) {
    return null;
  }
  return bounded;
}

/**
 * Runtime validator for `users/{uid}` documents.
 * Rejects unnecessary PII fields, unconfirmed 18+ eligibility, or missing consent timestamps/versions.
 */
export function validateUserProfileDocument(
  expectedUid: string,
  raw: unknown
): ValidationOutcome<UserProfileDocument> {
  const errors: string[] = [];

  if (!isValidFirestoreDocId(expectedUid)) {
    return {
      ok: false,
      value: null,
      errors: [`User ID "${expectedUid}" is not a valid Firestore document ID.`],
    };
  }

  if (!isPlainObject(raw)) {
    return {
      ok: false,
      value: null,
      errors: ['User profile document must be a plain object.'],
    };
  }

  for (const key of Object.keys(raw)) {
    if (DISALLOWED_USER_PROFILE_PII_FIELDS.has(key)) {
      errors.push(`User profile contains disallowed field "${key}".`);
    }
  }

  const uid = readSafeString(raw, 'uid', 128, errors);
  if (uid && uid !== expectedUid) {
    errors.push(`User profile field "uid" (${uid}) does not match expected UID "${expectedUid}".`);
  }

  let displayName: string | null = null;
  if (raw.displayName !== null && raw.displayName !== undefined) {
    if (typeof raw.displayName !== 'string') {
      errors.push('Field "displayName" must be a string or null.');
    } else {
      const trimmed = raw.displayName.trim();
      if (trimmed.length > 120) {
        errors.push('Field "displayName" exceeds maximum length of 120.');
      } else if (trimmed.length > 0 && containsUnsafeHtmlOrScript(trimmed)) {
        errors.push('Field "displayName" contains disallowed HTML or script content.');
      } else {
        displayName = trimmed.length > 0 ? trimmed : null;
      }
    }
  }

  const eligibilityRaw = raw.eligibility;
  let declaredAt: string | null = null;
  if (!isPlainObject(eligibilityRaw)) {
    errors.push('Field "eligibility" must be an object.');
  } else {
    if (eligibilityRaw.isEighteenOrOlderDeclared !== true) {
      errors.push('Field "eligibility.isEighteenOrOlderDeclared" must be true.');
    }
    if (eligibilityRaw.ageVerificationStatus !== 'self_declared_unverified') {
      errors.push(
        'Field "eligibility.ageVerificationStatus" must be "self_declared_unverified".'
      );
    }
    declaredAt = parseValidIsoTimestamp(eligibilityRaw.declaredAt);
    if (!declaredAt) {
      errors.push('Field "eligibility.declaredAt" must be a valid timestamp.');
    }
  }

  const consentsRaw = raw.consents;
  let termsVersion: string | null = null;
  let termsAcceptedAt: string | null = null;
  let privacyPolicyVersion: string | null = null;
  let privacyAcceptedAt: string | null = null;

  if (!isPlainObject(consentsRaw)) {
    errors.push('Field "consents" must be an object.');
  } else {
    if (consentsRaw.termsAccepted !== true) {
      errors.push('Field "consents.termsAccepted" must be true.');
    }
    termsVersion = readSafeString(consentsRaw, 'termsVersion', 64, errors);
    termsAcceptedAt = parseValidIsoTimestamp(consentsRaw.termsAcceptedAt);
    if (!termsAcceptedAt) {
      errors.push('Field "consents.termsAcceptedAt" must be a valid timestamp.');
    }

    if (consentsRaw.privacyPolicyAccepted !== true) {
      errors.push('Field "consents.privacyPolicyAccepted" must be true.');
    }
    privacyPolicyVersion = readSafeString(
      consentsRaw,
      'privacyPolicyVersion',
      64,
      errors
    );
    privacyAcceptedAt = parseValidIsoTimestamp(consentsRaw.privacyAcceptedAt);
    if (!privacyAcceptedAt) {
      errors.push('Field "consents.privacyAcceptedAt" must be a valid timestamp.');
    }
  }

  const createdAt = parseValidIsoTimestamp(raw.createdAt);
  const updatedAt = parseValidIsoTimestamp(raw.updatedAt);
  if (!createdAt) errors.push('Field "createdAt" must be a valid timestamp.');
  if (!updatedAt) errors.push('Field "updatedAt" must be a valid timestamp.');

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
      uid: uid!,
      displayName,
      eligibility: {
        isEighteenOrOlderDeclared: true,
        ageVerificationStatus: 'self_declared_unverified',
        declaredAt: declaredAt!,
      },
      consents: {
        termsAccepted: true,
        termsVersion: termsVersion!,
        termsAcceptedAt: termsAcceptedAt!,
        privacyPolicyAccepted: true,
        privacyPolicyVersion: privacyPolicyVersion!,
        privacyAcceptedAt: privacyAcceptedAt!,
      },
      createdAt: createdAt!,
      updatedAt: updatedAt!,
      schemaVersion: raw.schemaVersion as number,
    },
    errors: [],
  };
}

/**
 * Runtime validator for `users/{uid}/savedOpportunities/{problemId}` documents.
 */
export function validateSavedOpportunityDocument(
  expectedProblemId: string,
  raw: unknown
): ValidationOutcome<SavedOpportunityDocument> {
  const errors: string[] = [];

  if (!isValidFirestoreDocId(expectedProblemId) || !isApprovedDemoProblemId(expectedProblemId)) {
    return {
      ok: false,
      value: null,
      errors: [`Saved problemId "${expectedProblemId}" is not an approved problem ID.`],
    };
  }

  if (!isPlainObject(raw)) {
    return {
      ok: false,
      value: null,
      errors: ['Saved opportunity document must be a plain object.'],
    };
  }

  const problemId = readSafeString(raw, 'problemId', 128, errors);
  if (problemId && problemId !== expectedProblemId) {
    errors.push(
      `Saved document field "problemId" (${problemId}) does not match document ID "${expectedProblemId}".`
    );
  }

  const savedAt = parseValidIsoTimestamp(raw.savedAt);
  if (!savedAt) {
    errors.push('Field "savedAt" must be a valid timestamp.');
  }

  const sourceScreen = raw.sourceScreen;
  if (
    typeof sourceScreen !== 'string' ||
    !(ALLOWED_SAVED_SOURCE_SCREENS as readonly string[]).includes(sourceScreen)
  ) {
    errors.push('Invalid "sourceScreen" on saved opportunity document.');
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
      problemId: expectedProblemId,
      savedAt: savedAt!,
      sourceScreen: sourceScreen as SavedOpportunitySourceScreen,
      schemaVersion: raw.schemaVersion as number,
    },
    errors: [],
  };
}
