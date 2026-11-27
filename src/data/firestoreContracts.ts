import type {
  OpportunityCardItem,
  OpportunityIllustrationKey,
  QuickExploreCategory,
  TrendingTopic,
} from '../config/opportunityRadar';
import type {
  EvidenceRecord,
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
  users: 'users',
} as const;

export type FirestoreCollectionName =
  (typeof FIRESTORE_COLLECTION_NAMES)[keyof typeof FIRESTORE_COLLECTION_NAMES];

export const FIRESTORE_COLLECTION_VISIBILITY: Readonly<
  Record<
    FirestoreCollectionName,
    'internal_only' | 'reserved_public' | 'demo_read_only' | 'user_private'
  >
> = {
  dataSources: 'internal_only',
  sourceObservations: 'internal_only',
  problemClusters: 'internal_only',
  evidenceLinks: 'internal_only',
  researchInsights: 'internal_only',
  opportunityEvaluations: 'internal_only',
  publishedProblems: 'reserved_public',
  demoProblems: 'demo_read_only',
  users: 'user_private',
} as const;

export const LEGAL_DOCUMENT_VERSIONS = {
  termsVersion: 'draft-2026-11-25-v1',
  privacyPolicyVersion: 'draft-2026-11-25-v1',
} as const;

export type SavedOpportunitySourceScreen =
  | 'opportunity-radar'
  | 'problem-explorer'
  | 'problem-investigation'
  | 'opportunity-evaluation'
  | 'guest-migration';

export interface UserEligibilityRecord {
  readonly isEighteenOrOlderDeclared: true;
  readonly ageVerificationStatus: 'self_declared_unverified';
  readonly declaredAt: string;
}

export interface UserConsentRecords {
  readonly termsAccepted: true;
  readonly termsVersion: string;
  readonly termsAcceptedAt: string;
  readonly privacyPolicyAccepted: true;
  readonly privacyPolicyVersion: string;
  readonly privacyAcceptedAt: string;
}

/**
 * Minimal user profile stored in `users/{uid}`.
 * Intentionally omits unnecessary PII (email, phone, photoURL, address).
 * Self-declared 18+ eligibility is stored explicitly as `self_declared_unverified`.
 */
export interface UserProfileDocument {
  readonly uid: string;
  readonly displayName: string | null;
  readonly eligibility: UserEligibilityRecord;
  readonly consents: UserConsentRecords;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly schemaVersion: number;
}

/**
 * Saved opportunity document stored at `users/{uid}/savedOpportunities/{problemId}`.
 * Keyed by `problemId` to prevent duplicates across approved demo and published problems.
 */
export interface SavedOpportunityDocument {
  readonly problemId: string;
  readonly savedAt: string;
  readonly sourceScreen: SavedOpportunitySourceScreen;
  readonly schemaVersion: number;
}

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

export type SourceAccessMechanism =
  | 'official_api'
  | 'public_feed'
  | 'manual_field_notes'
  | 'dataset_license'
  | 'customer_interview'
  | 'community_submission';

export type ResearchOriginKind = 'genuine_research' | 'synthetic_test_fixture';

/**
 * Logical schema for `dataSources` (internal-only collection).
 * New sources default to `disabled`; metadata completeness alone does not establish legal permission.
 */
export interface DataSourceDocument {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceCategory: string;
  readonly permittedAccessMechanism: SourceAccessMechanism;
  readonly termsOrLicenceReference: string;
  readonly permissionReviewStatus: SourcePermissionReviewStatus;
  readonly reviewDate: string | null;
  readonly attributionRequirements: string;
  readonly retentionRestrictions: string;
  readonly activationStatus: SourceActivationStatus;
  readonly isSyntheticTestFixture?: boolean;
  readonly researchOrigin?: ResearchOriginKind;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly schemaVersion: number;
}

export type ObservationRemovalStatus = 'active' | 'restricted' | 'removed';

/**
 * Logical schema for `sourceObservations` (internal-only collection).
 * Stores evidence atoms with bounded permitted excerpts/summaries and deterministic
 * content fingerprints without personal identifiers or raw scrapes.
 */
export interface SourceObservationDocument {
  readonly observationId: string;
  readonly sourceId: string;
  readonly externalReference: string;
  readonly permittedSourceUrl: string | null;
  readonly canonicalUrl?: string | null;
  readonly permittedExcerptOrSummary: string;
  readonly problemStatement?: string | null;
  readonly context?: string | null;
  readonly affectedCustomerSegment?: string | null;
  readonly reportedConsequences?: string | null;
  readonly existingWorkaround?: string | null;
  readonly spendingOrWtpSignal?: string | null;
  readonly geography?: string | null;
  readonly sourceType?: EvidenceRecord['sourceType'];
  readonly sourceName?: string | null;
  readonly independentGroupKey?: string | null;
  readonly observationTimestamp: string;
  readonly publicationTimestamp: string | null;
  readonly contentFingerprint: string;
  readonly verificationStatus: VerificationStatus;
  readonly provenance: string;
  readonly retentionPolicy: string;
  readonly removalOrRestrictionStatus: ObservationRemovalStatus;
  readonly extractedByAi?: boolean;
  readonly extractionModel?: string | null;
  readonly isSyntheticTestFixture?: boolean;
  readonly researchOrigin?: ResearchOriginKind;
  readonly schemaVersion: number;
}

export type ProblemPublicationStatus =
  | 'draft'
  | 'under_review'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'withdrawn'
  | 'archived';

