import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGE_ELIGIBILITY_DISCLOSURE,
  DRAFT_PRIVACY_POLICY,
  DRAFT_TERMS_OF_SERVICE,
  LEGAL_DOCUMENT_VERSIONS,
} from '../config/legalDisclosures';
import {
  addOrKeepGuestDraftBookmark,
  computePendingGuestMigrations,
  loadGuestDraftBookmarks,
  parseGuestDraftBookmarks,
  persistGuestDraftBookmarks,
  removeGuestDraftBookmark,
  type StorageLike,
} from './guestBookmarkMigration';
import {
  sanitizeUserDisplayName,
  validateSavedOpportunityDocument,
  validateUserProfileDocument,
} from './firestoreValidation';
import { mapFirebaseAuthError } from '../lib/firebaseAuth';
import { buildFirestoreErrorInfo, OperationType } from '../lib/firestoreErrors';

function createMemoryStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
}

test('validateUserProfileDocument accepts valid minimal user profile with self_declared_unverified status', () => {
  const res = validateUserProfileDocument('user_abc_123', {
    uid: 'user_abc_123',
    displayName: 'Asha Rao',
    eligibility: {
      isEighteenOrOlderDeclared: true,
      ageVerificationStatus: 'self_declared_unverified',
      declaredAt: '2026-11-25T10:00:00.000Z',
    },
    consents: {
      termsAccepted: true,
      termsVersion: LEGAL_DOCUMENT_VERSIONS.termsVersion,
      termsAcceptedAt: '2026-11-25T10:00:00.000Z',
      privacyPolicyAccepted: true,
      privacyPolicyVersion: LEGAL_DOCUMENT_VERSIONS.privacyPolicyVersion,
      privacyAcceptedAt: '2026-11-25T10:00:00.000Z',
    },
    createdAt: '2026-11-25T10:00:00.000Z',
    updatedAt: '2026-11-25T10:00:00.000Z',
    schemaVersion: 1,
  });

  assert.equal(res.ok, true);
  assert.equal(res.value?.uid, 'user_abc_123');
  assert.equal(res.value?.eligibility.ageVerificationStatus, 'self_declared_unverified');
});

test('validateUserProfileDocument rejects unnecessary PII fields, verified age claims, and missing consent', () => {
  const withEmail = validateUserProfileDocument('user_1', {
    uid: 'user_1',
    displayName: null,
    email: 'user@example.com',
    eligibility: {
      isEighteenOrOlderDeclared: true,
      ageVerificationStatus: 'self_declared_unverified',
      declaredAt: '2026-11-25T10:00:00.000Z',
    },
    consents: {
      termsAccepted: true,
      termsVersion: 'draft-1',
      termsAcceptedAt: '2026-11-25T10:00:00.000Z',
      privacyPolicyAccepted: true,
      privacyPolicyVersion: 'draft-1',
      privacyAcceptedAt: '2026-11-25T10:00:00.000Z',
    },
    createdAt: '2026-11-25T10:00:00.000Z',
    updatedAt: '2026-11-25T10:00:00.000Z',
    schemaVersion: 1,
  });
  assert.equal(withEmail.ok, false);
  assert.ok(withEmail.errors.some((e) => e.includes('email')));

  const unconsented = validateUserProfileDocument('user_1', {
    uid: 'user_1',
    displayName: null,
    eligibility: {
      isEighteenOrOlderDeclared: false,
      ageVerificationStatus: 'verified',
      declaredAt: '2026-11-25T10:00:00.000Z',
    },
    consents: {
      termsAccepted: false,
      termsVersion: '',
      termsAcceptedAt: 'not-a-date',
      privacyPolicyAccepted: false,
      privacyPolicyVersion: '',
      privacyAcceptedAt: 'not-a-date',
    },
    createdAt: '2026-11-25T10:00:00.000Z',
    updatedAt: '2026-11-25T10:00:00.000Z',
    schemaVersion: 1,
  });
  assert.equal(unconsented.ok, false);
  assert.ok(unconsented.errors.length >= 4);
});

