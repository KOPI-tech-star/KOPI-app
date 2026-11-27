import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_OPPORTUNITIES } from '../config/opportunityRadar';
import { PROBLEM_RECORDS } from '../config/problemExplorer';
import { createEmptyEvaluation } from '../config/opportunityEvaluation';
import { DEMO_PROBLEMS_SEED_MANIFEST } from './demoSeedManifest';
import {
  APPROVED_DEMO_PROBLEM_IDS,
  FIRESTORE_ANTICIPATED_INDEXES,
  FIRESTORE_COLLECTION_VISIBILITY,
  type EvidenceLinkDocument,
} from './firestoreContracts';
import {
  deduplicateEvidenceLinks,
  isValidPublicationTransition,
  toOpportunityCardItem,
  toProblemDomainModel,
  toPublishedProblemDomainModel,
  validateDataSourceRecord,
  validateDemoProblemDocument,
  validateFirestoreEvaluationRecord,
  validateProblemClusterRecord,
  validatePublishedProblemDocument,
  validateResearchInsightRecord,
  validateSourceObservationRecord,
} from './firestoreValidation';

test('Seed manifest preserves all 3 approved demo IDs and passes runtime validation', () => {
  assert.deepEqual(
    DEMO_PROBLEMS_SEED_MANIFEST.map((entry) => entry.documentId),
    [...APPROVED_DEMO_PROBLEM_IDS]
  );

  for (const entry of DEMO_PROBLEMS_SEED_MANIFEST) {
    assert.equal(entry.collection, 'demoProblems');
    assert.equal(entry.documentPath, `demoProblems/${entry.documentId}`);

    const validation = validateDemoProblemDocument(entry.documentId, entry.data);
    assert.equal(validation.ok, true, validation.errors.join('\n'));
    assert.ok(validation.value);

    assert.equal(validation.value.isIllustrativeDemo, true);
    assert.equal(validation.value.verifiedEvidenceCount, 0);
    assert.equal(validation.value.sourceCoverage, null);
    assert.equal(validation.value.lastUpdated, null);
    assert.equal(validation.value.opportunityScore, null);
    assert.deepEqual(validation.value.evidence, []);
    assert.deepEqual(validation.value.insights, []);
    assert.deepEqual(validation.value.existingAlternatives, []);

    const expectedRadar = DEMO_OPPORTUNITIES.find((o) => o.id === entry.documentId);
    const expectedProblem = PROBLEM_RECORDS.find((p) => p.id === entry.documentId);
    assert.ok(expectedRadar && expectedProblem);

    const adaptedProblem = toProblemDomainModel(validation.value);
    const adaptedCard = toOpportunityCardItem(validation.value);
    assert.equal(adaptedProblem.title, expectedProblem.title);
    assert.equal(adaptedProblem.summary, expectedProblem.summary);
    assert.equal(adaptedCard.title, expectedRadar.title);
    assert.equal(adaptedCard.opportunityScore, 'Not available');
    assert.equal(adaptedCard.evidenceVolume, 'Not available');
  }
});

test('validateDemoProblemDocument rejects invalid IDs, missing fields, unknown-as-zero, fabricated scores, and HTML payloads', () => {
  const validDoc = DEMO_PROBLEMS_SEED_MANIFEST[0]!.data;

  // Unapproved ID rejected
  const unapproved = validateDemoProblemDocument('fabricated-problem-id', validDoc);
  assert.equal(unapproved.ok, false);

  // Unknown-as-zero rejected (sourceCoverage: 0 instead of null)
  const zeroCoverage = validateDemoProblemDocument(validDoc.id, {
    ...validDoc,
    sourceCoverage: 0,
  });
  assert.equal(zeroCoverage.ok, false);

  // Non-zero verified count rejected
  const fakeVerified = validateDemoProblemDocument(validDoc.id, {
    ...validDoc,
    verifiedEvidenceCount: 3,
  });
  assert.equal(fakeVerified.ok, false);

  // Numeric score rejected
  const fakeScore = validateDemoProblemDocument(validDoc.id, {
    ...validDoc,
    opportunityScore: 88,
  });
  assert.equal(fakeScore.ok, false);

  // Missing required field rejected
  const { title: _omitted, ...missingTitle } = validDoc;
  assert.equal(validateDemoProblemDocument(validDoc.id, missingTitle).ok, false);

  // Script/HTML injection rejected
  const htmlInjection = validateDemoProblemDocument(validDoc.id, {
    ...validDoc,
    summary: '<script>alert(1)</script>Malicious summary',
  });
  assert.equal(htmlInjection.ok, false);
});

