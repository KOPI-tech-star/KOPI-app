import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DEMO_PROBLEMS_SEED_MANIFEST } from '../demoSeedManifest';
import { APPROVED_DEMO_PROBLEM_IDS } from '../firestoreContracts';
import {
  FirestoreProblemRepository,
  type FirestoreDocReader,
} from './firestoreProblemRepository';
import { RepositoryError } from './problemRepository';

const ROOT_DIR = path.resolve(import.meta.dirname, '../../..');
const NAMED_DB_ID = 'ai-studio-kopi-6863852d-35ae-4115-97d3-3fcc2fdd6372';
const PROJECT_ID = 'gen-lang-client-0653252950';

function createSeededMockReader(options: {
  overrides?: Record<string, { exists: boolean; data?: unknown }>;
  errorByDocId?: Record<string, unknown>;
  publishedDocs?: readonly { id: string; data: unknown }[];
  publishedQueryError?: unknown;
} = {}): {
  reader: FirestoreDocReader;
  calls: { collectionName: string; documentId: string }[];
} {
  const calls: { collectionName: string; documentId: string }[] = [];
  const seedById = new Map(
    DEMO_PROBLEMS_SEED_MANIFEST.map((entry) => [entry.documentId, entry.data])
  );
  const publishedById = new Map(
    (options.publishedDocs ?? []).map((entry) => [entry.id, entry.data])
  );

  const reader: FirestoreDocReader = {
    projectId: PROJECT_ID,
    databaseId: NAMED_DB_ID,
    async readDocument(collectionName: string, documentId: string) {
      calls.push({ collectionName, documentId });

      if (options.errorByDocId && documentId in options.errorByDocId) {
        throw options.errorByDocId[documentId];
      }

      if (options.overrides && documentId in options.overrides) {
        const override = options.overrides[documentId]!;
        return {
          exists: override.exists,
          id: documentId,
          data: () => override.data,
        };
      }

      if (collectionName === 'publishedProblems') {
        const pub = publishedById.get(documentId);
        return {
          exists: Boolean(pub),
          id: documentId,
          data: () => pub,
        };
      }

      const data = seedById.get(documentId as (typeof APPROVED_DEMO_PROBLEM_IDS)[number]);
      return {
        exists: Boolean(data),
        id: documentId,
        data: () => data,
      };
    },
    async queryPublishedProblems() {
      if (options.publishedQueryError) {
        throw options.publishedQueryError;
      }
      return (options.publishedDocs ?? []).map((entry) => ({
        exists: true,
        id: entry.id,
        data: () => entry.data,
      }));
    },
  };

  return { reader, calls };
}

