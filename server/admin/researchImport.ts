import crypto from 'node:crypto';
import type { EvidenceSourceType, VerificationStatus } from '../../src/config/problemExplorer';
import { FIRESTORE_COLLECTION_NAMES, type DataSourceDocument, type SourceObservationDocument } from '../../src/data/firestoreContracts';
import {
  canonicalizeUrl,
  containsUnsafeHtmlOrScript,
  isPlainObject,
  isValidFirestoreDocId,
  normalizeTextForFingerprint,
  parseValidIsoTimestamp,
  validateDataSourceRecord,
  validateSourceObservationRecord,
} from '../../src/data/firestoreValidation';
import type { AdminFirestoreStore } from './firebaseAdminClient';
import type { IngestionRecordInput } from './ingestionCore';

export interface ResearchImportObservationInput {
  readonly observationId?: string;
  readonly sourceId: string;
  readonly externalReference: string;
  readonly permittedSourceUrl: string | null;
  readonly permittedExcerptOrSummary: string;
  readonly problemStatement?: string | null;
  readonly context?: string | null;
  readonly affectedCustomerSegment?: string | null;
  readonly reportedConsequences?: string | null;
  readonly existingWorkaround?: string | null;
  readonly spendingOrWtpSignal?: string | null;
  readonly geography?: string | null;
  readonly sourceType?: EvidenceSourceType;
  readonly sourceName?: string | null;
  readonly independentGroupKey?: string | null;
  readonly observationTimestamp: string;
  readonly publicationTimestamp?: string | null;
  readonly verificationStatus?: VerificationStatus;
  readonly provenance: string;
  readonly retentionPolicy: string;
  readonly removalOrRestrictionStatus?: SourceObservationDocument['removalOrRestrictionStatus'];
}

export interface ResearchImportPackage {
  readonly packageVersion: number;
  readonly packageId: string;
  readonly isSyntheticTestFixture: boolean;
  readonly description?: string;
  readonly sources: readonly DataSourceDocument[];
  readonly observations: readonly ResearchImportObservationInput[];
}

export interface SkippedDuplicateObservation {
  readonly observationId: string;
  readonly contentFingerprint: string;
  readonly reason: 'duplicate_observation_id' | 'duplicate_fingerprint' | 'duplicate_canonical_url_excerpt';
  readonly matchedExistingObservationId: string;
}

export interface RejectedImportItem {
  readonly kind: 'package' | 'dataSource' | 'sourceObservation';
  readonly id: string;
  readonly errors: readonly string[];
}

export interface ResearchImportPlan {
  readonly ok: boolean;
  readonly packageId: string;
  readonly isSyntheticTestFixture: boolean;
  readonly acceptedSources: readonly DataSourceDocument[];
  readonly acceptedObservations: readonly SourceObservationDocument[];
  readonly skippedDuplicates: readonly SkippedDuplicateObservation[];
  readonly rejectedItems: readonly RejectedImportItem[];
  readonly ingestionRecords: readonly IngestionRecordInput[];
  readonly errors: readonly string[];
}

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN = /(?:\+\d{1,3}[\s.-](?:\d{5}[\s.-]?\d{5}|\d{3,4}[\s.-]\d{3,4}[\s.-]\d{3,4})|(?:\(\d{2,4}\)[\s.-]?|\d{3,4}[\s.-])\d{3,4}[\s.-]\d{3,4})\b/;
const ISO_DATE_PREFIX_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T\s]|$)/;
const DISALLOWED_SCRAPING_KEYS = new Set([
  'scrapeUrl',
  'scrapeTarget',
  'htmlSelector',
  'cssSelector',
  'xpath',
  'bypassRobots',
  'ignoreRobots',
  'bypassPaywall',
  'cookieHeader',
  'sessionCookie',
]);

export function detectDisallowedPiiOrScraping(
  raw: Record<string, unknown>,
  fieldsToScan: readonly string[]
): string[] {
  const errors: string[] = [];

  for (const key of Object.keys(raw)) {
    if (DISALLOWED_SCRAPING_KEYS.has(key)) {
      errors.push(`Disallowed scraping instruction field "${key}" is prohibited.`);
    }
  }

  for (const field of fieldsToScan) {
    const val = raw[field];
    if (typeof val !== 'string' || !val.trim()) continue;

    if (EMAIL_PATTERN.test(val)) {
      errors.push(`Field "${field}" appears to contain an email address (PII must be excluded).`);
    }

    // Avoid false-positives against ISO dates
    const sanitizedForPhone = val.replace(/\b\d{4}-\d{2}-\d{2}(?:T[0-9:.Z+-]+)?\b/g, ' ');
    if (!ISO_DATE_PREFIX_PATTERN.test(sanitizedForPhone.trim()) && PHONE_PATTERN.test(sanitizedForPhone)) {
      errors.push(`Field "${field}" appears to contain a phone number (PII must be excluded).`);
    }

    if (containsUnsafeHtmlOrScript(val)) {
      errors.push(`Field "${field}" contains unsafe HTML or script markup.`);
    }
  }

  return errors;
}

