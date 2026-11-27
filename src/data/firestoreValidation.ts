import type {
  OpportunityCardItem,
  OpportunityIllustrationKey,
  QuickExploreCategory,
  TrendingTopic,
} from '../config/opportunityRadar';
import {
  sanitizeExternalUrl,
  validateEvidenceReferences,
  type EvidenceRecord,
  type EvidenceSourceType,
  type ExistingAlternative,
  type Problem,
  type ProblemInsight,
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
  type ClusterEvidenceSummary,
  type CommercialRelevanceAssessment,
  type CommercialRelevanceDimensionAssessment,
  type CommercialRelevanceDimensionKey,
  type CommercialRelevanceStatus,
  type DataSourceDocument,
  type DemoProblemDocument,
  type EvidenceLinkDocument,
  type ProblemClusterDocument,
  type ProblemPublicationStatus,
  type PublicCommercialRelevanceAssessment,
  type PublishedProblemDocument,
  type ResearchInsightDocument,
  type ResearchOriginKind,
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

const TRACKING_QUERY_PARAMS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'igshid',
]);

export function canonicalizeUrl(rawUrl: string | null | undefined): string | null {
  const safe = sanitizeExternalUrl(rawUrl);
  if (!safe) return null;
  try {
    const parsed = new URL(safe);
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.port === '443') {
      parsed.port = '';
    }
    parsed.hash = '';
    const keptParams: [string, string][] = [];
    for (const [k, v] of parsed.searchParams.entries()) {
      const lower = k.toLowerCase();
      if (lower.startsWith('utm_') || TRACKING_QUERY_PARAMS.has(lower)) {
        continue;
      }
      keptParams.push([k, v]);
    }
    keptParams.sort(([a], [b]) => a.localeCompare(b));
    parsed.search = '';
    for (const [k, v] of keptParams) {
      parsed.searchParams.append(k, v);
    }
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeTextForFingerprint(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
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

function readOptionalResearchOriginFields(
  raw: Record<string, unknown>,
  errors: string[]
): {
  readonly isSyntheticTestFixture?: boolean;
  readonly researchOrigin?: ResearchOriginKind;
} {
  let isSyntheticTestFixture: boolean | undefined;
  if (raw.isSyntheticTestFixture !== undefined) {
    if (typeof raw.isSyntheticTestFixture !== 'boolean') {
      errors.push('Field "isSyntheticTestFixture" must be a boolean.');
    } else {
      isSyntheticTestFixture = raw.isSyntheticTestFixture;
    }
  }

  let researchOrigin: ResearchOriginKind | undefined;
  if (raw.researchOrigin !== undefined) {
    if (
      raw.researchOrigin !== 'genuine_research' &&
      raw.researchOrigin !== 'synthetic_test_fixture'
    ) {
      errors.push('Invalid "researchOrigin".');
    } else {
      researchOrigin = raw.researchOrigin;
    }
  }

  if (
    isSyntheticTestFixture !== undefined &&
    researchOrigin !== undefined &&
    ((isSyntheticTestFixture && researchOrigin !== 'synthetic_test_fixture') ||
      (!isSyntheticTestFixture && researchOrigin !== 'genuine_research'))
  ) {
    errors.push(
      'Conflicting "isSyntheticTestFixture" and "researchOrigin" metadata.'
    );
  }

  return {
    ...(isSyntheticTestFixture !== undefined ? { isSyntheticTestFixture } : {}),
    ...(researchOrigin !== undefined ? { researchOrigin } : {}),
  };
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

  const allowedMechanisms = [
    'official_api',
    'public_feed',
    'manual_field_notes',
    'dataset_license',
    'customer_interview',
    'community_submission',
  ];
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

  const originMeta = readOptionalResearchOriginFields(raw, errors);

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
      ...originMeta,
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

  const allowedSourceTypes: readonly EvidenceSourceType[] = [
    'forum_thread',
    'support_ticket',
    'interview_note',
    'review_excerpt',
    'field_observation',
    'research_publication',
    'government_dataset',
    'news_article',
    'community_submission',
    'dataset_demo',
  ];

  const readOptionalSafeString = (
    field: string,
    maxLength: number
  ): string | null | undefined => {
    const val = raw[field];
    if (val === undefined) return undefined;
    if (val === null) return null;
    if (typeof val !== 'string') {
      errors.push(`Field "${field}" must be a string or null.`);
      return null;
    }
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (trimmed.length > maxLength) {
      errors.push(`Field "${field}" exceeds maximum length of ${maxLength}.`);
      return null;
    }
    if (containsUnsafeHtmlOrScript(trimmed)) {
      errors.push(`Field "${field}" contains disallowed HTML or script content.`);
      return null;
    }
    return trimmed;
  };

  let canonicalUrl: string | null | undefined = undefined;
  if (raw.canonicalUrl !== undefined) {
    if (raw.canonicalUrl === null) {
      canonicalUrl = null;
    } else {
      const sanitizedCanonical = canonicalizeUrl(
        typeof raw.canonicalUrl === 'string' ? raw.canonicalUrl : null
      );
      if (!sanitizedCanonical) {
        errors.push('Field "canonicalUrl" must be null or a valid HTTPS URL.');
      } else {
        canonicalUrl = sanitizedCanonical;
      }
    }
  }

  const problemStatement = readOptionalSafeString('problemStatement', MAX_STRING_LONG);
  const context = readOptionalSafeString('context', MAX_STRING_LONG);
  const affectedCustomerSegment = readOptionalSafeString('affectedCustomerSegment', MAX_STRING_SHORT);
  const reportedConsequences = readOptionalSafeString('reportedConsequences', MAX_STRING_LONG);
  const existingWorkaround = readOptionalSafeString('existingWorkaround', MAX_STRING_LONG);
  const spendingOrWtpSignal = readOptionalSafeString('spendingOrWtpSignal', MAX_STRING_SHORT);
  const geography = readOptionalSafeString('geography', 120);
  const sourceName = readOptionalSafeString('sourceName', MAX_STRING_SHORT);
  const independentGroupKey = readOptionalSafeString('independentGroupKey', 160);
  const extractionModel = readOptionalSafeString('extractionModel', 120);

  let sourceType: EvidenceSourceType | undefined;
  if (raw.sourceType !== undefined) {
    if (
      typeof raw.sourceType !== 'string' ||
      !allowedSourceTypes.includes(raw.sourceType as EvidenceSourceType)
    ) {
      errors.push('Invalid "sourceType" on sourceObservation.');
    } else {
      sourceType = raw.sourceType as EvidenceSourceType;
    }
  }

  let extractedByAi: boolean | undefined;
  if (raw.extractedByAi !== undefined) {
    if (typeof raw.extractedByAi !== 'boolean') {
      errors.push('Field "extractedByAi" must be a boolean.');
    } else {
      extractedByAi = raw.extractedByAi;
    }
  }

  if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) {
    errors.push('Field "schemaVersion" must be a positive integer.');
  }

  const originMeta = readOptionalResearchOriginFields(raw, errors);

  if (errors.length > 0) {
    return { ok: false, value: null, errors };
  }

  const normalized: SourceObservationDocument = {
    observationId: observationId!,
    sourceId: sourceId!,
    externalReference: externalReference!,
    permittedSourceUrl,
    ...(canonicalUrl !== undefined ? { canonicalUrl } : {}),
    permittedExcerptOrSummary: permittedExcerptOrSummary!,
    ...(problemStatement !== undefined ? { problemStatement } : {}),
    ...(context !== undefined ? { context } : {}),
    ...(affectedCustomerSegment !== undefined ? { affectedCustomerSegment } : {}),
    ...(reportedConsequences !== undefined ? { reportedConsequences } : {}),
    ...(existingWorkaround !== undefined ? { existingWorkaround } : {}),
    ...(spendingOrWtpSignal !== undefined ? { spendingOrWtpSignal } : {}),
    ...(geography !== undefined ? { geography } : {}),
    ...(sourceType !== undefined ? { sourceType } : {}),
    ...(sourceName !== undefined ? { sourceName } : {}),
    ...(independentGroupKey !== undefined ? { independentGroupKey } : {}),
    observationTimestamp: observationTimestamp!,
    publicationTimestamp,
    contentFingerprint: contentFingerprint!,
    verificationStatus: verificationStatus as SourceObservationDocument['verificationStatus'],
    provenance: provenance!,
    retentionPolicy: retentionPolicy!,
    removalOrRestrictionStatus: removalOrRestrictionStatus as SourceObservationDocument['removalOrRestrictionStatus'],
    ...(extractedByAi !== undefined ? { extractedByAi } : {}),
    ...(extractionModel !== undefined ? { extractionModel } : {}),
    ...originMeta,
    schemaVersion: raw.schemaVersion as number,
  };

  return {
    ok: true,
    value: normalized,
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

const ALLOWED_RELEVANCE_STATUSES: readonly CommercialRelevanceStatus[] = [
  'supported',
  'partially_supported',
  'insufficient_evidence',
  'contradicted',
];

const ALLOWED_RELEVANCE_KEYS: readonly CommercialRelevanceDimensionKey[] = [
  'severity',
  'recurrence',
  'customer_clarity',
  'existing_alternatives',
  'economic_signals',
  'addressability',
  'evidence_strength',
];

function validateCommercialRelevanceDimensions(
  rawDimensions: unknown,
  errors: string[]
): CommercialRelevanceDimensionAssessment[] {
  const dimensions: CommercialRelevanceDimensionAssessment[] = [];
  if (!Array.isArray(rawDimensions) || rawDimensions.length === 0 || rawDimensions.length > 7) {
    errors.push('commercialRelevance.dimensions must contain 1 to 7 dimension assessments.');
    return dimensions;
  }

  const seenKeys = new Set<string>();
  for (let i = 0; i < rawDimensions.length; i += 1) {
    const dim = rawDimensions[i];
    if (!isPlainObject(dim)) {
      errors.push(`commercialRelevance.dimensions[${i}] must be an object.`);
      continue;
    }
    if ('score' in dim && dim.score !== null) {
      errors.push(`commercialRelevance.dimensions[${i}] must not assign a numerical score.`);
    }
    const key = dim.key;
    if (
      typeof key !== 'string' ||
      !ALLOWED_RELEVANCE_KEYS.includes(key as CommercialRelevanceDimensionKey)
    ) {
      errors.push(`Invalid commercialRelevance dimension key "${String(key)}".`);
    } else if (seenKeys.has(key)) {
      errors.push(`Duplicate commercialRelevance dimension key "${key}".`);
    } else {
      seenKeys.add(key);
    }

    const status = dim.status;
    if (
      typeof status !== 'string' ||
      !ALLOWED_RELEVANCE_STATUSES.includes(status as CommercialRelevanceStatus)
    ) {
      errors.push(`Invalid commercialRelevance dimension status "${String(status)}".`);
    }

    const label = readSafeString(dim, 'label', 120, errors);
    const summary = readSafeString(dim, 'summary', MAX_STRING_LONG, errors);
    const supportingObservationIds = readSafeStringArray(
      dim,
      'supportingObservationIds',
      { allowEmpty: true, maxItems: 50, maxItemLength: 128 },
      errors
    );

    let unresolvedQuestion: string | null = null;
    if (dim.unresolvedQuestion !== null && dim.unresolvedQuestion !== undefined) {
      unresolvedQuestion = readSafeString(dim, 'unresolvedQuestion', MAX_STRING_SHORT, errors);
    }

    if (errors.length === 0) {
      dimensions.push({
        key: key as CommercialRelevanceDimensionKey,
        label: label!,
        status: status as CommercialRelevanceStatus,
        summary: summary!,
        supportingObservationIds: supportingObservationIds!,
        unresolvedQuestion,
      });
    }
  }
  return dimensions;
}

export function validatePublicCommercialRelevanceAssessment(
  raw: unknown
): ValidationOutcome<PublicCommercialRelevanceAssessment> {
  const errors: string[] = [];
  if (!isPlainObject(raw)) {
    return { ok: false, value: null, errors: ['commercialRelevance must be an object.'] };
  }
  if ('overallScore' in raw || 'score' in raw || 'numericScore' in raw) {
    errors.push('Qualitative commercialRelevance must not contain numerical score fields.');
  }
  for (const forbiddenInternal of [
    'assessedBy',
    'founderDecisionNote',
    'reviewNotes',
    'reviewedBy',
    'approvedBy',
    'founderExceptionReason',
    'founderExceptionNote',
  ]) {
    if (forbiddenInternal in raw && raw[forbiddenInternal] !== undefined) {
      errors.push(
        `Public commercialRelevance must not expose internal field "${forbiddenInternal}".`
      );
    }
  }

  const assessedAt = parseValidIsoTimestamp(raw.assessedAt);
  if (!assessedAt) errors.push('commercialRelevance.assessedAt must be a valid timestamp.');

  const overallSummary = readSafeString(raw, 'overallSummary', MAX_STRING_LONG, errors);
  const dimensions = validateCommercialRelevanceDimensions(raw.dimensions, errors);

  if (errors.length > 0) {
    return { ok: false, value: null, errors };
  }

  return {
    ok: true,
    value: {
      assessedAt: assessedAt!,
      overallSummary: overallSummary!,
      dimensions,
    },
    errors: [],
  };
}

export function validateCommercialRelevanceAssessment(
  raw: unknown
): ValidationOutcome<CommercialRelevanceAssessment> {
  const errors: string[] = [];
  if (!isPlainObject(raw)) {
    return { ok: false, value: null, errors: ['commercialRelevance must be an object.'] };
  }
  if ('overallScore' in raw || 'score' in raw || 'numericScore' in raw) {
    errors.push('Qualitative commercialRelevance must not contain numerical score fields.');
  }

  const assessedAt = parseValidIsoTimestamp(raw.assessedAt);
  if (!assessedAt) errors.push('commercialRelevance.assessedAt must be a valid timestamp.');

  const assessedBy = readSafeString(raw, 'assessedBy', 120, errors);
  const overallSummary = readSafeString(raw, 'overallSummary', MAX_STRING_LONG, errors);

  let founderDecisionNote: string | null = null;
  if (raw.founderDecisionNote !== null && raw.founderDecisionNote !== undefined) {
    founderDecisionNote = readSafeString(raw, 'founderDecisionNote', MAX_STRING_LONG, errors);
  }

  const dimensions = validateCommercialRelevanceDimensions(raw.dimensions, errors);

  if (errors.length > 0) {
    return { ok: false, value: null, errors };
  }

  return {
    ok: true,
    value: {
      assessedAt: assessedAt!,
      assessedBy: assessedBy!,
      overallSummary: overallSummary!,
      founderDecisionNote,
      dimensions,
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
    publicationStatus !== 'approved' &&
    publicationStatus !== 'published' &&
    publicationStatus !== 'rejected' &&
    publicationStatus !== 'withdrawn' &&
    publicationStatus !== 'archived'
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

  let commercialRelevance: CommercialRelevanceAssessment | null | undefined = undefined;
  if (raw.commercialRelevance !== undefined) {
    if (raw.commercialRelevance === null) {
      commercialRelevance = null;
    } else {
      const crValidation = validateCommercialRelevanceAssessment(raw.commercialRelevance);
      if (!crValidation.ok || !crValidation.value) {
        errors.push(...crValidation.errors);
      } else {
        commercialRelevance = crValidation.value;
      }
    }
  }

  const createdAt = parseValidIsoTimestamp(raw.createdAt);
  const updatedAt = parseValidIsoTimestamp(raw.updatedAt);
  if (!createdAt) errors.push('Field "createdAt" must be a valid timestamp.');
  if (!updatedAt) errors.push('Field "updatedAt" must be a valid timestamp.');

  if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) {
    errors.push('Field "schemaVersion" must be a positive integer.');
  }

  const readOptClusterStr = (field: string, maxLen: number): string | null | undefined => {
    const val = raw[field];
    if (val === undefined) return undefined;
    if (val === null) return null;
    return readSafeString(raw, field, maxLen, errors);
  };

  const readOptClusterIso = (field: string): string | null | undefined => {
    const val = raw[field];
    if (val === undefined) return undefined;
    if (val === null) return null;
    const parsed = parseValidIsoTimestamp(val);
    if (!parsed) {
      errors.push(`Field "${field}" must be null or a valid ISO timestamp.`);
      return null;
    }
    return parsed;
  };

  const underlyingNeed = readOptClusterStr('underlyingNeed', MAX_STRING_LONG);
  const context = readOptClusterStr('context', MAX_STRING_LONG);
  const reviewedBy = readOptClusterStr('reviewedBy', 120);
  const reviewedAt = readOptClusterIso('reviewedAt');
  const reviewNotes = readOptClusterStr('reviewNotes', MAX_STRING_LONG);
  const approvedBy = readOptClusterStr('approvedBy', 120);
  const approvedAt = readOptClusterIso('approvedAt');
  const publishedAt = readOptClusterIso('publishedAt');
  const founderExceptionReason = readOptClusterStr('founderExceptionReason', MAX_STRING_LONG);
  const archivedAt = readOptClusterIso('archivedAt');
  const archiveReason = readOptClusterStr('archiveReason', MAX_STRING_LONG);

  const reportedConsequences =
    raw.reportedConsequences !== undefined
      ? readSafeStringArray(raw, 'reportedConsequences', { allowEmpty: true, maxItems: 20, maxItemLength: MAX_STRING_SHORT }, errors)
      : undefined;
  const existingWorkarounds =
    raw.existingWorkarounds !== undefined
      ? readSafeStringArray(raw, 'existingWorkarounds', { allowEmpty: true, maxItems: 20, maxItemLength: MAX_STRING_SHORT }, errors)
      : undefined;
  const unresolvedQuestions =
    raw.unresolvedQuestions !== undefined
      ? readSafeStringArray(raw, 'unresolvedQuestions', { allowEmpty: true, maxItems: 20, maxItemLength: MAX_STRING_LONG }, errors)
      : undefined;

  let existingAlternatives: readonly ExistingAlternative[] | undefined = undefined;
  if (raw.existingAlternatives !== undefined) {
    if (!Array.isArray(raw.existingAlternatives)) {
      errors.push('Field "existingAlternatives" must be an array.');
    } else {
      const alts: ExistingAlternative[] = [];
      for (let i = 0; i < raw.existingAlternatives.length; i += 1) {
        const entry = raw.existingAlternatives[i];
        if (!isPlainObject(entry)) {
          errors.push(`existingAlternatives[${i}] must be an object.`);
          continue;
        }
        const id = readSafeString(entry, 'id', 128, errors);
        const name = readSafeString(entry, 'name', MAX_STRING_SHORT, errors);
        const category = readSafeString(entry, 'category', 120, errors);
        const observedShortcoming = readSafeString(entry, 'observedShortcoming', MAX_STRING_LONG, errors);
        const supportingEvidenceIds = readSafeStringArray(
          entry,
          'supportingEvidenceIds',
          { allowEmpty: true, maxItems: 25, maxItemLength: 128 },
          errors
        );
        if (id && name && category && observedShortcoming && supportingEvidenceIds) {
          alts.push({ id, name, category, observedShortcoming, supportingEvidenceIds });
        }
      }
      existingAlternatives = alts;
    }
  }

  let evidenceSummary: ClusterEvidenceSummary | null | undefined = undefined;
  if (raw.evidenceSummary !== undefined) {
    if (raw.evidenceSummary === null) {
      evidenceSummary = null;
    } else if (!isPlainObject(raw.evidenceSummary)) {
      errors.push('Field "evidenceSummary" must be an object or null.');
    } else {
      evidenceSummary = raw.evidenceSummary as unknown as ClusterEvidenceSummary;
    }
  }

  const originMeta = readOptionalResearchOriginFields(raw, errors);

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
      ...(underlyingNeed ? { underlyingNeed } : {}),
      ...(context !== undefined ? { context } : {}),
      categories: rawCategories as readonly QuickExploreCategory[],
      affectedAudience: affectedAudience!,
      ...(reportedConsequences ? { reportedConsequences } : {}),
      ...(existingWorkarounds ? { existingWorkarounds } : {}),
      ...(existingAlternatives ? { existingAlternatives } : {}),
      recurrenceStatus: recurrenceStatus as ProblemClusterDocument['recurrenceStatus'],
      recurrenceNote: recurrenceNote!,
      evidenceAvailability: evidenceAvailability as ProblemClusterDocument['evidenceAvailability'],
      researchLimitations: researchLimitations!,
      ...(unresolvedQuestions ? { unresolvedQuestions } : {}),
      ...(evidenceSummary !== undefined ? { evidenceSummary } : {}),
      ...(commercialRelevance !== undefined ? { commercialRelevance } : {}),
      publicationStatus: publicationStatus as ProblemPublicationStatus,
      ...(reviewedBy !== undefined ? { reviewedBy } : {}),
      ...(reviewedAt !== undefined ? { reviewedAt } : {}),
      ...(reviewNotes !== undefined ? { reviewNotes } : {}),
      ...(approvedBy !== undefined ? { approvedBy } : {}),
      ...(approvedAt !== undefined ? { approvedAt } : {}),
      ...(publishedAt !== undefined ? { publishedAt } : {}),
      ...(founderExceptionReason !== undefined ? { founderExceptionReason } : {}),
      ...originMeta,
      ...(archivedAt !== undefined ? { archivedAt } : {}),
      ...(archiveReason !== undefined ? { archiveReason } : {}),
      createdAt: createdAt!,
      updatedAt: updatedAt!,
      schemaVersion: raw.schemaVersion as number,
    },
    errors: [],
  };
}

const ALLOWED_SOURCE_TYPES: readonly EvidenceSourceType[] = [
  'forum_thread',
  'support_ticket',
  'interview_note',
  'review_excerpt',
  'field_observation',
  'research_publication',
  'government_dataset',
  'news_article',
  'community_submission',
  'dataset_demo',
];

/**
 * Runtime validator for public `publishedProblems` documents fetched from Firestore.
 * Enforces non-demo status, verified evidence integrity, qualitative relevance only,
 * and absence of internal review fields or numeric opportunity scores.
 */
export function validatePublishedProblemDocument(
  expectedDocId: string,
  raw: unknown
): ValidationOutcome<PublishedProblemDocument> {
  const errors: string[] = [];

  if (!isValidFirestoreDocId(expectedDocId)) {
    return {
      ok: false,
      value: null,
      errors: [`Document ID "${expectedDocId}" is not a valid Firestore document ID.`],
    };
  }

  if (!isPlainObject(raw)) {
    return {
      ok: false,
      value: null,
      errors: [`Malformed Firestore document for "${expectedDocId}": expected object.`],
    };
  }

  // Strip-check internal fields that must never leak to public collection
  for (const forbiddenField of [
    'reviewNotes',
    'reviewedBy',
    'reviewedAt',
    'approvedBy',
    'approvedAt',
    'internalComments',
    'founderExceptionReason',
    'founderExceptionNote',
    'founderDecisionNote',
    'assessedBy',
  ]) {
    if (forbiddenField in raw && raw[forbiddenField] !== undefined) {
      errors.push(`Published problem "${expectedDocId}" contains internal editorial field "${forbiddenField}".`);
    }
  }

  if (raw.isSyntheticTestFixture === true || raw.researchOrigin === 'synthetic_test_fixture') {
    errors.push(
      `Published problem "${expectedDocId}" cannot carry synthetic test fixture origin metadata.`
    );
  }

  if ('opportunityScore' in raw && raw.opportunityScore !== null) {
    errors.push(`Published problem "${expectedDocId}" must not include a numeric opportunityScore.`);
  }

  const id = readSafeString(raw, 'id', 128, errors);
  const slug = readSafeString(raw, 'slug', 128, errors);
  if (id && id !== expectedDocId) {
    errors.push(`Published field "id" (${id}) does not match document ID "${expectedDocId}".`);
  }
  if (slug && slug !== expectedDocId) {
    errors.push(`Published field "slug" (${slug}) does not match document ID "${expectedDocId}".`);
  }

  const title = readSafeString(raw, 'title', MAX_STRING_SHORT, errors);
  const summary = readSafeString(raw, 'summary', MAX_STRING_LONG, errors);
  const recurrenceNote = readSafeString(raw, 'recurrenceNote', MAX_STRING_SHORT, errors);
  const coverageNote = readSafeString(raw, 'coverageNote', MAX_STRING_LONG, errors);
  const publishedAt = parseValidIsoTimestamp(raw.publishedAt);
  if (!publishedAt) {
    errors.push('Field "publishedAt" must be a valid ISO timestamp.');
  }

  if (raw.isIllustrativeDemo !== false) {
    errors.push(`Published problem "${expectedDocId}" must set isIllustrativeDemo === false.`);
  }
  if (raw.publicationStatus !== 'published') {
    errors.push(`Published problem "${expectedDocId}" must hold publicationStatus === "published".`);
  }

  if (
    typeof raw.verifiedEvidenceCount !== 'number' ||
    !Number.isInteger(raw.verifiedEvidenceCount) ||
    raw.verifiedEvidenceCount < 1
  ) {
    errors.push(`Published problem "${expectedDocId}" requires verifiedEvidenceCount >= 1.`);
  }

  let sourceCoverage: number | null = null;
  if (raw.sourceCoverage !== null && raw.sourceCoverage !== undefined) {
    if (typeof raw.sourceCoverage !== 'number' || !Number.isInteger(raw.sourceCoverage) || raw.sourceCoverage < 0) {
      errors.push('Field "sourceCoverage" must be null or a non-negative integer.');
    } else {
      sourceCoverage = raw.sourceCoverage;
    }
  }

  const lastUpdated =
    raw.lastUpdated === null || raw.lastUpdated === undefined
      ? null
      : parseValidIsoTimestamp(raw.lastUpdated);
  if (raw.lastUpdated !== null && raw.lastUpdated !== undefined && lastUpdated === null) {
    errors.push('Field "lastUpdated" must be null or a valid ISO timestamp.');
  }

  const categories = readSafeStringArray(
    raw,
    'categories',
    { allowEmpty: false, maxItems: 5, maxItemLength: 40 },
    errors
  );
  if (categories) {
    for (const cat of categories) {
      if (!(SUPPORTED_PROBLEM_CATEGORIES as readonly string[]).includes(cat)) {
        errors.push(`Published problem "${expectedDocId}" contains unsupported category "${cat}".`);
      }
    }
  }

  let tags: readonly TrendingTopic[] | undefined = undefined;
  if (raw.tags !== undefined) {
    const parsedTags = readSafeStringArray(
      raw,
      'tags',
      { allowEmpty: true, maxItems: 6, maxItemLength: 60 },
      errors
    );
    if (parsedTags) {
      for (const tag of parsedTags) {
        if (!(SUPPORTED_TRENDING_TOPICS as readonly string[]).includes(tag)) {
          errors.push(`Published problem "${expectedDocId}" contains unsupported tag "${tag}".`);
        }
      }
      tags = parsedTags as readonly TrendingTopic[];
    }
  }

  let illustration: OpportunityIllustrationKey | undefined = undefined;
  if (raw.illustration !== undefined) {
    if (
      typeof raw.illustration !== 'string' ||
      !(SUPPORTED_ILLUSTRATION_KEYS as readonly string[]).includes(raw.illustration)
    ) {
      errors.push(`Published problem "${expectedDocId}" has invalid illustration key.`);
    } else {
      illustration = raw.illustration as OpportunityIllustrationKey;
    }
  }

  let categoryLabel: string | undefined = undefined;
  if (raw.categoryLabel !== undefined) {
    categoryLabel = readSafeString(raw, 'categoryLabel', 120, errors) ?? undefined;
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
    { allowEmpty: false, maxItems: 15, maxItemLength: MAX_STRING_LONG },
    errors
  );
  const unknownsAndRisks = readSafeStringArray(
    raw,
    'unknownsAndRisks',
    { allowEmpty: false, maxItems: 15, maxItemLength: MAX_STRING_LONG },
    errors
  );

  // Parse and validate sanitized evidence records
  const evidence: EvidenceRecord[] = [];
  if (!Array.isArray(raw.evidence) || raw.evidence.length === 0) {
    errors.push(`Published problem "${expectedDocId}" must include sanitized verified evidence records.`);
  } else {
    for (let i = 0; i < raw.evidence.length; i += 1) {
      const ev = raw.evidence[i];
      if (!isPlainObject(ev)) {
        errors.push(`evidence[${i}] must be an object.`);
        continue;
      }
      const evId = readSafeString(ev, 'id', 128, errors);
      const evProblemId = readSafeString(ev, 'problemId', 128, errors);
      const sourceName = readSafeString(ev, 'sourceName', MAX_STRING_SHORT, errors);
      const excerpt = readSafeString(ev, 'excerpt', MAX_STRING_LONG, errors);
      const sourceType = ev.sourceType;
      if (
        typeof sourceType !== 'string' ||
        !ALLOWED_SOURCE_TYPES.includes(sourceType as EvidenceSourceType)
      ) {
        errors.push(`evidence[${i}].sourceType is invalid.`);
      }
      const verificationStatus = ev.verificationStatus;
      if (verificationStatus !== 'verified' && verificationStatus !== 'unverified') {
        errors.push(`evidence[${i}].verificationStatus must be "verified" or "unverified".`);
      }
      let externalUrl: string | null = null;
      if (ev.externalUrl !== null && ev.externalUrl !== undefined) {
        const sanitized = sanitizeExternalUrl(
          typeof ev.externalUrl === 'string' ? ev.externalUrl : null
        );
        if (!sanitized) {
          errors.push(`evidence[${i}].externalUrl must be null or a valid HTTPS URL.`);
        } else {
          externalUrl = sanitized;
        }
      }
      const observedDate =
        ev.observedDate === null || ev.observedDate === undefined
          ? null
          : parseValidIsoTimestamp(ev.observedDate);
      if (ev.observedDate !== null && ev.observedDate !== undefined && !observedDate) {
        errors.push(`evidence[${i}].observedDate must be null or a valid ISO date.`);
      }

      if (evId && evProblemId && sourceName && excerpt) {
        evidence.push({
          id: evId,
          problemId: evProblemId,
          sourceType: sourceType as EvidenceSourceType,
          sourceName,
          excerpt,
          observedDate,
          externalUrl,
          verificationStatus: verificationStatus as EvidenceRecord['verificationStatus'],
        });
      }
    }
  }

  // Parse insights
  const insights: ProblemInsight[] = [];
  if (!Array.isArray(raw.insights)) {
    errors.push('Field "insights" must be an array.');
  } else {
    for (let i = 0; i < raw.insights.length; i += 1) {
      const ins = raw.insights[i];
      if (!isPlainObject(ins)) {
        errors.push(`insights[${i}] must be an object.`);
        continue;
      }
      const insId = readSafeString(ins, 'id', 128, errors);
      const statement = readSafeString(ins, 'statement', MAX_STRING_LONG, errors);
      const kind = ins.kind;
      if (kind !== 'evidence_backed' && kind !== 'hypothesis') {
        errors.push(`insights[${i}].kind must be "evidence_backed" or "hypothesis".`);
      }
      const supportingEvidenceIds = readSafeStringArray(
        ins,
        'supportingEvidenceIds',
        { allowEmpty: true, maxItems: 25, maxItemLength: 128 },
        errors
      );
      if (insId && statement && supportingEvidenceIds) {
        insights.push({
          id: insId,
          statement,
          kind: kind as ProblemInsight['kind'],
          supportingEvidenceIds,
        });
      }
    }
  }

  // Parse existingAlternatives
  const existingAlternatives: ExistingAlternative[] = [];
  if (!Array.isArray(raw.existingAlternatives)) {
    errors.push('Field "existingAlternatives" must be an array.');
  } else {
    for (let i = 0; i < raw.existingAlternatives.length; i += 1) {
      const alt = raw.existingAlternatives[i];
      if (!isPlainObject(alt)) {
        errors.push(`existingAlternatives[${i}] must be an object.`);
        continue;
      }
      const altId = readSafeString(alt, 'id', 128, errors);
      const name = readSafeString(alt, 'name', MAX_STRING_SHORT, errors);
      const category = readSafeString(alt, 'category', 120, errors);
      const observedShortcoming = readSafeString(alt, 'observedShortcoming', MAX_STRING_LONG, errors);
      const supportingEvidenceIds = readSafeStringArray(
        alt,
        'supportingEvidenceIds',
        { allowEmpty: true, maxItems: 25, maxItemLength: 128 },
        errors
      );
      if (altId && name && category && observedShortcoming && supportingEvidenceIds) {
        existingAlternatives.push({
          id: altId,
          name,
          category,
          observedShortcoming,
          supportingEvidenceIds,
        });
      }
    }
  }

  let commercialRelevance: PublicCommercialRelevanceAssessment | null | undefined = undefined;
  if (raw.commercialRelevance !== undefined) {
    if (raw.commercialRelevance === null) {
      commercialRelevance = null;
    } else {
      const cr = validatePublicCommercialRelevanceAssessment(raw.commercialRelevance);
      if (!cr.ok || !cr.value) {
        errors.push(...cr.errors);
      } else {
        commercialRelevance = cr.value;
      }
    }
  }

  let publishedUnderFounderException: boolean | undefined = undefined;
  if (raw.publishedUnderFounderException !== undefined) {
    if (typeof raw.publishedUnderFounderException !== 'boolean') {
      errors.push('Field "publishedUnderFounderException" must be a boolean.');
    } else {
      publishedUnderFounderException = raw.publishedUnderFounderException;
    }
  }

  let researchOrigin: 'genuine_research' | undefined = undefined;
  if (raw.researchOrigin !== undefined) {
    if (raw.researchOrigin !== 'genuine_research') {
      errors.push('Published problem field "researchOrigin" may only be "genuine_research".');
    } else {
      researchOrigin = 'genuine_research';
    }
  }

  let independentEvidenceCount: number | undefined = undefined;
  if (raw.independentEvidenceCount !== undefined) {
    if (typeof raw.independentEvidenceCount !== 'number' || !Number.isInteger(raw.independentEvidenceCount) || raw.independentEvidenceCount < 1) {
      errors.push('Field "independentEvidenceCount" must be a positive integer.');
    } else {
      independentEvidenceCount = raw.independentEvidenceCount;
    }
  }

  let sourceDiversityCount: number | undefined = undefined;
  if (raw.sourceDiversityCount !== undefined) {
    if (typeof raw.sourceDiversityCount !== 'number' || !Number.isInteger(raw.sourceDiversityCount) || raw.sourceDiversityCount < 1) {
      errors.push('Field "sourceDiversityCount" must be a positive integer.');
    } else {
      sourceDiversityCount = raw.sourceDiversityCount;
    }
  }

  const geographicalCoverage =
    raw.geographicalCoverage !== undefined
      ? readSafeStringArray(
          raw,
          'geographicalCoverage',
          { allowEmpty: true, maxItems: 15, maxItemLength: 120 },
          errors
        ) ?? undefined
      : undefined;

  if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) {
    errors.push(`Published problem "${expectedDocId}" must have a positive integer schemaVersion.`);
  }

  if (errors.length > 0) {
    return { ok: false, value: null, errors };
  }

  const doc: PublishedProblemDocument = {
    id: expectedDocId,
    slug: expectedDocId,
    title: title!,
    summary: summary!,
    ...(categoryLabel ? { categoryLabel } : {}),
    categories: categories as readonly QuickExploreCategory[],
    ...(illustration ? { illustration } : {}),
    ...(tags ? { tags } : {}),
    affectedAudience: affectedAudience!,
    recurrenceNote: recurrenceNote!,
    isIllustrativeDemo: false,
    publishedAt: publishedAt!,
    publicationStatus: 'published',
    verifiedEvidenceCount: raw.verifiedEvidenceCount as number,
    ...(independentEvidenceCount !== undefined ? { independentEvidenceCount } : {}),
    ...(sourceDiversityCount !== undefined ? { sourceDiversityCount } : {}),
    sourceCoverage,
    ...(geographicalCoverage ? { geographicalCoverage } : {}),
    lastUpdated,
    coverageNote: coverageNote!,
    evidence,
    researchLimitations: researchLimitations!,
    unknownsAndRisks: unknownsAndRisks!,
    insights,
    existingAlternatives,
    ...(commercialRelevance !== undefined ? { commercialRelevance } : {}),
    ...(publishedUnderFounderException !== undefined ? { publishedUnderFounderException } : {}),
    ...(researchOrigin !== undefined ? { researchOrigin } : {}),
    schemaVersion: raw.schemaVersion as number,
  };

  const domainModel = toPublishedProblemDomainModel(doc);
  const integrity = validateEvidenceReferences(domainModel);
  if (!integrity.valid) {
    return { ok: false, value: null, errors: integrity.errors };
  }

  return { ok: true, value: doc, errors: [] };
}

function defaultIllustrationForCategory(
  categories: readonly QuickExploreCategory[]
): OpportunityIllustrationKey {
  if (categories.includes('Health') || categories.includes('Education')) {
    return 'nutrition';
  }
  if (categories.includes('Sustainability')) {
    return 'packaging';
  }
  return 'monsoon';
}

export function toPublishedProblemDomainModel(
  doc: PublishedProblemDocument
): Problem {
  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    summary: doc.summary,
    categories: [...doc.categories],
    affectedAudience: [...doc.affectedAudience],
    recurrenceNote: doc.recurrenceNote,
    isIllustrativeDemo: false,
    publicationStatus: 'published',
    evidenceCoverage: {
      sourceCount: doc.sourceCoverage,
      verifiedCount: doc.verifiedEvidenceCount,
      illustrativeCount: 0,
      lastUpdated: doc.lastUpdated,
      coverageNote: doc.coverageNote,
    },
    evidence: [...doc.evidence],
    insights: [...doc.insights],
    existingAlternatives: [...doc.existingAlternatives],
    unknownsAndRisks: [...doc.unknownsAndRisks],
    independentEvidenceCount: doc.independentEvidenceCount,
    sourceDiversityCount: doc.sourceDiversityCount,
    geographicalCoverage: doc.geographicalCoverage ? [...doc.geographicalCoverage] : undefined,
    researchLimitations: [...doc.researchLimitations],
    commercialRelevanceSummary: doc.commercialRelevance?.overallSummary ?? null,
    commercialRelevanceDimensions: doc.commercialRelevance?.dimensions.map((d) => ({
      key: d.key,
      label: d.label,
      status: d.status,
      summary: d.summary,
      unresolvedQuestion: d.unresolvedQuestion,
    })),
    publishedUnderFounderException: doc.publishedUnderFounderException === true,
    publishedAt: doc.publishedAt,
  };
}