function buildValidPublishedDoc(id = 'monsoon-drainage-delays') {
  return {
    id,
    slug: id,
    title: 'Blocked storm drains delay retail footfall recovery after heavy rain',
    summary: 'Verified field observations across two municipal wards document recurring standing water at shopfront approaches.',
    categoryLabel: 'Daily Life',
    categories: ['Daily Life'],
    illustration: 'monsoon',
    tags: ['#monsoonessentials'],
    affectedAudience: ['Independent shopkeepers', 'Daily commuters'],
    recurrenceNote: 'Documented across two independent community audit sources during monsoon weeks.',
    isIllustrativeDemo: false,
    publishedAt: '2026-11-26T08:00:00.000Z',
    publicationStatus: 'published',
    verifiedEvidenceCount: 1,
    independentEvidenceCount: 1,
    sourceDiversityCount: 1,
    sourceCoverage: 1,
    geographicalCoverage: ['Pune', 'Kochi'],
    lastUpdated: '2026-11-26T08:00:00.000Z',
    coverageNote: '2 verified observations from 2 independent sources.',
    evidence: [
      {
        id: 'obs-1',
        problemId: id,
        sourceName: 'Civic Drainage Digest',
        sourceType: 'research_publication',
        excerpt: 'Ward 4 shopkeepers reported 3-hour waterlogging after 40mm rainfall.',
        externalUrl: 'https://example.org/civic-digest/ward-4',
        observedDate: '2026-11-20T09:00:00.000Z',
        verificationStatus: 'verified',
      },
    ],
    researchLimitations: ['Limited to urban retail corridors in two cities.'],
    unknownsAndRisks: ['Maintenance budget cycles remain unverified.'],
    insights: [
      {
        id: 'ins-1',
        statement: 'Standing water clears within 4 hours when grate silt traps are cleaned weekly.',
        kind: 'evidence_backed',
        supportingEvidenceIds: ['obs-1'],
      },
    ],
    existingAlternatives: [
      {
        id: 'alt-1',
        name: 'Manual broom sweeping',
        category: 'Manual workaround',
        observedShortcoming: 'Fails when roadside catch basins are blocked.',
        supportingEvidenceIds: ['obs-1'],
      },
    ],
    commercialRelevance: {
      assessedAt: '2026-11-26T07:30:00.000Z',
      overallSummary: 'Qualitative evidence indicates recurring operational disruption with partial cost signals.',
      dimensions: [
        {
          key: 'severity',
          label: 'Problem Severity',
          status: 'supported',
          summary: 'Verified shop closure delays documented.',
          supportingObservationIds: ['obs-1'],
          unresolvedQuestion: null,
        },
        {
          key: 'recurrence',
          label: 'Recurrence & Persistence',
          status: 'supported',
          summary: 'Repeats during seasonal rain events.',
          supportingObservationIds: ['obs-1'],
          unresolvedQuestion: null,
        },
        {
          key: 'customer_clarity',
          label: 'Affected Customer Clarity',
          status: 'supported',
          summary: 'Ground-floor retail tenants are clearly affected.',
          supportingObservationIds: ['obs-1'],
          unresolvedQuestion: null,
        },
        {
          key: 'existing_alternatives',
          label: 'Existing Workarounds & Alternatives',
          status: 'partially_supported',
          summary: 'Manual sweeping is ad hoc.',
          supportingObservationIds: ['obs-1'],
          unresolvedQuestion: 'Municipal contractor SLAs need review.',
        },
        {
          key: 'economic_signals',
          label: 'Economic & Spending Signals',
          status: 'insufficient_evidence',
          summary: 'Revenue impact not yet quantified.',
          supportingObservationIds: [],
          unresolvedQuestion: 'Quantify lost footfall hours.',
        },
        {
          key: 'addressability',
          label: 'Solution Addressability',
          status: 'partially_supported',
          summary: 'Portable threshold barriers and silt traps appear feasible.',
          supportingObservationIds: ['obs-1'],
          unresolvedQuestion: 'Lease modification constraints.',
        },
        {
          key: 'evidence_strength',
          label: 'Evidence Strength & Diversity',
          status: 'supported',
          summary: 'Two independent sources corroborated the issue.',
          supportingObservationIds: ['obs-1'],
          unresolvedQuestion: null,
        },
      ],
    },
    publishedUnderFounderException: false,
    researchOrigin: 'genuine_research',
    schemaVersion: 1,
  };
}

test('Repository enforces non-default named Firestore database target', () => {
  assert.throws(
    () =>
      new FirestoreProblemRepository({
        projectId: PROJECT_ID,
        databaseId: '(default)',
        async readDocument() {
          throw new Error('Should not be called');
        },
      }),
    /named Firestore database/i
  );

  const { reader } = createSeededMockReader();
  const repo = new FirestoreProblemRepository(reader);
  assert.deepEqual(repo.getTargetInfo(), {
    projectId: PROJECT_ID,
    databaseId: NAMED_DB_ID,
  });
});

test('Repository retrieves, validates, deduplicates, and caches all 3 approved demoProblems', async () => {
  const { reader, calls } = createSeededMockReader();
  const repo = new FirestoreProblemRepository(reader);

  // Concurrent calls deduplicate to exactly 3 individual getDoc calls
  const [bundleA, bundleB] = await Promise.all([
    repo.getApprovedDemoProblems(),
    repo.getApprovedDemoProblems(),
  ]);

  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => c.collectionName === 'demoProblems'));
  assert.deepEqual(
    calls.map((c) => c.documentId),
    [...APPROVED_DEMO_PROBLEM_IDS]
  );

  assert.equal(bundleA.source, 'firestore');
  assert.equal(bundleA.problems.length, 3);
  assert.equal(bundleA.opportunities.length, 3);
  assert.deepEqual(bundleA.missingIds, []);
  assert.equal(bundleB.problems.length, 3);

  // Subsequent single-problem lookup reuses cache (0 additional reads)
  const single = await repo.getProblemById('wet-entrance-monsoons');
  assert.ok(single);
  assert.equal(single.problem.id, 'wet-entrance-monsoons');
  assert.equal(calls.length, 3);

  // Explicit forceRefresh executes fresh reads
  await repo.getApprovedDemoProblems({ forceRefresh: true });
  assert.equal(calls.length, 6);
});

