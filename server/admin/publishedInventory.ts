import { FIRESTORE_COLLECTION_NAMES } from '../../src/data/firestoreContracts';
import {
  isPlainObject,
  validatePublishedProblemDocument,
} from '../../src/data/firestoreValidation';
import type { AdminFirestoreStore } from './firebaseAdminClient';

export const KOPI_EXPECTED_PROJECT_ID = 'gen-lang-client-0653252950';
export const KOPI_EXPECTED_DATABASE_ID =
  'ai-studio-kopi-6863852d-35ae-4115-97d3-3fcc2fdd6372';

export type InventoryProvenanceStatus =
  | 'genuine_research'
  | 'synthetic_test_fixture'
  | 'unknown';

export interface PublishedInventoryRecordReport {
  readonly id: string;
  readonly publicationStatus: string | null;
  readonly isIllustrativeDemo: boolean | null;
  readonly provenance: InventoryProvenanceStatus;
  readonly publishedUnderFounderException: boolean | null;
  readonly eligiblePublic: boolean;
  readonly requiresReview: boolean;
  readonly privateFieldPaths: readonly string[];
  readonly reasons: readonly string[];
}

export interface PublishedProblemsInventoryReport {
  readonly readOnly: true;
  readonly projectId: string;
  readonly databaseId: string;
  readonly targetConfirmed: boolean;
  readonly pagesScanned: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly eligiblePublicCount: number;
  readonly reviewRequiredCount: number;
  readonly records: readonly PublishedInventoryRecordReport[];
}

const PRIVATE_OR_INTERNAL_KEYS = new Set([
  'assessedBy',
  'founderDecisionNote',
  'founderExceptionReason',
  'founderExceptionNote',
  'reviewNotes',
  'reviewedBy',
  'reviewedAt',
  'approvedBy',
  'approvedAt',
  'internalComments',
]);

const FORBIDDEN_NUMERIC_SCORE_KEYS = new Set([
  'overallScore',
  'score',
  'numericScore',
]);

/**
 * Recursively scans top-level and nested objects/arrays (`commercialRelevance`,
 * `evidence[]`, `insights[]`, `existingAlternatives[]`, etc.) and returns only
 * field paths of disallowed private/internal or numeric score keys.
 * Field values are NEVER collected or emitted.
 */
function scanNestedDisallowedFieldPaths(
  value: unknown,
  prefix = '',
  depth = 0
): {
  readonly privateFieldPaths: string[];
  readonly numericScorePaths: string[];
} {
  const privateFieldPaths: string[] = [];
  const numericScorePaths: string[] = [];

  if (depth > 12 || value === null || value === undefined) {
    return { privateFieldPaths, numericScorePaths };
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const child = scanNestedDisallowedFieldPaths(
        value[i],
        `${prefix}[${i}]`,
        depth + 1
      );
      privateFieldPaths.push(...child.privateFieldPaths);
      numericScorePaths.push(...child.numericScorePaths);
    }
    return { privateFieldPaths, numericScorePaths };
  }

  if (!isPlainObject(value)) {
    return { privateFieldPaths, numericScorePaths };
  }

  for (const key of Object.keys(value)) {
    const childVal = value[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (PRIVATE_OR_INTERNAL_KEYS.has(key) && childVal !== undefined) {
      privateFieldPaths.push(path);
    } else if (
      FORBIDDEN_NUMERIC_SCORE_KEYS.has(key) &&
      childVal !== undefined &&
      childVal !== null
    ) {
      numericScorePaths.push(path);
    } else if (
      key === 'opportunityScore' &&
      childVal !== undefined &&
      childVal !== null
    ) {
      numericScorePaths.push(path);
    }

    const nested = scanNestedDisallowedFieldPaths(childVal, path, depth + 1);
    privateFieldPaths.push(...nested.privateFieldPaths);
    numericScorePaths.push(...nested.numericScorePaths);
  }

  return { privateFieldPaths, numericScorePaths };
}

function classifyInventoryProvenance(
  raw: Record<string, unknown>
): InventoryProvenanceStatus {
  if (
    raw.isSyntheticTestFixture === true ||
    raw.researchOrigin === 'synthetic_test_fixture'
  ) {
    return 'synthetic_test_fixture';
  }
  if (
    raw.researchOrigin === 'genuine_research' &&
    raw.isSyntheticTestFixture !== true
  ) {
    return 'genuine_research';
  }
  return 'unknown';
}

