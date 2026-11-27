import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEMO_PROBLEMS_SEED_MANIFEST } from '../../src/data/demoSeedManifest';
import type { FirestoreCollectionName } from '../../src/data/firestoreContracts';
import {
  initializeFirebaseAdminFirestore,
  inspectKeylessAdcEnvironment,
  loadFirebaseAdminTargetConfig,
  type AdminDocumentSnapshot,
  type AdminFirestoreStore,
  type RuntimeIdentityInspection,
} from './firebaseAdminClient';
import {
  buildDemoSeedRecords,
  executeIngestionPlan,
  parseIngestionPayload,
  verifyDemoSeedReadOnly,
} from './ingestionCore';
import { parseCliArgs, runAdminCli } from './cli';

interface InMemoryStoreHandle {
  readonly store: AdminFirestoreStore;
  readonly createCalls: number;
  readonly updateCalls: number;
  dumpCollection(collection: FirestoreCollectionName): Record<string, Record<string, unknown>>;
  setRawForTest(
    collection: FirestoreCollectionName,
    documentId: string,
    data: Record<string, unknown>
  ): void;
}

function createInMemoryAdminStore(options: {
  corruptNextReadBack?: boolean;
  mutateBeforeTransaction?: (
    setRaw: (
      collection: FirestoreCollectionName,
      documentId: string,
      data: Record<string, unknown>
    ) => void
  ) => void;
} = {}): InMemoryStoreHandle {
  const db = new Map<string, Map<string, { updateTimeMs: number; data: Record<string, unknown> }>>();
  let createCalls = 0;
  let updateCalls = 0;
  let clockMs = 1700000000000;
  let shouldCorruptReadBack = Boolean(options.corruptNextReadBack);
  let preTxMutation = options.mutateBeforeTransaction;

  function getCollMap(collection: FirestoreCollectionName) {
    let map = db.get(collection);
    if (!map) {
      map = new Map();
      db.set(collection, map);
    }
    return map;
  }

  function setRaw(
    collection: FirestoreCollectionName,
    documentId: string,
    data: Record<string, unknown>
  ) {
    clockMs += 1;
    getCollMap(collection).set(documentId, {
      updateTimeMs: clockMs,
      data: JSON.parse(JSON.stringify(data)) as Record<string, unknown>,
    });
  }

  const store: AdminFirestoreStore = {
    projectId: 'gen-lang-client-0653252950',
    databaseId: 'ai-studio-kopi-6863852d-35ae-4115-97d3-3fcc2fdd6372',

    async getDocument(collection, documentId): Promise<AdminDocumentSnapshot> {
      const existing = getCollMap(collection).get(documentId);
      if (!existing) {
        return { exists: false, id: documentId, updateTimeMs: null, data: null };
      }
      const clone = JSON.parse(JSON.stringify(existing.data)) as Record<string, unknown>;
      if (shouldCorruptReadBack && createCalls + updateCalls > 0) {
        shouldCorruptReadBack = false;
        clone.verifiedEvidenceCount = 999;
      }
      return {
        exists: true,
        id: documentId,
        updateTimeMs: existing.updateTimeMs,
        data: clone,
      };
    },

    async listDocuments(collection, listOpts) {
      const limit = listOpts?.limit ?? 1000;
      const entries = Array.from(getCollMap(collection).entries()).slice(0, limit);
      return entries.map(([id, entry]) => ({
        exists: true,
        id,
        updateTimeMs: entry.updateTimeMs,
        data: JSON.parse(JSON.stringify(entry.data)) as Record<string, unknown>,
      }));
    },

    async createDocument(collection, documentId, data) {
      const coll = getCollMap(collection);
      if (coll.has(documentId)) {
        throw new Error(`ALREADY_EXISTS: ${collection}/${documentId}`);
      }
      createCalls += 1;
      setRaw(collection, documentId, data);
    },

    async updateDocument(collection, documentId, data, expectedUpdateTimeMs) {
      const coll = getCollMap(collection);
      const existing = coll.get(documentId);
      if (!existing) {
        throw new Error(`CONCURRENT_MODIFICATION_CONFLICT: missing ${collection}/${documentId}`);
      }
      if (
        expectedUpdateTimeMs !== undefined &&
        expectedUpdateTimeMs !== null &&
        existing.updateTimeMs !== expectedUpdateTimeMs
      ) {
        throw new Error(`CONCURRENT_MODIFICATION_CONFLICT: stale ${collection}/${documentId}`);
      }
      updateCalls += 1;
      setRaw(collection, documentId, data);
    },

    async runTransaction(fn) {
      if (preTxMutation) {
        const fnToRun = preTxMutation;
        preTxMutation = undefined;
        fnToRun(setRaw);
      }

      const stagedOps: Array<
        | { kind: 'create'; collection: FirestoreCollectionName; documentId: string; data: Record<string, unknown> }
        | { kind: 'update'; collection: FirestoreCollectionName; documentId: string; data: Record<string, unknown> }
      > = [];

      const txStore = {
        async getDocument(collection: FirestoreCollectionName, documentId: string) {
          return store.getDocument(collection, documentId);
        },
        createDocument(
          collection: FirestoreCollectionName,
          documentId: string,
          data: Record<string, unknown>
        ) {
          stagedOps.push({ kind: 'create', collection, documentId, data });
        },
        updateDocument(
          collection: FirestoreCollectionName,
          documentId: string,
          data: Record<string, unknown>
        ) {
          stagedOps.push({ kind: 'update', collection, documentId, data });
        },
      };

      const result = await fn(txStore);
      // Commit staged ops atomically only if fn succeeded without throwing.
      for (const op of stagedOps) {
        if (op.kind === 'create') {
          await store.createDocument(op.collection, op.documentId, op.data);
        } else {
          await store.updateDocument(op.collection, op.documentId, op.data);
        }
      }
      return result;
    },
  };

  return {
    store,
    get createCalls() {
      return createCalls;
    },
    get updateCalls() {
      return updateCalls;
    },
    dumpCollection(collection) {
      const out: Record<string, Record<string, unknown>> = {};
      for (const [k, v] of getCollMap(collection).entries()) {
        out[k] = JSON.parse(JSON.stringify(v.data)) as Record<string, unknown>;
      }
      return out;
    },
    setRawForTest(collection, documentId, data) {
      setRaw(collection, documentId, data);
    },
  };
}

