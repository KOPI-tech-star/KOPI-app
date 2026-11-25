import type {
  OpportunityCardItem,
  OpportunityIllustrationKey,
  QuickExploreCategory,
  TrendingTopic,
} from '../config/opportunityRadar';
import type {
  ExistingAlternative,
  Problem,
  ProblemInsight,
  VerificationStatus,
} from '../config/problemExplorer';
import type { OpportunityEvaluation } from '../config/opportunityEvaluation';

export const FIRESTORE_COLLECTION_NAMES = {
  dataSources: 'dataSources',
  sourceObservations: 'sourceObservations',
  problemClusters: 'problemClusters',
  evidenceLinks: 'evidenceLinks',
  researchInsights: 'researchInsights',
  opportunityEvaluations: 'opportunityEvaluations',
  publishedProblems: 'publishedProblems',
  demoProblems: 'demoProblems',
} as const;

export type FirestoreCollectionName =
  (typeof FIRESTORE_COLLECTION_NAMES)[keyof typeof FIRESTORE_COLLECTION_NAMES];

export const FIRESTORE_COLLECTION_VISIBILITY: Readonly<
  Record<FirestoreCollectionName, 'internal_only' | 'reserved_public' | 'demo_read_only'>
> = {
  dataSources: 'internal_only',
  sourceObservations: 'internal_only',
  problemClusters: 'internal_only',
  evidenceLinks: 'internal_only',
  researchInsights: 'internal_only',
  opportunityEvaluations: 'internal_only',
  publishedProblems: 'reserved_public',
  demoProblems: 'demo_read_only',
} as const;

export const APPROVED_DEMO_PROBLEM_IDS = [
  'wet-entrance-monsoons',
  'student-nutrition-consistency',
  'excessive-small-delivery-packaging',
] as const;

export type ApprovedDemoProblemId = (typeof APPROVED_DEMO_PROBLEM_IDS)[number];

export const SUPPORTED_PROBLEM_CATEGORIES: readonly QuickExploreCategory[] = [
  'Daily Life',
  'Education',
  'Health',
  'Sustainability',
  'AI & Tech',
] as const;

export const SUPPORTED_TRENDING_TOPICS: readonly TrendingTopic[] = [
  '#studentproductivity',
  '#monsoonessentials',
  '#sustainableliving',
  '#creatortools',
  '#mentalwellness',
] as const;

export const SUPPORTED_ILLUSTRATION_KEYS: readonly OpportunityIllustrationKey[] = [
  'monsoon',
  'nutrition',
  'packaging',
] as const;

export type SourcePermissionReviewStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'suspended';

export type SourceActivationStatus = 'disabled' | 'active';

/**
 * Logical schema for `dataSources` (internal-only collection).
 * New sources default to `disabled`; metadata completeness alone does not establish legal permission.
 */
export interface DataSourceDocument {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceCategory: string;
  readonly permittedAccessMechanism: 'official_api' | 'public_feed' | 'manual_field_notes' | 'dataset_license';
  readonly termsOrLicenceReference: string;
  readonly permissionReviewStatus: SourcePermissionReviewStatus;
  readonly reviewDate: string | null;
  readonly attributionRequirements: string;
  readonly retentionRestrictions: string;
  readonly activationStatus: SourceActivationStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly schemaVersion: number;
}

export type ObservationRemovalStatus = 'active' | 'restricted' | 'removed';

/**
 * Logical schema for `sourceObservations` (internal-only collection).
 * Stores bounded permitted excerpts/summaries and content fingerprints without personal identifiers
 * or full raw scrapes of external discussions.
 */
export interface SourceObservationDocument {
  readonly observationId: string;
  readonly sourceId: string;
  readonly externalReference: string;
  readonly permittedSourceUrl: string | null;
  readonly permittedExcerptOrSummary: string;
  readonly observationTimestamp: string;
  readonly publicationTimestamp: string | null;
  readonly contentFingerprint: string;
  readonly verificationStatus: VerificationStatus;
  readonly provenance: string;
  readonly retentionPolicy: string;
  readonly removalOrRestrictionStatus: ObservationRemovalStatus;
  readonly schemaVersion: number;
}

export type ProblemPublicationStatus =
  | 'draft'
  | 'under_review'
  | 'published'
  | 'withdrawn';

export type ProblemRecurrenceStatus = 'unknown' | 'emerging' | 'recurring';

export type EvidenceAvailabilityState =
  | 'none'
  | 'illustrative_only'
  | 'unverified_only'
  | 'verified';

export const VALID_PUBLICATION_TRANSITIONS: Readonly<
  Record<ProblemPublicationStatus, readonly ProblemPublicationStatus[]>
> = {
  draft: ['under_review', 'withdrawn'],
  under_review: ['draft', 'published', 'withdrawn'],
  published: ['withdrawn'],
  withdrawn: [],
} as const;

/**
 * Logical schema for `problemClusters` (internal-only collection).
 */
export interface ProblemClusterDocument {
  readonly problemId: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly categories: readonly QuickExploreCategory[];
  readonly affectedAudience: readonly string[];
  readonly recurrenceStatus: ProblemRecurrenceStatus;
  readonly recurrenceNote: string;
  readonly evidenceAvailability: EvidenceAvailabilityState;
  readonly researchLimitations: readonly string[];
  readonly publicationStatus: ProblemPublicationStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly schemaVersion: number;
}

export type EvidenceLinkRole = 'supporting' | 'contradictory' | 'contextual';

/**
 * Logical schema for `evidenceLinks` (internal-only collection).
 * Connects problem clusters to observations while supporting deduplication via contentFingerprint.
 */
