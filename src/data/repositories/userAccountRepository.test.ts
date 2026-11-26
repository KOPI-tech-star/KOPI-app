import assert from 'node:assert/strict';
import test from 'node:test';
import { LEGAL_DOCUMENT_VERSIONS } from '../firestoreContracts';
import { RepositoryError } from './problemRepository';
import {
  FirestoreUserAccountRepository,
  type FirestoreUserAccountStore,
  type FirestoreUserStoreSnapshot,
} from './userAccountRepository';

const SERVER_TS_SENTINEL = { __serverTimestamp: true };

function createInMemoryUserStore(options?: {
  databaseId?: string;
  failWithCode?: string;
}): {
  store: FirestoreUserAccountStore;
  users: Map<string, Record<string, unknown>>;
  saved: Map<string, Map<string, Record<string, unknown>>>;
} {
  const users = new Map<string, Record<string, unknown>>();
  const saved = new Map<string, Map<string, Record<string, unknown>>>();

  const resolveTokens = (obj: Record<string, unknown>): Record<string, unknown> => {
    const now = '2026-11-25T12:00:00.000Z';
    const walk = (val: unknown): unknown => {
      if (val === SERVER_TS_SENTINEL) return now;
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val)) {
          out[k] = walk(v);
        }
        return out;
      }
      return val;
    };
    return walk(obj) as Record<string, unknown>;
  };

  const maybeThrow = () => {
    if (options?.failWithCode) {
      throw {
        code: options.failWithCode,
        message: `Simulated error (${options.failWithCode})`,
      };
    }
  };

  const store: FirestoreUserAccountStore = {
    projectId: 'gen-lang-client-0653252950',
    databaseId:
      options?.databaseId ?? 'ai-studio-kopi-6863852d-35ae-4115-97d3-3fcc2fdd6372',

    async getUserDoc(uid: string): Promise<FirestoreUserStoreSnapshot> {
      maybeThrow();
      const data = users.get(uid);
      return {
        exists: Boolean(data),
        id: uid,
        data: () => data,
      };
    },

    async createUserDoc(uid: string, data: Record<string, unknown>) {
      maybeThrow();
      users.set(uid, resolveTokens(data));
    },

    async updateUserDoc(uid: string, fields: Record<string, unknown>) {
      maybeThrow();
      const existing = users.get(uid) ?? {};
      users.set(uid, { ...existing, ...resolveTokens(fields) });
    },

    async listSavedDocs(uid: string): Promise<readonly FirestoreUserStoreSnapshot[]> {
      maybeThrow();
      const userSaved = saved.get(uid) ?? new Map<string, Record<string, unknown>>();
      return [...userSaved.entries()].map(([id, data]) => ({
        exists: true,
        id,
        data: () => data,
      }));
    },

    async getSavedDoc(
      uid: string,
      problemId: string
    ): Promise<FirestoreUserStoreSnapshot> {
      maybeThrow();
      const data = saved.get(uid)?.get(problemId);
      return {
        exists: Boolean(data),
        id: problemId,
        data: () => data,
      };
    },

    async createSavedDoc(
      uid: string,
      problemId: string,
      data: Record<string, unknown>
    ) {
      maybeThrow();
      let userSaved = saved.get(uid);
      if (!userSaved) {
        userSaved = new Map();
        saved.set(uid, userSaved);
      }
      userSaved.set(problemId, resolveTokens(data));
    },

    async deleteSavedDoc(uid: string, problemId: string) {
      maybeThrow();
      saved.get(uid)?.delete(problemId);
    },
  };

  return { store, users, saved };
}

test('FirestoreUserAccountRepository rejects "(default)" database binding', () => {
  const { store } = createInMemoryUserStore({ databaseId: '(default)' });
  assert.throws(
    () =>
      new FirestoreUserAccountRepository(store, {
        auth: null,
        timestampToken: () => SERVER_TS_SENTINEL,
      }),
    /\(default\)/
  );
});