test('Repository handles missing documents and checks publishedProblems for non-demo IDs', async () => {
  const { reader, calls } = createSeededMockReader({
    overrides: {
      'student-nutrition-consistency': { exists: false },
    },
  });
  const repo = new FirestoreProblemRepository(reader);

  // Non-demo ID checks publishedProblems once and returns null if absent
  const nonexistent = await repo.getProblemById('unapproved-id');
  assert.equal(nonexistent, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.collectionName, 'publishedProblems');

  // Missing approved demo ID returns null cleanly
  const missingSingle = await repo.getProblemById('student-nutrition-consistency');
  assert.equal(missingSingle, null);
  assert.equal(calls.length, 2);

  // Bundle reports missing ID honestly without silent fallback
  const bundle = await repo.getApprovedDemoProblems({ forceRefresh: true });
  assert.equal(bundle.problems.length, 2);
  assert.deepEqual(bundle.missingIds, ['student-nutrition-consistency']);
});

test('Repository maps permission-denied and offline errors safely without raw Firebase leaks or silent fallback', async () => {
  const permissionErr = Object.assign(
    new Error('7 PERMISSION_DENIED: internal project secret path'),
    { code: 'permission-denied' }
  );
  const { reader: permReader } = createSeededMockReader({
    errorByDocId: { 'wet-entrance-monsoons': permissionErr },
  });
  const permRepo = new FirestoreProblemRepository(permReader);

  await assert.rejects(
    () => permRepo.getApprovedDemoProblems(),
    (err: unknown) => {
      assert.ok(err instanceof RepositoryError);
      assert.equal(err.code, 'permission_denied');
      assert.equal(err.retryable, true);
      assert.doesNotMatch(err.userMessage, /internal project secret path/i);
      return true;
    }
  );

  const offlineErr = Object.assign(
    new Error('Failed to get document because the client is offline.'),
    { code: 'unavailable' }
  );
  const { reader: offlineReader } = createSeededMockReader({
    errorByDocId: { 'wet-entrance-monsoons': offlineErr },
  });
  const offlineRepo = new FirestoreProblemRepository(offlineReader);

  await assert.rejects(
    () => offlineRepo.getProblemById('wet-entrance-monsoons'),
    (err: unknown) => {
      assert.ok(err instanceof RepositoryError);
      assert.equal(err.code, 'unavailable');
      assert.equal(err.retryable, true);
      return true;
    }
  );
});

test('Repository rejects malformed Firestore documents instead of passing invalid data to UI', async () => {
  const { reader } = createSeededMockReader({
    overrides: {
      'wet-entrance-monsoons': {
        exists: true,
        data: {
          id: 'wet-entrance-monsoons',
          title: 'Broken record',
          opportunityScore: 95,
          isIllustrativeDemo: false,
        },
      },
    },
  });
  const repo = new FirestoreProblemRepository(reader);

  await assert.rejects(
    () => repo.getProblemById('wet-entrance-monsoons'),
    (err: unknown) => {
      assert.ok(err instanceof RepositoryError);
      assert.equal(err.code, 'invalid_record');
      return true;
    }
  );
});

test('Repository combines verified publishedProblems with demoProblems and gracefully handles rules_pending permission denial', async () => {
  const publishedDoc = buildValidPublishedDoc('monsoon-drainage-delays');
  const { reader } = createSeededMockReader({
    publishedDocs: [
      { id: 'monsoon-drainage-delays', data: publishedDoc },
      { id: 'malformed-pub-doc', data: { id: 'malformed-pub-doc', isIllustrativeDemo: true } },
    ],
  });
  const repo = new FirestoreProblemRepository(reader);

  const combined = await repo.getCombinedProblemFeed();
  assert.equal(combined.publishedStatus, 'loaded');
  assert.equal(combined.publishedCount, 1);
  assert.equal(combined.demoCount, 3);
  assert.equal(combined.problems.length, 4);
  assert.equal(combined.problems[0]?.id, 'monsoon-drainage-delays');
  assert.equal(combined.problems[0]?.isIllustrativeDemo, false);
  assert.equal(combined.problems[0]?.evidenceCoverage.verifiedCount, 1);

  const singlePublished = await repo.getProblemById('monsoon-drainage-delays');
  assert.ok(singlePublished);
  assert.equal(singlePublished.problem.isIllustrativeDemo, false);
  assert.equal(singlePublished.opportunity.opportunityScore, 'Qualitative review');

  // If deployed rules lock publishedProblems, combined feed preserves live demoProblems honestly
  const { reader: rulesPendingReader } = createSeededMockReader({
    publishedQueryError: Object.assign(
      new Error('7 PERMISSION_DENIED: publishedProblems locked'),
      { code: 'permission-denied' }
    ),
  });
  const pendingRepo = new FirestoreProblemRepository(rulesPendingReader);
  const pendingFeed = await pendingRepo.getCombinedProblemFeed();
  assert.equal(pendingFeed.publishedStatus, 'rules_pending');
  assert.equal(pendingFeed.publishedCount, 0);
  assert.equal(pendingFeed.demoCount, 3);
  assert.equal(pendingFeed.problems.length, 3);

  // If publishedProblems fails due to transient availability/network error while demoProblems load,
  // combined feed surfaces publishedStatus='unavailable' and keeps all 3 demoProblems visible.
  const { reader: unavailablePublishedReader } = createSeededMockReader({
    publishedQueryError: Object.assign(
      new Error('14 UNAVAILABLE: transient publishedProblems read failure'),
      { code: 'unavailable' }
    ),
  });
  const unavailableRepo = new FirestoreProblemRepository(unavailablePublishedReader);
  const unavailableFeed = await unavailableRepo.getCombinedProblemFeed();
  assert.equal(unavailableFeed.publishedStatus, 'unavailable');
  assert.equal(unavailableFeed.publishedCount, 0);
  assert.equal(unavailableFeed.demoCount, 3);
  assert.equal(unavailableFeed.problems.length, 3);
  assert.equal(unavailableFeed.demoProblems.length, 3);

  // When 0 eligible published problems exist, combined feed returns publishedStatus='empty'
  const { reader: emptyPublishedReader } = createSeededMockReader({
    publishedDocs: [],
  });
  const emptyRepo = new FirestoreProblemRepository(emptyPublishedReader);
  const emptyFeed = await emptyRepo.getCombinedProblemFeed();
  assert.equal(emptyFeed.publishedStatus, 'empty');
  assert.equal(emptyFeed.publishedCount, 0);
  assert.equal(emptyFeed.demoCount, 3);
});