test('Internal dataSources enforces disabled-by-default and permission review before activation', () => {
  const pendingDisabled = validateDataSourceRecord({
    sourceId: 'src-reddit-01',
    sourceName: 'Sample Forum',
    sourceCategory: 'community_forum',
    permittedAccessMechanism: 'official_api',
    termsOrLicenceReference: 'Pending legal terms review',
    permissionReviewStatus: 'pending_review',
    reviewDate: null,
    attributionRequirements: 'Attribution TBD',
    retentionRestrictions: 'Max 30 days pending review',
    activationStatus: 'disabled',
    createdAt: '2026-11-25T00:00:00.000Z',
    updatedAt: '2026-11-25T00:00:00.000Z',
    schemaVersion: 1,
  });
  assert.equal(pendingDisabled.ok, true);

  // Complete metadata alone without approved permissionReviewStatus cannot be active
  const prematureActive = validateDataSourceRecord({
    sourceId: 'src-reddit-02',
    sourceName: 'Sample Forum',
    sourceCategory: 'community_forum',
    permittedAccessMechanism: 'official_api',
    termsOrLicenceReference: 'API Terms v1',
    permissionReviewStatus: 'pending_review',
    reviewDate: null,
    attributionRequirements: 'Required',
    retentionRestrictions: 'No raw storage',
    activationStatus: 'active',
    createdAt: '2026-11-25T00:00:00.000Z',
    updatedAt: '2026-11-25T00:00:00.000Z',
    schemaVersion: 1,
  });
  assert.equal(prematureActive.ok, false);
});

test('sourceObservations rejects missing source references, unsafe URLs, and restricted/removed records', () => {
  const knownSources = new Set(['src-approved-1']);
  const baseObs = {
    observationId: 'obs-101',
    sourceId: 'src-approved-1',
    externalReference: 'thread-998',
    permittedSourceUrl: 'https://example.org/threads/998',
    permittedExcerptOrSummary: 'Permitted concise summary of recurring issue.',
    observationTimestamp: '2026-11-20T10:00:00.000Z',
    publicationTimestamp: null,
    contentFingerprint: 'sha256-abcdef123456',
    verificationStatus: 'unverified',
    provenance: 'Manual review queue',
    retentionPolicy: 'Delete after 90 days unless verified',
    removalOrRestrictionStatus: 'active',
    schemaVersion: 1,
  };

  assert.equal(validateSourceObservationRecord(baseObs, knownSources).ok, true);

  // Missing sourceId reference
  assert.equal(
    validateSourceObservationRecord(
      { ...baseObs, sourceId: 'src-unknown' },
      knownSources
    ).ok,
    false
  );

  // Unsafe javascript: URL rejected
  assert.equal(
    validateSourceObservationRecord(
      { ...baseObs, permittedSourceUrl: 'javascript:alert(1)' },
      knownSources
    ).ok,
    false
  );

  // Restricted or removed records rejected
  assert.equal(
    validateSourceObservationRecord(
      { ...baseObs, removalOrRestrictionStatus: 'removed' },
      knownSources
    ).ok,
    false
  );
});

test('deduplicateEvidenceLinks prevents duplicate observations or identical fingerprints from inflating counts', () => {
  const validObsIds = new Set(['obs-1', 'obs-2']);
  const links: EvidenceLinkDocument[] = [
    {
      linkId: 'link-1',
      problemId: 'wet-entrance-monsoons',
      observationId: 'obs-1',
      evidenceRole: 'supporting',
      contentFingerprint: 'fp-same',
      verificationStatus: 'verified',
      createdAt: '2026-11-25T00:00:00.000Z',
      schemaVersion: 1,
    },
    {
      linkId: 'link-2',
      problemId: 'wet-entrance-monsoons',
      observationId: 'obs-1', // duplicate observationId
      evidenceRole: 'supporting',
      contentFingerprint: 'fp-same',
      verificationStatus: 'verified',
      createdAt: '2026-11-25T00:00:01.000Z',
      schemaVersion: 1,
    },
    {
      linkId: 'link-3',
      problemId: 'wet-entrance-monsoons',
      observationId: 'obs-2',
      evidenceRole: 'contradictory',
      contentFingerprint: 'fp-same', // duplicate fingerprint
      verificationStatus: 'verified',
      createdAt: '2026-11-25T00:00:02.000Z',
      schemaVersion: 1,
    },
  ];

  const deduped = deduplicateEvidenceLinks(links, validObsIds);
  assert.equal(deduped.uniqueLinks.length, 1);
  assert.equal(deduped.duplicateCount, 2);
  assert.equal(deduped.invalidReferenceErrors.length, 0);
});

