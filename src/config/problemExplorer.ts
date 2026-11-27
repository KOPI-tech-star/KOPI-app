import {
  DEMO_OPPORTUNITIES,
  type QuickExploreCategory,
} from './opportunityRadar';

export type EvidenceSourceType =
  | 'forum_thread'
  | 'support_ticket'
  | 'interview_note'
  | 'review_excerpt'
  | 'field_observation'
  | 'research_publication'
  | 'government_dataset'
  | 'news_article'
  | 'community_submission'
  | 'dataset_demo';

export type VerificationStatus =
  | 'verified'
  | 'illustrative_demo'
  | 'unverified';

export type ProblemInsightKind = 'evidence_backed' | 'hypothesis';

export interface EvidenceRecord {
  readonly id: string;
  readonly problemId: string;
  readonly sourceType: EvidenceSourceType;
  readonly sourceName: string;
  readonly excerpt: string;
  readonly observedDate: string | null;
  readonly externalUrl: string | null;
  readonly verificationStatus: VerificationStatus;
}

export interface EvidenceCoverage {
  readonly sourceCount: number | null;
  readonly verifiedCount: number;
  readonly illustrativeCount: number;
  readonly lastUpdated: string | null;
  readonly coverageNote: string;
}

export interface ProblemInsight {
  readonly id: string;
  readonly statement: string;
  readonly kind: ProblemInsightKind;
  readonly supportingEvidenceIds: readonly string[];
}

export interface ExistingAlternative {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly observedShortcoming: string;
  readonly supportingEvidenceIds: readonly string[];
}

export interface QualitativeRelevanceSummaryItem {
  readonly key: string;
  readonly label: string;
  readonly status: 'supported' | 'partially_supported' | 'insufficient_evidence' | 'contradicted';
  readonly summary: string;
  readonly unresolvedQuestion: string | null;
}

export interface Problem {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly categories: readonly QuickExploreCategory[];
  readonly affectedAudience: readonly string[];
  readonly recurrenceNote: string;
  readonly isIllustrativeDemo: boolean;
  readonly publicationStatus?: 'demo' | 'published';
  readonly evidenceCoverage: EvidenceCoverage;
  readonly evidence: readonly EvidenceRecord[];
  readonly insights: readonly ProblemInsight[];
  readonly existingAlternatives: readonly ExistingAlternative[];
  readonly unknownsAndRisks: readonly string[];
  readonly independentEvidenceCount?: number;
  readonly sourceDiversityCount?: number;
  readonly geographicalCoverage?: readonly string[];
  readonly researchLimitations?: readonly string[];
  readonly commercialRelevanceSummary?: string | null;
  readonly commercialRelevanceDimensions?: readonly QualitativeRelevanceSummaryItem[];
  readonly founderExceptionNote?: string | null;
  readonly publishedAt?: string | null;
}

export interface ProblemFilterInput {
  readonly query?: string;
  readonly category?: QuickExploreCategory;
}

export interface IntegrityValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const DEFAULT_DEMO_COVERAGE_NOTE =
  'Live evidence collection is not connected. Metrics remain unknown and this record is an illustrative demonstration example only.';

const DEFAULT_RECURRENCE_UNKNOWN =
  'Not available (live recurrence tracking not connected).';

function findRadarSeed(id: string) {
  const seed = DEMO_OPPORTUNITIES.find((item) => item.id === id);
  if (!seed) {
    throw new Error(`Missing expected Opportunity Radar seed record: ${id}`);
  }
  return seed;
}

const MONSOON_SEED = findRadarSeed('wet-entrance-monsoons');
const NUTRITION_SEED = findRadarSeed('student-nutrition-consistency');
const PACKAGING_SEED = findRadarSeed('excessive-small-delivery-packaging');

/**
 * Initial Problem Explorer demonstration dataset reusing the exact IDs,
 * titles, descriptions, and categories from Opportunity Radar without
 * inventing citations, statistics, competitor claims, or opportunity scores.
 */