export interface EvidenceLinkDocument {
  readonly linkId: string;
  readonly problemId: string;
  readonly observationId: string;
  readonly evidenceRole: EvidenceLinkRole;
  readonly contentFingerprint: string;
  readonly verificationStatus: VerificationStatus;
  readonly createdAt: string;
  readonly schemaVersion: number;
}

export type ResearchInsightCategory =
  | 'verified_observation'
  | 'evidence_supported_interpretation'
  | 'hypothesis'
  | 'unknown_information';

export type InsightVerificationOrigin =
  | 'human_verified'
  | 'ai_generated'
  | 'unknown';

/**
 * Logical schema for `researchInsights` (internal-only collection).
 * AI interpretations may never be labeled as verified observations.
 */
export interface ResearchInsightDocument {
  readonly insightId: string;
  readonly problemId: string;
  readonly statement: string;
  readonly insightCategory: ResearchInsightCategory;
  readonly supportingObservationIds: readonly string[];
  readonly verificationOrigin: InsightVerificationOrigin;
  readonly createdAt: string;
  readonly schemaVersion: number;
}

/**
 * Logical schema for `opportunityEvaluations` reusing existing evaluation contracts.
 */
export type OpportunityEvaluationDocument = OpportunityEvaluation & {
  readonly schemaVersion: number;
};

/**
 * Logical schema for `publishedProblems` (reserved for future trusted backend publication).
 * Not populated in Milestone F2.
 */
export interface PublishedProblemDocument {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly categories: readonly QuickExploreCategory[];
  readonly affectedAudience: readonly string[];
  readonly recurrenceNote: string;
  readonly isIllustrativeDemo: false;
  readonly publishedAt: string;
  readonly publicationStatus: 'published';
  readonly verifiedEvidenceCount: number;
  readonly sourceCoverage: number | null;
  readonly lastUpdated: string | null;
  readonly coverageNote: string;
  readonly researchLimitations: readonly string[];
  readonly unknownsAndRisks: readonly string[];
  readonly insights: readonly ProblemInsight[];
  readonly existingAlternatives: readonly ExistingAlternative[];
  readonly schemaVersion: number;
}

/**
 * Public, non-sensitive demonstration document schema stored in `demoProblems`.
 * Strictly limited to the 3 approved illustrative demonstration IDs in Milestone F2.
 */
export interface DemoProblemDocument {
  readonly id: ApprovedDemoProblemId;
  readonly slug: ApprovedDemoProblemId;
  readonly title: string;
  readonly summary: string;
  readonly categoryLabel: string;
  readonly categories: readonly QuickExploreCategory[];
  readonly illustration: OpportunityIllustrationKey;
  readonly tags: readonly TrendingTopic[];
  readonly affectedAudience: readonly string[];
  readonly recurrenceNote: string;
  readonly isIllustrativeDemo: true;
  readonly evidenceAvailability: 'none';
  readonly verifiedEvidenceCount: 0;
  readonly sourceCoverage: null;
  readonly lastUpdated: null;
  readonly coverageNote: string;
  readonly researchLimitations: readonly string[];
  readonly unknownsAndRisks: readonly string[];
  readonly evidence: readonly [];
  readonly insights: readonly [];
  readonly existingAlternatives: readonly [];
  readonly opportunityScore: null;
  readonly schemaVersion: number;
}

export type ValidatedProblemAdapter = {
  readonly problem: Problem;
  readonly opportunity: OpportunityCardItem;
  readonly illustration: OpportunityIllustrationKey;
};

export interface AnticipatedFirestoreIndex {
  readonly collection: FirestoreCollectionName;
  readonly fields: readonly { readonly fieldPath: string; readonly order: 'ASCENDING' | 'DESCENDING' | 'CONTAINS' }[];
  readonly purpose: string;
  readonly deployedInMilestoneF2: false;
}

/**
 * Anticipated composite indexes documented for future backend/query milestones.
 * None are deployed in Milestone F2 because only single-document demoProblems reads are permitted.
 */
export const FIRESTORE_ANTICIPATED_INDEXES: readonly AnticipatedFirestoreIndex[] = [
  {
    collection: 'sourceObservations',
    fields: [
      { fieldPath: 'sourceId', order: 'ASCENDING' },
      { fieldPath: 'removalOrRestrictionStatus', order: 'ASCENDING' },
      { fieldPath: 'observationTimestamp', order: 'DESCENDING' },
    ],
    purpose: 'Backend ingestion deduplication and retention sweeps per approved source.',
    deployedInMilestoneF2: false,
  },
  {
    collection: 'evidenceLinks',
    fields: [
      { fieldPath: 'problemId', order: 'ASCENDING' },
      { fieldPath: 'verificationStatus', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ],
    purpose: 'Backend aggregation of verified supporting vs contradictory links per cluster.',
    deployedInMilestoneF2: false,
  },
  {
    collection: 'problemClusters',
    fields: [
      { fieldPath: 'publicationStatus', order: 'ASCENDING' },
      { fieldPath: 'updatedAt', order: 'DESCENDING' },
    ],
    purpose: 'Editorial review queue ordering for draft and under_review clusters.',
    deployedInMilestoneF2: false,
  },
  {
    collection: 'publishedProblems',
    fields: [
      { fieldPath: 'categories', order: 'CONTAINS' },
      { fieldPath: 'publishedAt', order: 'DESCENDING' },
    ],
    purpose: 'Future filtered listing of verified published problems once approved.',
    deployedInMilestoneF2: false,
  },
] as const;