test('researchInsights blocks AI interpretations from claiming verified_observation', () => {
  const verifiedObs = new Set(['obs-verified-1']);

  const aiEscalation = validateResearchInsightRecord(
    {
      insightId: 'ins-1',
      problemId: 'wet-entrance-monsoons',
      statement: 'AI summary claimed as verified fact',
      insightCategory: 'verified_observation',
      supportingObservationIds: ['obs-verified-1'],
      verificationOrigin: 'ai_generated',
      createdAt: '2026-11-25T00:00:00.000Z',
      schemaVersion: 1,
    },
    verifiedObs
  );
  assert.equal(aiEscalation.ok, false);

  const validHypothesis = validateResearchInsightRecord(
    {
      insightId: 'ins-2',
      problemId: 'wet-entrance-monsoons',
      statement: 'Preliminary hypothesis pending primary verification.',
      insightCategory: 'hypothesis',
      supportingObservationIds: [],
      verificationOrigin: 'ai_generated',
      createdAt: '2026-11-25T00:00:00.000Z',
      schemaVersion: 1,
    },
    verifiedObs
  );
  assert.equal(validHypothesis.ok, true);
});

test('problemClusters validates publication transitions and blocks invalid published or withdrawn states', () => {
  assert.equal(isValidPublicationTransition('draft', 'under_review'), true);
  assert.equal(isValidPublicationTransition('draft', 'published'), false);
  assert.equal(isValidPublicationTransition('under_review', 'published'), true);
  assert.equal(isValidPublicationTransition('withdrawn', 'published'), false);

  const unverifiedPublished = validateProblemClusterRecord({
    problemId: 'cluster-1',
    slug: 'cluster-1',
    title: 'Sample Cluster',
    summary: 'Summary text',
    categories: ['Daily Life'],
    affectedAudience: ['Renters'],
    recurrenceStatus: 'unknown',
    recurrenceNote: 'Not available',
    evidenceAvailability: 'none',
    researchLimitations: ['No verified observations'],
    publicationStatus: 'published',
    createdAt: '2026-11-25T00:00:00.000Z',
    updatedAt: '2026-11-25T00:00:00.000Z',
    schemaVersion: 1,
  });
  assert.equal(unverifiedPublished.ok, false);
});

test('opportunityEvaluations validator reuses evaluation contracts and blocks unapproved scores', () => {
  const demoProblem = PROBLEM_RECORDS[0]!;
  const emptyEval = createEmptyEvaluation(demoProblem);
  assert.equal(validateFirestoreEvaluationRecord(emptyEval, demoProblem).ok, true);

  const forgedScoreEval = {
    ...emptyEval,
    overallScore: 76,
    scoreMethodologyVersion: 'v1-unapproved',
  };
  assert.equal(validateFirestoreEvaluationRecord(forgedScoreEval, demoProblem).ok, false);
});

test('Collection visibility and anticipated index invariants separate internal from public demo data', () => {
  assert.equal(FIRESTORE_COLLECTION_VISIBILITY.demoProblems, 'demo_read_only');
  assert.equal(FIRESTORE_COLLECTION_VISIBILITY.publishedProblems, 'reserved_public');
  assert.equal(FIRESTORE_COLLECTION_VISIBILITY.dataSources, 'internal_only');
  assert.equal(FIRESTORE_COLLECTION_VISIBILITY.sourceObservations, 'internal_only');
  assert.equal(FIRESTORE_COLLECTION_VISIBILITY.problemClusters, 'internal_only');
  assert.equal(FIRESTORE_COLLECTION_VISIBILITY.evidenceLinks, 'internal_only');
  assert.equal(FIRESTORE_COLLECTION_VISIBILITY.researchInsights, 'internal_only');
  assert.equal(FIRESTORE_COLLECTION_VISIBILITY.opportunityEvaluations, 'internal_only');
  assert.ok(FIRESTORE_ANTICIPATED_INDEXES.every((idx) => idx.deployedInMilestoneF2 === false));
});