test('sanitizeUserDisplayName strips unsafe script/HTML and bounds length', () => {
  assert.equal(sanitizeUserDisplayName('<script>alert(1)</script>'), null);
  assert.equal(sanitizeUserDisplayName('   Meera   Nair  '), 'Meera Nair');
  assert.equal(sanitizeUserDisplayName('x'.repeat(200))?.length, 120);
  assert.equal(sanitizeUserDisplayName('   '), null);
});

test('validateSavedOpportunityDocument enforces approved problem IDs and safe fields', () => {
  const ok = validateSavedOpportunityDocument('wet-entrance-monsoons', {
    problemId: 'wet-entrance-monsoons',
    savedAt: { seconds: 1795600000, nanoseconds: 0 },
    sourceScreen: 'opportunity-radar',
    schemaVersion: 1,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.value?.problemId, 'wet-entrance-monsoons');

  const unapproved = validateSavedOpportunityDocument('arbitrary-problem-id', {
    problemId: 'arbitrary-problem-id',
    savedAt: '2026-11-25T10:00:00.000Z',
    sourceScreen: 'opportunity-radar',
    schemaVersion: 1,
  });
  assert.equal(unapproved.ok, false);
});

test('guest bookmark migration deduplicates, rejects unapproved IDs, and computes pending delta', () => {
  const storage = createMemoryStorage();
  const parsed = parseGuestDraftBookmarks(
    JSON.stringify([
      {
        problemId: 'wet-entrance-monsoons',
        savedAt: '2026-11-25T10:00:00.000Z',
        sourceScreen: 'opportunity-radar',
      },
      {
        problemId: 'wet-entrance-monsoons',
        savedAt: '2026-11-25T10:01:00.000Z',
        sourceScreen: 'problem-explorer',
      },
      {
        problemId: '../evil-injection',
        savedAt: '2026-11-25T10:02:00.000Z',
        sourceScreen: 'opportunity-radar',
      },
    ])
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].problemId, 'wet-entrance-monsoons');

  const added = addOrKeepGuestDraftBookmark(
    parsed,
    'student-nutrition-consistency',
    'problem-investigation'
  );
  assert.equal(added.length, 2);

  persistGuestDraftBookmarks(added, storage);
  assert.equal(loadGuestDraftBookmarks(storage).length, 2);

  const pending = computePendingGuestMigrations(added, ['wet-entrance-monsoons']);
  assert.deepEqual(
    pending.map((p) => p.problemId),
    ['student-nutrition-consistency']
  );

  const remaining = removeGuestDraftBookmark(added, 'student-nutrition-consistency');
  assert.deepEqual(
    remaining.map((p) => p.problemId),
    ['wet-entrance-monsoons']
  );
});

test('legal disclosures explicitly label pre-launch draft status and unverified 18+ self-declaration', () => {
  assert.match(DRAFT_TERMS_OF_SERVICE.draftStatusLabel, /draft/i);
  assert.match(DRAFT_PRIVACY_POLICY.draftStatusLabel, /draft/i);
  assert.match(AGE_ELIGIBILITY_DISCLOSURE.honestyNote, /not an independent/i);
});

test('mapFirebaseAuthError handles popup closure, popup blocking, and unauthorized domain gracefully', () => {
  assert.equal(mapFirebaseAuthError({ code: 'auth/popup-closed-by-user' }).code, 'popup_closed');
  assert.equal(mapFirebaseAuthError({ code: 'auth/popup-blocked' }).code, 'popup_blocked');
  assert.equal(
    mapFirebaseAuthError({ code: 'auth/unauthorized-domain' }).code,
    'unauthorized_domain'
  );
  assert.equal(
    mapFirebaseAuthError({ code: 'auth/network-request-failed' }).code,
    'network_error'
  );
});

test('buildFirestoreErrorInfo captures structured operation metadata without throwing', () => {
  const info = buildFirestoreErrorInfo(
    new Error('permission-denied'),
    OperationType.CREATE,
    'users/u1/savedOpportunities/wet-entrance-monsoons',
    null
  );
  assert.equal(info.operationType, 'create');
  assert.equal(info.path, 'users/u1/savedOpportunities/wet-entrance-monsoons');
  assert.equal(info.error, 'permission-denied');
});