export const PROBLEM_RECORDS: readonly Problem[] = [
  {
    id: MONSOON_SEED.id,
    slug: MONSOON_SEED.id,
    title: MONSOON_SEED.title,
    summary: MONSOON_SEED.description,
    categories: MONSOON_SEED.categories,
    affectedAudience: [
      'Apartment lobby visitors and facility caretakers (unverified demo scope)',
      'Small clinic and neighborhood shop entrants (unverified demo scope)',
    ],
    recurrenceNote: DEFAULT_RECURRENCE_UNKNOWN,
    isIllustrativeDemo: true,
    evidenceCoverage: {
      sourceCount: null,
      verifiedCount: 0,
      illustrativeCount: 0,
      lastUpdated: null,
      coverageNote: DEFAULT_DEMO_COVERAGE_NOTE,
    },
    evidence: [],
    insights: [],
    existingAlternatives: [],
    unknownsAndRisks: [
      'Primary community complaints and incident frequency have not yet been collected.',
      'Existing entryway matting and umbrella-storage workarounds remain unassessed.',
      'Buyer willingness to pay and facility constraints are currently unknown.',
    ],
  },
  {
    id: NUTRITION_SEED.id,
    slug: NUTRITION_SEED.id,
    title: NUTRITION_SEED.title,
    summary: NUTRITION_SEED.description,
    categories: NUTRITION_SEED.categories,
    affectedAudience: [
      'University and exam-preparation students with erratic schedules (unverified demo scope)',
    ],
    recurrenceNote: DEFAULT_RECURRENCE_UNKNOWN,
    isIllustrativeDemo: true,
    evidenceCoverage: {
      sourceCount: null,
      verifiedCount: 0,
      illustrativeCount: 0,
      lastUpdated: null,
      coverageNote: DEFAULT_DEMO_COVERAGE_NOTE,
    },
    evidence: [],
    insights: [],
    existingAlternatives: [],
    unknownsAndRisks: [
      'Primary student interviews and verified complaint threads have not yet been collected.',
      'Regional budget thresholds and dietary preferences remain unknown.',
      'Adoption barriers for existing meal-prep or campus dining options are unverified.',
    ],
  },
  {
    id: PACKAGING_SEED.id,
    slug: PACKAGING_SEED.id,
    title: PACKAGING_SEED.title,
    summary: PACKAGING_SEED.description,
    categories: PACKAGING_SEED.categories,
    affectedAudience: [
      'Frequent single-item grocery, snack, and pharmacy delivery buyers (unverified demo scope)',
    ],
    recurrenceNote: DEFAULT_RECURRENCE_UNKNOWN,
    isIllustrativeDemo: true,
    evidenceCoverage: {
      sourceCount: null,
      verifiedCount: 0,
      illustrativeCount: 0,
      lastUpdated: null,
      coverageNote: DEFAULT_DEMO_COVERAGE_NOTE,
    },
    evidence: [],
    insights: [],
    existingAlternatives: [],
    unknownsAndRisks: [
      'Verified consumer feedback and merchant fulfillment telemetry are not available.',
      'Damage-protection requirements driving oversized cartons remain uninvestigated.',
      'Whether consumers or merchants bear switching costs is currently unknown.',
    ],
  },
] as const;

export function getProblemById(
  problemId: string,
  records: readonly Problem[] = PROBLEM_RECORDS
): Problem | null {
  const normalizedId = problemId.trim();
  if (!normalizedId) return null;

  const match = records.find((problem) => problem.id === normalizedId);
  return match ?? null;
}