export function toPublishedOpportunityCardItem(
  doc: PublishedProblemDocument
): OpportunityCardItem {
  const verifiedCount = doc.verifiedEvidenceCount;
  const illustration = doc.illustration ?? defaultIllustrationForCategory(doc.categories);
  return {
    id: doc.id,
    categoryLabel: doc.categoryLabel ?? doc.categories.join(' · '),
    categories: [...doc.categories],
    title: doc.title,
    description: doc.summary,
    illustration,
    evidenceVolume: `${verifiedCount} verified observation${verifiedCount === 1 ? '' : 's'}`,
    opportunityScore: doc.commercialRelevance ? 'Qualitative review' : 'Not available',
    isIllustrative: false,
    publishedAt: doc.publishedAt,
    tags: doc.tags ? [...doc.tags] : [],
  };
}

export function adaptValidatedPublishedProblem(
  doc: PublishedProblemDocument
): ValidatedProblemAdapter {
  const illustration = doc.illustration ?? defaultIllustrationForCategory(doc.categories);
  return {
    problem: toPublishedProblemDomainModel(doc),
    opportunity: toPublishedOpportunityCardItem(doc),
    illustration,
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

export interface SavedOpportunityValidationOptions {
  readonly allowPublishedIds?: boolean;
  readonly approvedPublishedIds?: ReadonlySet<string>;
}

/**
 * Runtime validator for `users/{uid}/savedOpportunities/{problemId}` documents.
 */
export function validateSavedOpportunityDocument(
  expectedProblemId: string,
  raw: unknown,
  options: SavedOpportunityValidationOptions = {}
): ValidationOutcome<SavedOpportunityDocument> {
  const errors: string[] = [];

  const isIdApproved =
    isValidFirestoreDocId(expectedProblemId) &&
    (isApprovedDemoProblemId(expectedProblemId) ||
      Boolean(options.allowPublishedIds) ||
      Boolean(options.approvedPublishedIds?.has(expectedProblemId)));

  if (!isIdApproved) {
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