export type ProblemRecurrenceStatus = 'unknown' | 'emerging' | 'recurring';

export type EvidenceAvailabilityState =
  | 'none'
  | 'illustrative_only'
  | 'unverified_only'
  | 'verified';

export const VALID_PUBLICATION_TRANSITIONS: Readonly<
  Record<ProblemPublicationStatus, readonly ProblemPublicationStatus[]>
> = {
  draft: ['under_review', 'rejected', 'withdrawn'],
  under_review: ['draft', 'approved', 'published', 'rejected', 'withdrawn'],
  approved: ['draft', 'under_review', 'published', 'rejected', 'archived', 'withdrawn'],
  published: ['archived', 'withdrawn'],
  rejected: ['draft'],
  archived: ['draft'],
  withdrawn: [],
} as const;

export type CommercialRelevanceStatus =
  | 'supported'
  | 'partially_supported'
  | 'insufficient_evidence'
  | 'contradicted';

export type CommercialRelevanceDimensionKey =
  | 'severity'
  | 'recurrence'
  | 'customer_clarity'
  | 'existing_alternatives'
  | 'economic_signals'
  | 'addressability'
  | 'evidence_strength';

export interface CommercialRelevanceDimensionAssessment {
  readonly key: CommercialRelevanceDimensionKey;
  readonly label: string;
  readonly status: CommercialRelevanceStatus;
  readonly summary: string;
  readonly supportingObservationIds: readonly string[];
  readonly unresolvedQuestion: string | null;
}

export interface PublicCommercialRelevanceAssessment {
  readonly assessedAt: string;
  readonly overallSummary: string;
  readonly dimensions: readonly CommercialRelevanceDimensionAssessment[];
}

export interface CommercialRelevanceAssessment extends PublicCommercialRelevanceAssessment {
  readonly assessedBy: string;
  readonly founderDecisionNote: string | null;
}

export interface ClusterEvidenceSummary {
  readonly totalObservations: number;
  readonly verifiedCount: number;
  readonly independentRecordCount: number;
  readonly sourceDiversityCount: number;
  readonly sourceIds: readonly string[];
  readonly geographicalCoverage: readonly string[];
  readonly contradictoryCount: number;
  readonly earliestObservedAt: string | null;
  readonly latestObservedAt: string | null;
}

/**
 * Logical schema for `problemClusters` (internal-only collection).
 */
export interface ProblemClusterDocument {
  readonly problemId: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly underlyingNeed?: string;
  readonly context?: string | null;
  readonly categories: readonly QuickExploreCategory[];
  readonly affectedAudience: readonly string[];
  readonly reportedConsequences?: readonly string[];
  readonly existingWorkarounds?: readonly string[];
  readonly existingAlternatives?: readonly ExistingAlternative[];
  readonly recurrenceStatus: ProblemRecurrenceStatus;
  readonly recurrenceNote: string;
  readonly evidenceAvailability: EvidenceAvailabilityState;
  readonly researchLimitations: readonly string[];
  readonly unresolvedQuestions?: readonly string[];
  readonly evidenceSummary?: ClusterEvidenceSummary | null;
  readonly commercialRelevance?: CommercialRelevanceAssessment | null;
  readonly publicationStatus: ProblemPublicationStatus;
  readonly reviewedBy?: string | null;
  readonly reviewedAt?: string | null;
  readonly reviewNotes?: string | null;
  readonly approvedBy?: string | null;
  readonly approvedAt?: string | null;
  readonly publishedAt?: string | null;
  readonly founderExceptionReason?: string | null;
  readonly isSyntheticTestFixture?: boolean;
  readonly researchOrigin?: ResearchOriginKind;
  readonly archivedAt?: string | null;
  readonly archiveReason?: string | null;
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
 * Sanitized public projection for `publishedProblems`.
 * Excludes internal reviewer notes, unverified personal data, and raw restricted excerpts.
 */
export interface PublishedProblemDocument {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly categoryLabel?: string;
  readonly categories: readonly QuickExploreCategory[];
  readonly illustration?: OpportunityIllustrationKey;
  readonly tags?: readonly TrendingTopic[];
  readonly affectedAudience: readonly string[];
  readonly recurrenceNote: string;
  readonly isIllustrativeDemo: false;
  readonly publishedAt: string;
  readonly publicationStatus: 'published' | 'archived';
  readonly verifiedEvidenceCount: number;
  readonly independentEvidenceCount?: number;
  readonly sourceDiversityCount?: number;
  readonly sourceCoverage: number | null;
  readonly geographicalCoverage?: readonly string[];
  readonly lastUpdated: string | null;
  readonly coverageNote: string;
  readonly evidence: readonly EvidenceRecord[];
  readonly researchLimitations: readonly string[];
  readonly unknownsAndRisks: readonly string[];
  readonly insights: readonly ProblemInsight[];
  readonly existingAlternatives: readonly ExistingAlternative[];
  readonly commercialRelevance?: PublicCommercialRelevanceAssessment | null;
  readonly publishedUnderFounderException?: boolean;
  readonly researchOrigin?: 'genuine_research';
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
      { fieldPath: 'publicationStatus', order: 'ASCENDING' },
      { fieldPath: 'isIllustrativeDemo', order: 'ASCENDING' },
    ],
    purpose: 'Public read-only listing enforcing publicationStatus == published and isIllustrativeDemo == false.',
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