export function filterProblems(
  records: readonly Problem[],
  filter: ProblemFilterInput = {}
): Problem[] {
  const normalizedQuery = (filter.query ?? '').trim().toLowerCase();
  const category = filter.category ?? 'All';

  return records.filter((problem) => {
    const matchesCategory =
      category === 'All' || problem.categories.includes(category);
    if (!matchesCategory) return false;

    if (!normalizedQuery) return true;

    const searchableText = [
      problem.title,
      problem.summary,
      ...problem.categories,
      ...problem.affectedAudience,
    ]
      .join(' ')
      .toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
}

export function getEvidenceForProblem(
  problemId: string,
  records: readonly Problem[] = PROBLEM_RECORDS
): readonly EvidenceRecord[] {
  const problem = getProblemById(problemId, records);
  if (!problem) return [];

  return problem.evidence.filter((record) => record.problemId === problem.id);
}

/**
 * Validates external URLs intended solely for UI display links.
 * Accepts only well-formed absolute HTTPS URLs.
 * Note: Display-only validation; NOT sufficient for backend HTTP fetching or SSRF prevention.
 */
export function sanitizeExternalUrl(
  rawUrl: string | null | undefined
): string | null {
  if (typeof rawUrl !== 'string') return null;

  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Reject whitespace or ASCII control characters inside URLs
  if (/[\s\u0000-\u001F\u007F]/.test(trimmed)) return null;

  // Reject protocol-relative or root-relative paths early
  if (trimmed.startsWith('/') || trimmed.startsWith('.')) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function validateEvidenceReferences(
  problem: Problem
): IntegrityValidationResult {
  const errors: string[] = [];
  const seenEvidenceIds = new Set<string>();
  const evidenceIds = new Set<string>();

  for (const record of problem.evidence) {
    if (!record.id.trim()) {
      errors.push(`Problem "${problem.id}" contains an evidence record with an empty ID.`);
      continue;
    }

    if (seenEvidenceIds.has(record.id)) {
      errors.push(
        `Problem "${problem.id}" contains duplicate evidence ID "${record.id}".`
      );
    }
    seenEvidenceIds.add(record.id);
    evidenceIds.add(record.id);

    if (record.problemId !== problem.id) {
      errors.push(
        `Evidence "${record.id}" has mismatched problemId "${record.problemId}" (expected "${problem.id}").`
      );
    }

    if (problem.isIllustrativeDemo && record.verificationStatus === 'verified') {
      errors.push(
        `Demonstration problem "${problem.id}" cannot mark evidence "${record.id}" as verified.`
      );
    }

    if (record.externalUrl !== null && sanitizeExternalUrl(record.externalUrl) === null) {
      errors.push(
        `Evidence "${record.id}" contains an unsafe or invalid externalUrl.`
      );
    }
  }

  const actualVerifiedCount = problem.evidence.filter(
    (record) => record.verificationStatus === 'verified'
  ).length;

  if (problem.isIllustrativeDemo && problem.evidenceCoverage.verifiedCount !== 0) {
    errors.push(
      `Demonstration problem "${problem.id}" must report verifiedCount === 0.`
    );
  } else if (problem.evidenceCoverage.verifiedCount > actualVerifiedCount) {
    errors.push(
      `Problem "${problem.id}" reports verifiedCount (${problem.evidenceCoverage.verifiedCount}) exceeding actual verified evidence (${actualVerifiedCount}).`
    );
  }

  const seenInsightIds = new Set<string>();
  for (const insight of problem.insights) {
    if (seenInsightIds.has(insight.id)) {
      errors.push(
        `Problem "${problem.id}" contains duplicate insight ID "${insight.id}".`
      );
    }
    seenInsightIds.add(insight.id);

    if (
      insight.kind === 'evidence_backed' &&
      insight.supportingEvidenceIds.length === 0
    ) {
      errors.push(
        `Evidence-backed insight "${insight.id}" on problem "${problem.id}" has no supportingEvidenceIds.`
      );
    }

    for (const evId of insight.supportingEvidenceIds) {
      if (!evidenceIds.has(evId)) {
        errors.push(
          `Insight "${insight.id}" on problem "${problem.id}" references missing or foreign evidence ID "${evId}".`
        );
      }
    }
  }

  const seenAltIds = new Set<string>();
  for (const alt of problem.existingAlternatives) {
    if (seenAltIds.has(alt.id)) {
      errors.push(
        `Problem "${problem.id}" contains duplicate alternative ID "${alt.id}".`
      );
    }
    seenAltIds.add(alt.id);

    for (const evId of alt.supportingEvidenceIds) {
      if (!evidenceIds.has(evId)) {
        errors.push(
          `Alternative "${alt.id}" on problem "${problem.id}" references missing or foreign evidence ID "${evId}".`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateProblemDatasetIntegrity(
  records: readonly Problem[]
): IntegrityValidationResult {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();

  for (const problem of records) {
    if (!problem.id.trim()) {
      errors.push('Encountered a problem record with an empty ID.');
      continue;
    }

    if (seenIds.has(problem.id)) {
      errors.push(`Duplicate problem ID "${problem.id}" detected.`);
    }
    seenIds.add(problem.id);

    if (seenSlugs.has(problem.slug)) {
      errors.push(`Duplicate problem slug "${problem.slug}" detected.`);
    }
    seenSlugs.add(problem.slug);

    const recordResult = validateEvidenceReferences(problem);
    errors.push(...recordResult.errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