function fakeOperatorIdentity(): RuntimeIdentityInspection {
  return {
    adcKind: 'impersonated_service_account',
    adcFilePath: '/tmp/fake-impersonated-adc.json',
    impersonatedServiceAccount:
      'kopi-db-admin@gen-lang-client-0653252950.iam.gserviceaccount.com',
    quotaProjectId: 'gen-lang-client-0653252950',
    isSharedSandboxRuntime: false,
    sandboxAccountEmail: null,
  };
}

function withTempDir(fn: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kopi-admin-test-'));
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });
}

test('target config enforces existing project and non-default named Firestore database', () => {
  const target = loadFirebaseAdminTargetConfig();
  assert.equal(target.projectId, 'gen-lang-client-0653252950');
  assert.equal(
    target.databaseId,
    'ai-studio-kopi-6863852d-35ae-4115-97d3-3fcc2fdd6372'
  );

  assert.throws(() => {
    loadFirebaseAdminTargetConfig({
      projectId: 'gen-lang-client-0653252950',
      databaseId: '(default)',
    });
  }, /\(default\)/);
});

test('keyless ADC guard accepts impersonated ADC and rejects static private-key JSON and shared sandbox runtime', async () => {
  await withTempDir((dir) => {
    const impersonatedPath = path.join(dir, 'impersonated.json');
    fs.writeFileSync(
      impersonatedPath,
      JSON.stringify({
        type: 'impersonated_service_account',
        service_account_impersonation_url:
          'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/kopi-db-admin@gen-lang-client-0653252950.iam.gserviceaccount.com:generateAccessToken',
        quota_project_id: 'gen-lang-client-0653252950',
      }),
      'utf8'
    );

    const inspected = inspectKeylessAdcEnvironment({
      GOOGLE_APPLICATION_CREDENTIALS: impersonatedPath,
    });
    assert.equal(inspected.adcKind, 'impersonated_service_account');
    assert.equal(
      inspected.impersonatedServiceAccount,
      'kopi-db-admin@gen-lang-client-0653252950.iam.gserviceaccount.com'
    );
    assert.equal(inspected.isSharedSandboxRuntime, false);

    const staticKeyPath = path.join(dir, 'static-sa-key.json');
    fs.writeFileSync(
      staticKeyPath,
      JSON.stringify({
        type: 'service_account',
        project_id: 'gen-lang-client-0653252950',
        private_key: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n',
      }),
      'utf8'
    );

    assert.throws(() => {
      inspectKeylessAdcEnvironment({
        GOOGLE_APPLICATION_CREDENTIALS: staticKeyPath,
      });
    }, /Static service account key files are prohibited/);

    const sandboxInspection = inspectKeylessAdcEnvironment({
      AUTHORIZED_SERVICE_ACCOUNT_EMAIL:
        'ais-sandbox@ais-asia-southeast1-c44dd0c7a0.iam.gserviceaccount.com',
      CLOUDSDK_CONFIG: path.join(dir, 'nonexistent-gcloud'),
    });
    assert.equal(sandboxInspection.isSharedSandboxRuntime, true);

    assert.throws(() => {
      const prevConfig = process.env.CLOUDSDK_CONFIG;
      const prevGac = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const prevSandbox = process.env.AUTHORIZED_SERVICE_ACCOUNT_EMAIL;
      process.env.CLOUDSDK_CONFIG = path.join(dir, 'nonexistent-gcloud');
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      process.env.AUTHORIZED_SERVICE_ACCOUNT_EMAIL =
        'ais-sandbox@ais-asia-southeast1-c44dd0c7a0.iam.gserviceaccount.com';
      try {
        initializeFirebaseAdminFirestore();
      } finally {
        if (prevConfig === undefined) delete process.env.CLOUDSDK_CONFIG;
        else process.env.CLOUDSDK_CONFIG = prevConfig;
        if (prevGac === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
        else process.env.GOOGLE_APPLICATION_CREDENTIALS = prevGac;
        if (prevSandbox === undefined)
          delete process.env.AUTHORIZED_SERVICE_ACCOUNT_EMAIL;
        else process.env.AUTHORIZED_SERVICE_ACCOUNT_EMAIL = prevSandbox;
      }
    }, /shared sandbox identity/);
  });
});

test('read-only demo verification succeeds when all 3 manifest documents match and fails on mismatch', async () => {
  const mem = createInMemoryAdminStore();
  for (const entry of DEMO_PROBLEMS_SEED_MANIFEST) {
    mem.setRawForTest(
      entry.collection,
      entry.documentId,
      entry.data as unknown as Record<string, unknown>
    );
  }

  const okReport = await verifyDemoSeedReadOnly(mem.store);
  assert.equal(okReport.allValidAndMatching, true);
  assert.equal(okReport.items.length, 3);
  assert.equal(mem.createCalls, 0);
  assert.equal(mem.updateCalls, 0);

  mem.setRawForTest('demoProblems', 'wet-entrance-monsoons', {
    ...(DEMO_PROBLEMS_SEED_MANIFEST[0].data as unknown as Record<string, unknown>),
    title: 'Modified title causing discrepancy',
  });

  const mismatchReport = await verifyDemoSeedReadOnly(mem.store);
  assert.equal(mismatchReport.allValidAndMatching, false);
  assert.deepEqual(mismatchReport.items[0].changedFields, ['title']);
});

test('idempotent demo seeding creates missing records, verifies writes, and skips unchanged records on repeat runs', async () => {
  const mem = createInMemoryAdminStore();
  const records = buildDemoSeedRecords();

  const dryRun = await executeIngestionPlan(mem.store, records, {
    mode: 'dry-run',
    approved: false,
  });
  assert.equal(dryRun.validationPassed, true);
  assert.equal(dryRun.summary.create, 3);
  assert.equal(mem.createCalls, 0);

  const unapprovedApply = await executeIngestionPlan(mem.store, records, {
    mode: 'apply',
    approved: false,
  });
  assert.match(unapprovedApply.blockedReason ?? '', /approval is required/i);
  assert.equal(mem.createCalls, 0);

  const firstApply = await executeIngestionPlan(mem.store, records, {
    mode: 'apply',
    approved: true,
  });
  assert.equal(firstApply.blockedReason, null);
  assert.equal(firstApply.summary.appliedCreates, 3);
  assert.equal(firstApply.summary.verifiedWrites, 3);
  assert.equal(mem.createCalls, 3);

  const repeatApply = await executeIngestionPlan(mem.store, records, {
    mode: 'apply',
    approved: true,
  });
  assert.equal(repeatApply.blockedReason, null);
  assert.equal(repeatApply.summary.unchanged, 3);
  assert.equal(repeatApply.summary.appliedCreates, 0);
  assert.equal(repeatApply.summary.appliedUpdates, 0);
  assert.equal(mem.createCalls, 3);
  assert.equal(mem.updateCalls, 0);
});

test('conflict detection prevents silent overwrites and requires explicit confirmation for updates', async () => {
  const mem = createInMemoryAdminStore();
  const records = buildDemoSeedRecords();

  mem.setRawForTest('demoProblems', 'wet-entrance-monsoons', {
    ...(DEMO_PROBLEMS_SEED_MANIFEST[0].data as unknown as Record<string, unknown>),
    title: 'Founder-edited existing title',
  });

  const abortResult = await executeIngestionPlan(mem.store, records, {
    mode: 'apply',
    approved: true,
    conflictPolicy: 'abort',
  });
  assert.match(abortResult.blockedReason ?? '', /conflicting existing document/i);
  assert.equal(mem.createCalls, 0);
  assert.equal(mem.updateCalls, 0);

  const skipResult = await executeIngestionPlan(mem.store, records, {
    mode: 'apply',
    approved: true,
    conflictPolicy: 'skip',
  });
  assert.equal(skipResult.blockedReason, null);
  assert.equal(skipResult.summary.appliedCreates, 2);
  assert.equal(skipResult.summary.skippedConflicts, 1);
  assert.equal(mem.updateCalls, 0);
  assert.equal(
    mem.dumpCollection('demoProblems')['wet-entrance-monsoons'].title,
    'Founder-edited existing title'
  );

  const unconfirmedOverwrite = await executeIngestionPlan(mem.store, records, {
    mode: 'apply',
    approved: true,
    conflictPolicy: 'overwrite',
    approvedOverwritePaths: [],
  });
  assert.match(unconfirmedOverwrite.blockedReason ?? '', /--confirm-overwrite/);
  assert.equal(mem.updateCalls, 0);

  const confirmedOverwrite = await executeIngestionPlan(mem.store, records, {
    mode: 'apply',
    approved: true,
    conflictPolicy: 'overwrite',
    approvedOverwritePaths: ['demoProblems/wet-entrance-monsoons'],
  });
  assert.equal(confirmedOverwrite.blockedReason, null);
  assert.equal(confirmedOverwrite.summary.appliedUpdates, 1);
  assert.equal(mem.updateCalls, 1);
});

test('CLI blocks deletion flags and enforces validation, interactive approval, and post-write verification', async () => {
  assert.throws(() => parseCliArgs(['ingest', '--file', 'x.json', '--delete']), /deletion/i);
  assert.equal('deleteDocument' in createInMemoryAdminStore().store, false);

  await withTempDir(async (dir) => {
    const validFixturePath = path.join(dir, 'isolated-research.json');
    fs.writeFileSync(
      validFixturePath,
      JSON.stringify([
        {
          collection: 'dataSources',
          documentId: 'public_civic_portal_sample',
          data: {
            sourceId: 'public_civic_portal_sample',
            sourceName: 'Public Civic Grievance Sample',
            sourceCategory: 'civic_feedback',
            permittedAccessMechanism: 'official_api',
            termsOrLicenceReference: 'CC-BY-4.0 Open Civic Data Terms',
            permissionReviewStatus: 'approved',
            reviewDate: '2026-11-20T00:00:00.000Z',
            attributionRequirements: 'Cite municipal open data feed.',
            retentionRestrictions: 'Aggregate non-PII excerpts only; 90-day purge review.',
            activationStatus: 'active',
            createdAt: '2026-11-20T00:00:00.000Z',
            updatedAt: '2026-11-20T00:00:00.000Z',
            schemaVersion: 1,
          },
        },
        {
          collection: 'sourceObservations',
          documentId: 'obs_monsoon_001',
          data: {
            observationId: 'obs_monsoon_001',
            sourceId: 'public_civic_portal_sample',
            externalReference: 'civic-ticket-2026-11',
            permittedSourceUrl: 'https://example.org/civic-report/11',
            permittedExcerptOrSummary:
              'Apartment caretakers report recurring slippery lobby marble during heavy monsoon showers.',
            observationTimestamp: '2026-11-21T08:00:00.000Z',
            publicationTimestamp: '2026-11-21T09:00:00.000Z',
            contentFingerprint: 'sha256-sample-fingerprint-001',
            verificationStatus: 'verified',
            provenance: 'official_api:civic_feedback',
            retentionPolicy: '90d_non_pii_summary',
            removalOrRestrictionStatus: 'active',
            schemaVersion: 1,
          },
        },
        {
          collection: 'problemClusters',
          documentId: 'cluster_wet_entrances',
          data: {
            problemId: 'cluster_wet_entrances',
            slug: 'cluster-wet-entrances',
            title: 'Slippery building entrances during monsoon commutes',
            summary: 'Recurring lobby safety hazard across apartments and clinics.',
            categories: ['Daily Life'],
            affectedAudience: ['Building facility managers', 'Daily commuters'],
            recurrenceStatus: 'recurring',
            recurrenceNote: 'Observed annually during rainy months.',
            evidenceAvailability: 'verified',
            researchLimitations: ['Limited to municipal sample records.'],
            publicationStatus: 'under_review',
            createdAt: '2026-11-21T10:00:00.000Z',
            updatedAt: '2026-11-21T10:00:00.000Z',
            schemaVersion: 1,
          },
        },
        {
          collection: 'evidenceLinks',
          documentId: 'link_monsoon_001',
          data: {
            linkId: 'link_monsoon_001',
            problemId: 'cluster_wet_entrances',
            observationId: 'obs_monsoon_001',
            evidenceRole: 'supporting',
            contentFingerprint: 'sha256-sample-fingerprint-001',
            verificationStatus: 'verified',
            createdAt: '2026-11-21T10:05:00.000Z',
            schemaVersion: 1,
          },
        },
      ]),
      'utf8'
    );

    const mem = createInMemoryAdminStore();
    const outLines: string[] = [];
    const errLines: string[] = [];

    const dryExit = await runAdminCli(
      ['ingest', '--file', validFixturePath, '--dry-run', '--json'],
      {
        initStore: () => ({ store: mem.store, identity: fakeOperatorIdentity() }),
        stdout: (line) => outLines.push(line),
        stderr: (line) => errLines.push(line),
      }
    );
    assert.equal(dryExit, 0);
    assert.equal(mem.createCalls, 0);

    const declinedExit = await runAdminCli(
      ['ingest', '--file', validFixturePath, '--apply'],
      {
        initStore: () => ({ store: mem.store, identity: fakeOperatorIdentity() }),
        promptApproval: async () => false,
        stdout: (line) => outLines.push(line),
        stderr: (line) => errLines.push(line),
      }
    );
    assert.equal(declinedExit, 1);
    assert.equal(mem.createCalls, 0);

    const approvedExit = await runAdminCli(
      ['ingest', '--file', validFixturePath, '--apply', '--approve', '--json'],
      {
        initStore: () => ({ store: mem.store, identity: fakeOperatorIdentity() }),
        stdout: (line) => outLines.push(line),
        stderr: (line) => errLines.push(line),
      }
    );
    assert.equal(approvedExit, 0);
    assert.equal(mem.createCalls, 4);
    assert.equal(
      mem.dumpCollection('dataSources')['public_civic_portal_sample'].sourceName,
      'Public Civic Grievance Sample'
    );

    // Invalid payload (AI insight masquerading as verified_observation) must fail before any write
    const badFixturePath = path.join(dir, 'invalid-ai-claim.json');
    fs.writeFileSync(
      badFixturePath,
      JSON.stringify([
        {
          collection: 'researchInsights',
          documentId: 'bad_ai_insight',
          data: {
            insightId: 'bad_ai_insight',
            problemId: 'cluster_wet_entrances',
            statement: 'Fabricated verified observation from LLM',
            insightCategory: 'verified_observation',
            supportingObservationIds: ['obs_monsoon_001'],
            verificationOrigin: 'ai_generated',
            createdAt: '2026-11-21T12:00:00.000Z',
            schemaVersion: 1,
          },
        },
      ]),
      'utf8'
    );

    const badExit = await runAdminCli(
      ['ingest', '--file', badFixturePath, '--apply', '--approve'],
      {
        initStore: () => ({ store: mem.store, identity: fakeOperatorIdentity() }),
        stdout: (line) => outLines.push(line),
        stderr: (line) => errLines.push(line),
      }
    );
    assert.equal(badExit, 1);
    assert.equal(mem.createCalls, 4);

    // Post-write integrity failure detection when read-back returns corrupted doc
    const corruptMem = createInMemoryAdminStore({ corruptNextReadBack: true });
    const corruptReport = await executeIngestionPlan(
      corruptMem.store,
      [buildDemoSeedRecords()[0]],
      { mode: 'apply', approved: true }
    );
    assert.match(corruptReport.blockedReason ?? '', /Post-write integrity verification failed/i);
    assert.equal(corruptReport.postWriteVerification[0].ok, false);
  });
});

test('parseIngestionPayload rejects invalid shapes and supports grouped collection envelope', () => {
  const grouped = parseIngestionPayload({
    collection: 'dataSources',
    records: [
      {
        documentId: 'source_1',
        data: { sourceId: 'source_1' },
      },
    ],
  });
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].collection, 'dataSources');

  assert.throws(() => parseIngestionPayload({ records: [] }), /zero records/i);
  assert.throws(
    () =>
      parseIngestionPayload([
        { collection: 'unknownCollection', documentId: 'abc', data: {} },
      ]),
    /unsupported collection/i
  );
});