test('Candidate Security Rules enforce narrow demo + bounded publishedProblems access and deny all 6 internal collections', () => {
  const candidateRules = fs.readFileSync(
    path.join(ROOT_DIR, 'firestore.candidate.rules'),
    'utf8'
  );

  assert.match(candidateRules, /rules_version\s*=\s*'2'/);
  assert.match(candidateRules, /match\s+\/demoProblems\/\{problemId\}/);
  assert.match(candidateRules, /allow\s+get:\s+if\s+problemId\s+in\s+\[/);
  assert.match(candidateRules, /'wet-entrance-monsoons'/);
  assert.match(candidateRules, /'student-nutrition-consistency'/);
  assert.match(candidateRules, /'excessive-small-delivery-packaging'/);
  assert.match(candidateRules, /allow\s+list,\s*create,\s*update,\s*delete:\s*if\s+false;/);

  assert.match(candidateRules, /match\s+\/publishedProblems\/\{problemId\}/);
  assert.match(candidateRules, /resource\.data\.publicationStatus\s*==\s*'published'/);
  assert.match(candidateRules, /resource\.data\.isIllustrativeDemo\s*==\s*false/);
  assert.match(candidateRules, /request\.query\.limit\s*<=\s*50/);
  assert.match(candidateRules, /allow\s+create,\s*update,\s*delete:\s*if\s+false;/);

  const repoSource = fs.readFileSync(
    path.join(ROOT_DIR, 'src/data/repositories/firestoreProblemRepository.ts'),
    'utf8'
  );
  assert.match(repoSource, /where\('publicationStatus',\s*'==',\s*'published'\)/);
  assert.match(repoSource, /where\('isIllustrativeDemo',\s*'==',\s*false\)/);

  for (const internalCol of [
    'dataSources',
    'sourceObservations',
    'problemClusters',
    'evidenceLinks',
    'researchInsights',
    'opportunityEvaluations',
  ]) {
    assert.match(
      candidateRules,
      new RegExp(`match\\s+\\/${internalCol}\\/\\{docId=\\*\\*\\}[\\s\\S]*?allow\\s+read,\\s*write:\\s*if\\s+false;`)
    );
  }

  assert.doesNotMatch(candidateRules, /allow\s+read,\s*write:\s*if\s+true/);

  // Live deployed rules enforce the Prompt #27 restricted ruleset until approved
  const liveRules = fs.readFileSync(path.join(ROOT_DIR, 'firestore.rules'), 'utf8');
  assert.match(liveRules, /match\s+\/demoProblems\/\{problemId\}/);
  assert.match(liveRules, /allow\s+list,\s*create,\s*update,\s*delete:\s*if\s+false;/);
  assert.match(liveRules, /allow\s+read,\s*write:\s*if\s+false;/);
  assert.doesNotMatch(liveRules, /allow\s+read,\s*write:\s*if\s+true/);
});