export async function runPublishedProblemsInventoryCheck(
  store: AdminFirestoreStore,
  options: {
    readonly pageSize?: number;
    readonly expectedProjectId?: string;
    readonly expectedDatabaseId?: string;
  } = {}
): Promise<PublishedProblemsInventoryReport> {
  const expectedProjectId = options.expectedProjectId ?? KOPI_EXPECTED_PROJECT_ID;
  const expectedDatabaseId =
    options.expectedDatabaseId ?? KOPI_EXPECTED_DATABASE_ID;

  if (
    !store.projectId ||
    !store.databaseId ||
    store.databaseId === '(default)' ||
    store.projectId !== expectedProjectId ||
    store.databaseId !== expectedDatabaseId
  ) {
    throw new Error(
      `Inventory target mismatch: expected ${expectedProjectId} / ${expectedDatabaseId}, got ${store.projectId} / ${store.databaseId}.`
    );
  }

  const pageSize =
    typeof options.pageSize === 'number' &&
    Number.isInteger(options.pageSize) &&
    options.pageSize > 0
      ? Math.min(options.pageSize, 500)
      : 50;

  const records: PublishedInventoryRecordReport[] = [];
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let pagesScanned = 0;

  while (true) {
    const page = await store.listDocumentsPage(
      FIRESTORE_COLLECTION_NAMES.publishedProblems,
      {
        pageSize,
        startAfterId: cursor,
      }
    );
    pagesScanned += 1;

    for (const snap of page.docs) {
      if (!snap.exists || seenIds.has(snap.id)) {
        continue;
      }
      seenIds.add(snap.id);

      const raw = snap.data;
      if (!raw || !isPlainObject(raw)) {
        records.push({
          id: snap.id,
          publicationStatus: null,
          isIllustrativeDemo: null,
          provenance: 'unknown',
          publishedUnderFounderException: null,
          eligiblePublic: false,
          requiresReview: true,
          privateFieldPaths: [],
          reasons: ['Document payload is missing or not a plain object.'],
        });
        continue;
      }

      const publicationStatus =
        typeof raw.publicationStatus === 'string' ? raw.publicationStatus : null;
      const isIllustrativeDemo =
        typeof raw.isIllustrativeDemo === 'boolean'
          ? raw.isIllustrativeDemo
          : null;
      const publishedUnderFounderException =
        typeof raw.publishedUnderFounderException === 'boolean'
          ? raw.publishedUnderFounderException
          : null;
      const provenance = classifyInventoryProvenance(raw);

      const { privateFieldPaths, numericScorePaths } =
        scanNestedDisallowedFieldPaths(raw);
      const validation = validatePublishedProblemDocument(snap.id, raw);

      const reasons: string[] = [];
      if (publicationStatus !== 'published') {
        reasons.push(
          `publicationStatus is "${publicationStatus ?? 'missing'}" (expected "published").`
        );
      }
      if (isIllustrativeDemo !== false) {
        reasons.push(
          `isIllustrativeDemo is ${isIllustrativeDemo === null ? 'missing/invalid' : String(isIllustrativeDemo)} (expected false).`
        );
      }
      if (provenance === 'synthetic_test_fixture') {
        reasons.push('Synthetic test fixture provenance detected.');
      } else if (provenance === 'unknown') {
        reasons.push(
          'Provenance is unknown (missing explicit genuine_research origin metadata).'
        );
      }
      if (privateFieldPaths.length > 0) {
        reasons.push(
          `Private/internal field path(s) present: ${privateFieldPaths.join(', ')}.`
        );
      }
      if (numericScorePaths.length > 0) {
        reasons.push(
          `Disallowed numeric score field path(s) present: ${numericScorePaths.join(', ')}.`
        );
      }
      if (!validation.ok) {
        for (const err of validation.errors) {
          if (!reasons.includes(err)) {
            reasons.push(err);
          }
        }
      }

      const eligiblePublic = reasons.length === 0;
      records.push({
        id: snap.id,
        publicationStatus,
        isIllustrativeDemo,
        provenance,
        publishedUnderFounderException,
        eligiblePublic,
        requiresReview: !eligiblePublic,
        privateFieldPaths,
        reasons,
      });
    }

    if (!page.hasMore || !page.nextCursor || seenCursors.has(page.nextCursor)) {
      break;
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  const eligiblePublicCount = records.filter((r) => r.eligiblePublic).length;
  const reviewRequiredCount = records.filter((r) => r.requiresReview).length;

  return {
    readOnly: true,
    projectId: store.projectId,
    databaseId: store.databaseId,
    targetConfirmed: true,
    pagesScanned,
    pageSize,
    totalCount: records.length,
    eligiblePublicCount,
    reviewRequiredCount,
    records,
  };
}

export function formatPublishedInventoryReport(
  report: PublishedProblemsInventoryReport
): string {
  const lines: string[] = [
    `Read-only publishedProblems inventory (${report.projectId} / ${report.databaseId})`,
    `Target confirmed: ${report.targetConfirmed} | Pages scanned: ${report.pagesScanned} (pageSize=${report.pageSize})`,
    `Counts: total=${report.totalCount}, eligiblePublic=${report.eligiblePublicCount}, reviewRequired=${report.reviewRequiredCount}`,
  ];

  if (report.records.length === 0) {
    lines.push('  (no documents found in publishedProblems)');
    return lines.join('\n');
  }

  for (const record of report.records) {
    const statusLabel = record.eligiblePublic ? 'ELIGIBLE_PUBLIC' : 'REVIEW_REQUIRED';
    const reasonSuffix =
      record.reasons.length > 0 ? ` reasons=[${record.reasons.join(' | ')}]` : '';
    lines.push(
      `  - ${record.id}: ${statusLabel} publicationStatus=${record.publicationStatus ?? 'missing'} isIllustrativeDemo=${String(record.isIllustrativeDemo)} provenance=${record.provenance} founderException=${String(record.publishedUnderFounderException)}${reasonSuffix}`
    );
  }

  return lines.join('\n');
}