test('public Express routes and frontend client modules never import firebase-admin or server/admin', () => {
  const filesToCheck = [
    path.resolve(process.cwd(), 'server.ts'),
    path.resolve(process.cwd(), 'server/app.ts'),
    path.resolve(process.cwd(), 'server/routes/health.ts'),
    path.resolve(process.cwd(), 'src/lib/firebase.ts'),
    path.resolve(process.cwd(), 'src/data/repositories/firestoreProblemRepository.ts'),
  ];

  for (const filePath of filesToCheck) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.equal(
      /firebase-admin|server\/admin|\.\/admin\//.test(content),
      false,
      `File "${filePath}" must not reference firebase-admin or server/admin.`
    );
  }
});

test('atomic transaction aborts entire batch if a target document is created or modified concurrently', async () => {
  const records = buildDemoSeedRecords();

  // Case 1: Concurrent creation between planning and transaction commit aborts all 3 creates
  const concurrentCreateMem = createInMemoryAdminStore({
    mutateBeforeTransaction(setRaw) {
      setRaw(
        'demoProblems',
        'student-nutrition-consistency',
        DEMO_PROBLEMS_SEED_MANIFEST[1].data as unknown as Record<string, unknown>
      );
    },
  });

  const createRaceReport = await executeIngestionPlan(
    concurrentCreateMem.store,
    records,
    { mode: 'apply', approved: true }
  );
  assert.match(
    createRaceReport.blockedReason ?? '',
    /CONCURRENT_MODIFICATION_CONFLICT/
  );
  assert.equal(concurrentCreateMem.createCalls, 0);
  assert.equal(
    Object.keys(concurrentCreateMem.dumpCollection('demoProblems')).length,
    1
  );

  // Case 2: Concurrent modification between planning and approved_overwrite aborts atomically
  const concurrentUpdateMem = createInMemoryAdminStore({
    mutateBeforeTransaction(setRaw) {
      setRaw('demoProblems', 'wet-entrance-monsoons', {
        ...(DEMO_PROBLEMS_SEED_MANIFEST[0].data as unknown as Record<string, unknown>),
        title: 'Concurrent edit winning race',
      });
    },
  });
  concurrentUpdateMem.setRawForTest('demoProblems', 'wet-entrance-monsoons', {
    ...(DEMO_PROBLEMS_SEED_MANIFEST[0].data as unknown as Record<string, unknown>),
    title: 'Initial stale title',
  });

  const updateRaceReport = await executeIngestionPlan(
    concurrentUpdateMem.store,
    records,
    {
      mode: 'apply',
      approved: true,
      conflictPolicy: 'overwrite',
      approvedOverwritePaths: ['demoProblems/wet-entrance-monsoons'],
    }
  );
  assert.match(
    updateRaceReport.blockedReason ?? '',
    /CONCURRENT_MODIFICATION_CONFLICT/
  );
  assert.equal(concurrentUpdateMem.createCalls, 0);
  assert.equal(concurrentUpdateMem.updateCalls, 0);
  assert.equal(
    concurrentUpdateMem.dumpCollection('demoProblems')['wet-entrance-monsoons'].title,
    'Concurrent edit winning race'
  );

  // Verify real Firestore store implementation uses db.runTransaction and .create(
  const adminClientSource = fs.readFileSync(
    path.resolve(process.cwd(), 'server/admin/firebaseAdminClient.ts'),
    'utf8'
  );
  assert.match(adminClientSource, /db\.runTransaction/);
  assert.match(adminClientSource, /\.create\(data\)/);
});