export function computeObservationFingerprint(input: {
  readonly sourceId: string;
  readonly canonicalUrl: string | null;
  readonly permittedExcerptOrSummary: string;
  readonly problemStatement?: string | null;
}): string {
  const normalizedExcerpt = normalizeTextForFingerprint(input.permittedExcerptOrSummary);
  const normalizedStatement = input.problemStatement
    ? normalizeTextForFingerprint(input.problemStatement)
    : '';
  const canonical = input.canonicalUrl ?? '';
  const payload = [
    input.sourceId.trim(),
    canonical,
    normalizedExcerpt,
    normalizedStatement,
  ].join('|');

  const digest = crypto.createHash('sha256').update(payload).digest('hex');
  return `sha256-${digest}`;
}

export function deriveObservationId(
  sourceId: string,
  fingerprint: string
): string {
  const rawId = `obs_${sourceId}_${fingerprint.replace(/^sha256-/, '').slice(0, 16)}`;
  return rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

export function parseResearchImportPackage(raw: unknown): {
  readonly ok: boolean;
  readonly value: ResearchImportPackage | null;
  readonly errors: readonly string[];
} {
  const errors: string[] = [];
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      value: null,
      errors: ['Research import package must be a JSON object.'],
    };
  }

  if (raw.packageVersion !== 1) {
    errors.push('Field "packageVersion" must equal 1.');
  }

  const packageId = typeof raw.packageId === 'string' ? raw.packageId.trim() : '';
  if (!packageId || !isValidFirestoreDocId(packageId)) {
    errors.push('Field "packageId" must be a valid non-empty identifier.');
  }

  if (typeof raw.isSyntheticTestFixture !== 'boolean') {
    errors.push(
      'Field "isSyntheticTestFixture" must explicitly be a boolean (true for synthetic test data, false for vetted real research).'
    );
  }

  if (!Array.isArray(raw.sources)) {
    errors.push('Field "sources" must be an array.');
  }
  if (!Array.isArray(raw.observations)) {
    errors.push('Field "observations" must be an array.');
  }

  if (errors.length > 0) {
    return { ok: false, value: null, errors };
  }

  return {
    ok: true,
    value: {
      packageVersion: 1,
      packageId,
      isSyntheticTestFixture: raw.isSyntheticTestFixture as boolean,
      description:
        typeof raw.description === 'string' ? raw.description.trim() : undefined,
      sources: raw.sources as readonly DataSourceDocument[],
      observations: raw.observations as readonly ResearchImportObservationInput[],
    },
    errors: [],
  };
}