test('validatePublishedProblemDocument enforces public commercialRelevance separation, neutral founder disclosure, and rejects synthetic provenance', () => {
  const validPublished = {
    id: 'clean-water-monitoring',
    slug: 'clean-water-monitoring',
    title: 'Small clinics lack continuous cold-chain alerts',
    summary: 'Verified field reports show rural primary clinics lose vaccines during overnight outages.',
    categoryLabel: 'Daily Life',
    categories: ['Daily Life'],
    affectedAudience: ['Rural clinic pharmacists'],
    recurrenceNote: 'Documented across verified field inspection logs.',
    isIllustrativeDemo: false,
    publishedAt: '2026-11-26T08:00:00.000Z',
    publicationStatus: 'published',
    verifiedEvidenceCount: 1,
    independentEvidenceCount: 1,
    sourceDiversityCount: 1,
    sourceCoverage: 1,
    geographicalCoverage: ['Assam'],
    lastUpdated: '2026-11-26T08:00:00.000Z',
    coverageNote: 'Published under a documented founder exception with 1 verified observation(s) across 1 distinct source(s).',
    evidence: [
      {
        id: 'obs-clinic-1',
        problemId: 'clean-water-monitoring',
        sourceName: 'Public Health Audit',
        sourceType: 'research_publication',
        excerpt: 'Clinics recorded overnight temperature excursions.',
        externalUrl: 'https://example.org/clinic-1',
        observedDate: '2026-11-20T09:00:00.000Z',
        verificationStatus: 'verified',
      },
    ],
    researchLimitations: ['Covers a single district inspection window.'],
    unknownsAndRisks: ['Maintenance contractor response SLAs remain unverified.'],
    insights: [],
    existingAlternatives: [],
    commercialRelevance: {
      assessedAt: '2026-11-26T07:30:00.000Z',
      overallSummary: 'Operational disruption is supported by verified evidence; economic signals require further validation.',
      dimensions: [
        {
          key: 'severity',
          label: 'Problem Severity',
          status: 'supported',
          summary: 'Verified vaccine spoilage risk.',
          supportingObservationIds: ['obs-clinic-1'],
          unresolvedQuestion: null,
        },
      ],
    },
    publishedUnderFounderException: true,
    researchOrigin: 'genuine_research',
    schemaVersion: 1,
  };

  const validRes = validatePublishedProblemDocument('clean-water-monitoring', validPublished);
  assert.equal(validRes.ok, true, validRes.errors.join('; '));
  assert.ok(validRes.value);
  assert.equal(validRes.value.publishedUnderFounderException, true);
  assert.equal(validRes.value.researchOrigin, 'genuine_research');
  assert.equal('assessedBy' in (validRes.value.commercialRelevance ?? {}), false);
  assert.equal('founderDecisionNote' in (validRes.value.commercialRelevance ?? {}), false);

  const domainModel = toPublishedProblemDomainModel(validRes.value);
  assert.equal(domainModel.publishedUnderFounderException, true);

  // Reject private assessor/notes inside nested commercialRelevance
  const leakedNested = validatePublishedProblemDocument('clean-water-monitoring', {
    ...validPublished,
    commercialRelevance: {
      ...validPublished.commercialRelevance,
      assessedBy: 'operator-123',
      founderDecisionNote: 'Internal launch note',
    },
  });
  assert.equal(leakedNested.ok, false);

  // Reject top-level founderExceptionNote or founderExceptionReason
  const leakedTop = validatePublishedProblemDocument('clean-water-monitoring', {
    ...validPublished,
    founderExceptionReason: 'Private reason',
  });
  assert.equal(leakedTop.ok, false);

  // Reject synthetic test fixture provenance on publishedProblems
  const syntheticPub = validatePublishedProblemDocument('clean-water-monitoring', {
    ...validPublished,
    isSyntheticTestFixture: true,
    researchOrigin: 'synthetic_test_fixture',
  });
  assert.equal(syntheticPub.ok, false);
});
