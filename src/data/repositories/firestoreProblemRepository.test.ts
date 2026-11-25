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
} = {}): {
  reader: FirestoreDocReader;
  calls: { collectionName: string; documentId: string }[];
} {
  const calls: { collectionName: string; documentId: string }[] = [];
  const seedById = new Map(
    DEMO_PROBLEMS_SEED_MANIFEST.map((entry) => [entry.documentId, entry.data])
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

      const data = seedById.get(documentId as (typeof APPROVED_DEMO_PROBLEM_IDS)[number]);
      return {
        exists: Boolean(data),
        id: documentId,
        data: () => data,
      };
    },
  };

  return { reader, calls };
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

test('Repository handles missing documents and unapproved IDs without unnecessary Firestore reads', async () => {
  const { reader, calls } = createSeededMockReader({
    overrides: {
      'student-nutrition-consistency': { exists: false },
    },
  });
  const repo = new FirestoreProblemRepository(reader);

  // Unapproved ID fails immediately with 0 Firestore reads
  const unapproved = await repo.getProblemById('unapproved-id');
  assert.equal(unapproved, null);
  assert.equal(calls.length, 0);

  // Missing approved ID returns null cleanly
  const missingSingle = await repo.getProblemById('student-nutrition-consistency');
  assert.equal(missingSingle, null);
  assert.equal(calls.length, 1);

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

test('Candidate Security Rules enforce narrow get-only demo access and deny all internal collections and writes', () => {
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

  for (const internalCol of [
    'dataSources',
    'sourceObservations',
    'problemClusters',
    'evidenceLinks',
    'researchInsights',
    'opportunityEvaluations',
    'publishedProblems',
  ]) {
    assert.match(
      candidateRules,
      new RegExp(`match\\s+\\/${internalCol}\\/\\{docId=\\*\\*\\}[\\s\\S]*?allow\\s+read,\\s*write:\\s*if\\s+false;`)
    );
  }

  assert.doesNotMatch(candidateRules, /allow\s+read,\s*write:\s*if\s+true/);

  // Live deployed rules enforce the exact Milestone F2 restricted ruleset
  const liveRules = fs.readFileSync(path.join(ROOT_DIR, 'firestore.rules'), 'utf8');
  assert.match(liveRules, /match\s+\/demoProblems\/\{problemId\}/);
  assert.match(liveRules, /allow\s+list,\s*create,\s*update,\s*delete:\s*if\s+false;/);
  assert.match(liveRules, /allow\s+read,\s*write:\s*if\s+false;/);
  assert.doesNotMatch(liveRules, /allow\s+read,\s*write:\s*if\s+true/);
});