export async function planResearchImport(
  store: AdminFirestoreStore,
  rawPackage: unknown
): Promise<ResearchImportPlan> {
  const parsedPkg = parseResearchImportPackage(rawPackage);
  if (!parsedPkg.ok || !parsedPkg.value) {
    return {
      ok: false,
      packageId: 'invalid',
      isSyntheticTestFixture: false,
      acceptedSources: [],
      acceptedObservations: [],
      skippedDuplicates: [],
      rejectedItems: [
        { kind: 'package', id: 'root', errors: parsedPkg.errors },
      ],
      ingestionRecords: [],
      errors: parsedPkg.errors,
    };
  }

  const pkg = parsedPkg.value;
  const rejectedItems: RejectedImportItem[] = [];
  const acceptedSources: DataSourceDocument[] = [];
  const activeSourceMap = new Map<string, DataSourceDocument>();

  // Load existing dataSources & sourceObservations for permission + deduplication checks
  const [existingSourceSnaps, existingObsSnaps] = await Promise.all([
    store.listDocuments(FIRESTORE_COLLECTION_NAMES.dataSources, { limit: 500 }),
    store.listDocuments(FIRESTORE_COLLECTION_NAMES.sourceObservations, { limit: 1000 }),
  ]);

  for (const snap of existingSourceSnaps) {
    if (!snap.exists || !snap.data) continue;
    const validated = validateDataSourceRecord(snap.data);
    if (validated.ok && validated.value) {
      if (
        validated.value.permissionReviewStatus === 'approved' &&
        validated.value.activationStatus === 'active'
      ) {
        activeSourceMap.set(validated.value.sourceId, validated.value);
      }
    }
  }

  // Validate incoming sources and enforce active + approved governance
  for (let i = 0; i < pkg.sources.length; i += 1) {
    const rawSource = pkg.sources[i];
    const sourceRecordObj: Record<string, unknown> = isPlainObject(rawSource)
      ? rawSource
      : {};
    const tentativeId =
      typeof sourceRecordObj.sourceId === 'string' && sourceRecordObj.sourceId.trim()
        ? sourceRecordObj.sourceId.trim()
        : `source_${i}`;

    const piiOrScrapeErrors = detectDisallowedPiiOrScraping(sourceRecordObj, [
      'sourceName',
      'termsOrLicenceReference',
      'attributionRequirements',
      'retentionRestrictions',
    ]);
    const validation = validateDataSourceRecord(rawSource);
    const combinedErrors = [...piiOrScrapeErrors, ...validation.errors];

    if (validation.ok && validation.value) {
      if (
        validation.value.permissionReviewStatus !== 'approved' ||
        validation.value.activationStatus !== 'active'
      ) {
        combinedErrors.push(
          `Source "${validation.value.sourceId}" is not approved and active (review=${validation.value.permissionReviewStatus}, activation=${validation.value.activationStatus}).`
        );
      }
    }

    if (combinedErrors.length > 0 || !validation.value) {
      rejectedItems.push({
        kind: 'dataSource',
        id: tentativeId,
        errors: combinedErrors,
      });
      continue;
    }

    acceptedSources.push(validation.value);
    activeSourceMap.set(validation.value.sourceId, validation.value);
  }

  // Index existing observations for cross-run deduplication
  const existingObsIds = new Set<string>();
  const existingFingerprintToId = new Map<string, string>();
  const existingUrlExcerptToId = new Map<string, string>();

  for (const snap of existingObsSnaps) {
    if (!snap.exists || !snap.data) continue;
    const data = snap.data;
    existingObsIds.add(snap.id);
    if (typeof data.contentFingerprint === 'string' && data.contentFingerprint.trim()) {
      existingFingerprintToId.set(data.contentFingerprint.trim(), snap.id);
    }
    const existingCanonical =
      typeof data.canonicalUrl === 'string'
        ? data.canonicalUrl
        : canonicalizeUrl(
            typeof data.permittedSourceUrl === 'string' ? data.permittedSourceUrl : null
          );
    const existingExcerpt =
      typeof data.permittedExcerptOrSummary === 'string'
        ? normalizeTextForFingerprint(data.permittedExcerptOrSummary)
        : '';
    if (existingCanonical && existingExcerpt) {
      existingUrlExcerptToId.set(`${existingCanonical}::${existingExcerpt}`, snap.id);
    }
  }

  const batchObsIds = new Set<string>();
  const batchFingerprintToId = new Map<string, string>();
  const batchUrlExcerptToId = new Map<string, string>();
  const acceptedObservations: SourceObservationDocument[] = [];
  const skippedDuplicates: SkippedDuplicateObservation[] = [];

  for (let i = 0; i < pkg.observations.length; i += 1) {
    const rawObs = pkg.observations[i];
    if (!isPlainObject(rawObs)) {
      rejectedItems.push({
        kind: 'sourceObservation',
        id: `observation_${i}`,
        errors: ['Observation entry must be an object.'],
      });
      continue;
    }

    const sourceId = typeof rawObs.sourceId === 'string' ? rawObs.sourceId.trim() : '';
    const tentativeId =
      typeof rawObs.observationId === 'string' && rawObs.observationId.trim()
        ? rawObs.observationId.trim()
        : `observation_${i}`;

    const itemErrors: string[] = [];
    if (!sourceId || !activeSourceMap.has(sourceId)) {
      itemErrors.push(
        `Observation references unapproved, inactive, or missing sourceId "${sourceId}".`
      );
    }

    itemErrors.push(
      ...detectDisallowedPiiOrScraping(rawObs, [
        'externalReference',
        'permittedExcerptOrSummary',
        'problemStatement',
        'context',
        'affectedCustomerSegment',
        'reportedConsequences',
        'existingWorkaround',
        'spendingOrWtpSignal',
        'provenance',
      ])
    );

    if (
      rawObs.permittedSourceUrl !== null &&
      rawObs.permittedSourceUrl !== undefined
    ) {
      const canonicalCheck = canonicalizeUrl(
        typeof rawObs.permittedSourceUrl === 'string' ? rawObs.permittedSourceUrl : null
      );
      if (!canonicalCheck) {
        itemErrors.push('Field "permittedSourceUrl" must be null or a valid HTTPS URL.');
      }
    }

    const rawExcerpt =
      typeof rawObs.permittedExcerptOrSummary === 'string'
        ? rawObs.permittedExcerptOrSummary.trim()
        : '';
    const rawProblemStatement =
      typeof rawObs.problemStatement === 'string' ? rawObs.problemStatement.trim() : null;
    const canonicalUrl = canonicalizeUrl(
      typeof rawObs.permittedSourceUrl === 'string' ? rawObs.permittedSourceUrl : null
    );

    const contentFingerprint = computeObservationFingerprint({
      sourceId: sourceId || 'unknown',
      canonicalUrl,
      permittedExcerptOrSummary: rawExcerpt,
      problemStatement: rawProblemStatement,
    });

    const resolvedObsId =
      typeof rawObs.observationId === 'string' && rawObs.observationId.trim()
        ? rawObs.observationId.trim()
        : deriveObservationId(sourceId || 'src', contentFingerprint);

    const matchedSource = activeSourceMap.get(sourceId);
    const candidateDoc: Record<string, unknown> = {
      ...rawObs,
      observationId: resolvedObsId,
      sourceId,
      permittedSourceUrl: canonicalUrl ?? (rawObs.permittedSourceUrl ?? null),
      canonicalUrl,
      contentFingerprint,
      verificationStatus: rawObs.verificationStatus ?? 'unverified',
      publicationTimestamp:
        rawObs.publicationTimestamp === undefined ? null : rawObs.publicationTimestamp,
      removalOrRestrictionStatus: rawObs.removalOrRestrictionStatus ?? 'active',
      sourceName: rawObs.sourceName ?? matchedSource?.sourceName ?? null,
      schemaVersion: 1,
    };

    const obsValidation = validateSourceObservationRecord(
      candidateDoc,
      new Set(activeSourceMap.keys())
    );
    itemErrors.push(...obsValidation.errors);

    // Explicitly require valid observationTimestamp
    if (!parseValidIsoTimestamp(rawObs.observationTimestamp)) {
      if (!itemErrors.some((e) => e.includes('observationTimestamp'))) {
        itemErrors.push('Field "observationTimestamp" must be a valid ISO timestamp.');
      }
    }

    if (itemErrors.length > 0 || !obsValidation.value) {
      rejectedItems.push({
        kind: 'sourceObservation',
        id: tentativeId,
        errors: itemErrors,
      });
      continue;
    }

    const validatedObs = obsValidation.value;

    // Deduplication checks against Firestore and current batch
    if (existingObsIds.has(validatedObs.observationId) || batchObsIds.has(validatedObs.observationId)) {
      skippedDuplicates.push({
        observationId: validatedObs.observationId,
        contentFingerprint: validatedObs.contentFingerprint,
        reason: 'duplicate_observation_id',
        matchedExistingObservationId: validatedObs.observationId,
      });
      continue;
    }

    const fpMatch =
      existingFingerprintToId.get(validatedObs.contentFingerprint) ??
      batchFingerprintToId.get(validatedObs.contentFingerprint);
    if (fpMatch) {
      skippedDuplicates.push({
        observationId: validatedObs.observationId,
        contentFingerprint: validatedObs.contentFingerprint,
        reason: 'duplicate_fingerprint',
        matchedExistingObservationId: fpMatch,
      });
      continue;
    }

    const urlExcerptKey = canonicalUrl
      ? `${canonicalUrl}::${normalizeTextForFingerprint(validatedObs.permittedExcerptOrSummary)}`
      : null;
    if (urlExcerptKey) {
      const urlMatch =
        existingUrlExcerptToId.get(urlExcerptKey) ??
        batchUrlExcerptToId.get(urlExcerptKey);
      if (urlMatch) {
        skippedDuplicates.push({
          observationId: validatedObs.observationId,
          contentFingerprint: validatedObs.contentFingerprint,
          reason: 'duplicate_canonical_url_excerpt',
          matchedExistingObservationId: urlMatch,
        });
        continue;
      }
      batchUrlExcerptToId.set(urlExcerptKey, validatedObs.observationId);
    }

    batchObsIds.add(validatedObs.observationId);
    batchFingerprintToId.set(validatedObs.contentFingerprint, validatedObs.observationId);
    acceptedObservations.push(validatedObs);
  }

  const ingestionRecords: IngestionRecordInput[] = [
    ...acceptedSources.map((source) => ({
      collection: FIRESTORE_COLLECTION_NAMES.dataSources,
      documentId: source.sourceId,
      data: source as unknown as Record<string, unknown>,
    })),
    ...acceptedObservations.map((obs) => ({
      collection: FIRESTORE_COLLECTION_NAMES.sourceObservations,
      documentId: obs.observationId,
      data: obs as unknown as Record<string, unknown>,
    })),
  ];

  const errors = rejectedItems.flatMap((item) =>
    item.errors.map((err) => `${item.kind}/${item.id}: ${err}`)
  );

  return {
    ok: rejectedItems.length === 0,
    packageId: pkg.packageId,
    isSyntheticTestFixture: pkg.isSyntheticTestFixture,
    acceptedSources,
    acceptedObservations,
    skippedDuplicates,
    rejectedItems,
    ingestionRecords,
    errors,
  };
}