test('upsertUserProfileOnConsent enforces 18+ and consent checkboxes, omits email/PII, and preserves createdAt on update', async () => {
  const { store, users } = createInMemoryUserStore();
  const repo = new FirestoreUserAccountRepository(store, {
    auth: null,
    timestampToken: () => SERVER_TS_SENTINEL,
  });

  await assert.rejects(
    () =>
      repo.upsertUserProfileOnConsent({
        uid: 'alice_uid',
        displayName: 'Alice',
        confirmedEighteenOrOlder: false,
        acceptedTermsAndPrivacy: true,
      }),
    (err: unknown) => err instanceof RepositoryError && err.code === 'invalid_record'
  );

  const created = await repo.upsertUserProfileOnConsent({
    uid: 'alice_uid',
    displayName: '<script>bad</script>',
    confirmedEighteenOrOlder: true,
    acceptedTermsAndPrivacy: true,
  });

  assert.equal(created.uid, 'alice_uid');
  assert.equal(created.displayName, null);
  assert.equal(created.eligibility.ageVerificationStatus, 'self_declared_unverified');
  assert.equal(created.consents.termsVersion, LEGAL_DOCUMENT_VERSIONS.termsVersion);
  assert.equal('email' in (users.get('alice_uid') ?? {}), false);

  const updated = await repo.upsertUserProfileOnConsent({
    uid: 'alice_uid',
    displayName: 'Alice Menon',
    confirmedEighteenOrOlder: true,
    acceptedTermsAndPrivacy: true,
  });
  assert.equal(updated.displayName, 'Alice Menon');
  assert.equal(updated.createdAt, created.createdAt);
});

test('saveOpportunity prevents duplicates by problemId, enforces approved IDs, lists, and deletes cleanly', async () => {
  const { store } = createInMemoryUserStore();
  const repo = new FirestoreUserAccountRepository(store, {
    auth: null,
    timestampToken: () => SERVER_TS_SENTINEL,
  });

  await assert.rejects(
    () => repo.saveOpportunity('alice_uid', 'unapproved-problem', 'opportunity-radar'),
    (err: unknown) => err instanceof RepositoryError && err.code === 'invalid_id'
  );

  const first = await repo.saveOpportunity(
    'alice_uid',
    'wet-entrance-monsoons',
    'opportunity-radar'
  );
  assert.equal(first.alreadyExisted, false);
  assert.equal(first.item.problemId, 'wet-entrance-monsoons');

  // Duplicate save returns existing record idempotently instead of duplicating or overwriting
  const duplicate = await repo.saveOpportunity(
    'alice_uid',
    'wet-entrance-monsoons',
    'problem-explorer'
  );
  assert.equal(duplicate.alreadyExisted, true);
  assert.equal(duplicate.item.sourceScreen, 'opportunity-radar');

  await repo.saveOpportunity(
    'alice_uid',
    'student-nutrition-consistency',
    'problem-investigation'
  );

  const list = await repo.listSavedOpportunities('alice_uid');
  assert.equal(list.length, 2);

  await repo.removeSavedOpportunity('alice_uid', 'wet-entrance-monsoons');
  const afterDelete = await repo.listSavedOpportunities('alice_uid');
  assert.deepEqual(
    afterDelete.map((i) => i.problemId),
    ['student-nutrition-consistency']
  );
});

test('FirestoreUserAccountRepository maps permission-denied and unavailable errors to RepositoryError', async () => {
  const { store: deniedStore } = createInMemoryUserStore({
    failWithCode: 'permission-denied',
  });
  const deniedRepo = new FirestoreUserAccountRepository(deniedStore, {
    auth: null,
  });

  await assert.rejects(
    () => deniedRepo.getUserProfile('alice_uid'),
    (err: unknown) => err instanceof RepositoryError && err.code === 'permission_denied'
  );

  const { store: offlineStore } = createInMemoryUserStore({
    failWithCode: 'unavailable',
  });
  const offlineRepo = new FirestoreUserAccountRepository(offlineStore, {
    auth: null,
  });

  await assert.rejects(
    () => offlineRepo.listSavedOpportunities('alice_uid'),
    (err: unknown) => err instanceof RepositoryError && err.code === 'unavailable'
  );
});

test('FirestoreUserAccountRepository rejects cross-UID calls when signed-in auth user differs', async () => {
  const { store } = createInMemoryUserStore();
  const fakeAuth = {
    currentUser: { uid: 'alice_uid' },
  } as unknown as import('firebase/auth').Auth;

  const repo = new FirestoreUserAccountRepository(store, {
    auth: fakeAuth,
    timestampToken: () => SERVER_TS_SENTINEL,
  });

  await assert.rejects(
    () => repo.getUserProfile('bob_uid'),
    (err: unknown) => err instanceof RepositoryError && err.code === 'permission_denied'
  );
  await assert.rejects(
    () => repo.listSavedOpportunities('bob_uid'),
    (err: unknown) => err instanceof RepositoryError && err.code === 'permission_denied'
  );
  await assert.rejects(
    () => repo.saveOpportunity('bob_uid', 'wet-entrance-monsoons', 'guest-migration'),
    (err: unknown) => err instanceof RepositoryError && err.code === 'permission_denied'
  );
});
