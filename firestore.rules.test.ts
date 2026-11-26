/**
 * Firestore Security Rules Emulator Test Suite (Prompt #27 Candidate Rules)
 *
 * Target ruleset: firestore.candidate.rules
 * Isolated Emulator project ID: demo-kopi-rules-test
 * Production target (not touched by emulator tests): gen-lang-client-0653252950 / ai-studio-kopi-6863852d-35ae-4115-97d3-3fcc2fdd6372
 *
 * Run via:
 *   npm run test:rules
 * (Executes inside an isolated local Firestore Emulator via `firebase emulators:exec`.)
 */

import fs from 'node:fs';
import path from 'node:path';
import test, { after, before, beforeEach } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID =
  process.env.GCLOUD_PROJECT?.startsWith('demo-')
    ? process.env.GCLOUD_PROJECT
    : 'demo-kopi-rules-test';
const RULES_PATH = path.resolve(process.cwd(), 'firestore.candidate.rules');

let testEnv: RulesTestEnvironment;

function validUserPayload(uid: string) {
  return {
    uid,
    displayName: 'Asha Rao',
    eligibility: {
      isEighteenOrOlderDeclared: true,
      ageVerificationStatus: 'self_declared_unverified',
      declaredAt: serverTimestamp(),
    },
    consents: {
      termsAccepted: true,
      termsVersion: 'draft-2026-11-25-v1',
      termsAcceptedAt: serverTimestamp(),
      privacyPolicyAccepted: true,
      privacyPolicyVersion: 'draft-2026-11-25-v1',
      privacyAcceptedAt: serverTimestamp(),
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: 1,
  };
}

function validSavedPayload(
  problemId = 'wet-entrance-monsoons',
  sourceScreen = 'opportunity-radar'
) {
  return {
    problemId,
    savedAt: serverTimestamp(),
    sourceScreen,
    schemaVersion: 1,
  };
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  let host = '127.0.0.1';
  let port = 8088;
  if (emulatorHost) {
    const [parsedHost, parsedPort] = emulatorHost.split(':');
    if (parsedHost) host = parsedHost;
    if (parsedPort && Number.isFinite(Number(parsedPort))) {
      port = Number(parsedPort);
    }
  }

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port,
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

test('1. Unauthenticated visitor can get only the 3 approved demoProblems; list, unapproved IDs, writes, and user docs are denied', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adminDb = ctx.firestore();
    await setDoc(doc(adminDb, 'demoProblems/wet-entrance-monsoons'), {
      id: 'wet-entrance-monsoons',
      title: 'Wet entrance problem',
    });
    await setDoc(doc(adminDb, 'demoProblems/student-nutrition-consistency'), {
      id: 'student-nutrition-consistency',
      title: 'Student nutrition consistency',
    });
    await setDoc(doc(adminDb, 'demoProblems/excessive-small-delivery-packaging'), {
      id: 'excessive-small-delivery-packaging',
      title: 'Excessive packaging in small deliveries',
    });
    await setDoc(doc(adminDb, 'demoProblems/unapproved-demo-id'), {
      id: 'unapproved-demo-id',
      title: 'Unapproved record',
    });
  });

  const anonDb = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(anonDb, 'demoProblems/wet-entrance-monsoons')));
  await assertSucceeds(getDoc(doc(anonDb, 'demoProblems/student-nutrition-consistency')));
  await assertSucceeds(
    getDoc(doc(anonDb, 'demoProblems/excessive-small-delivery-packaging'))
  );

  await assertFails(getDoc(doc(anonDb, 'demoProblems/unapproved-demo-id')));
  await assertFails(getDocs(collection(anonDb, 'demoProblems')));
  await assertFails(
    setDoc(doc(anonDb, 'demoProblems/wet-entrance-monsoons'), { id: 'tampered' })
  );
  await assertFails(
    updateDoc(doc(anonDb, 'demoProblems/wet-entrance-monsoons'), { title: 'Tampered' })
  );
  await assertFails(deleteDoc(doc(anonDb, 'demoProblems/wet-entrance-monsoons')));

  await assertFails(getDoc(doc(anonDb, 'users/alice')));
  await assertFails(setDoc(doc(anonDb, 'users/alice'), validUserPayload('alice')));
  await assertFails(
    setDoc(
      doc(anonDb, 'users/alice/savedOpportunities/wet-entrance-monsoons'),
      validSavedPayload('wet-entrance-monsoons')
    )
  );
});

test('2. Verified owner can create, get, and safely update own profile; list and delete remain denied', async () => {
  const aliceDb = testEnv
    .authenticatedContext('alice', { email_verified: true })
    .firestore();

  await assertSucceeds(setDoc(doc(aliceDb, 'users/alice'), validUserPayload('alice')));
  await assertSucceeds(getDoc(doc(aliceDb, 'users/alice')));
  await assertFails(getDocs(collection(aliceDb, 'users')));

  await assertSucceeds(
    updateDoc(doc(aliceDb, 'users/alice'), {
      displayName: 'Asha R.',
      updatedAt: serverTimestamp(),
    })
  );

  await assertFails(deleteDoc(doc(aliceDb, 'users/alice')));
});

test('3. Cross-user isolation and UID spoofing prevention block reads, listings, writes, and guest migrations targeting another user', async () => {
  const aliceDb = testEnv
    .authenticatedContext('alice', { email_verified: true })
    .firestore();
  const bobDb = testEnv
    .authenticatedContext('bob', { email_verified: true })
    .firestore();

  await assertSucceeds(setDoc(doc(aliceDb, 'users/alice'), validUserPayload('alice')));
  await assertSucceeds(
    setDoc(
      doc(aliceDb, 'users/alice/savedOpportunities/wet-entrance-monsoons'),
      validSavedPayload('wet-entrance-monsoons')
    )
  );

  // Cross-user reads, listings, saves, guest-migrations, and deletes denied
  await assertFails(getDoc(doc(bobDb, 'users/alice')));
  await assertFails(getDocs(collection(bobDb, 'users/alice/savedOpportunities')));
  await assertFails(
    getDoc(doc(bobDb, 'users/alice/savedOpportunities/wet-entrance-monsoons'))
  );
  await assertFails(
    setDoc(
      doc(bobDb, 'users/alice/savedOpportunities/student-nutrition-consistency'),
      validSavedPayload('student-nutrition-consistency', 'guest-migration')
    )
  );
  await assertFails(
    deleteDoc(doc(bobDb, 'users/alice/savedOpportunities/wet-entrance-monsoons'))
  );

  // UID spoofing prevented on both document path and payload body
  await assertFails(setDoc(doc(bobDb, 'users/alice'), validUserPayload('bob')));
  await assertFails(setDoc(doc(bobDb, 'users/bob'), validUserPayload('alice')));
});

test('4. Unverified email tokens cannot read or write user records or saved opportunities', async () => {
  const unverifiedDb = testEnv
    .authenticatedContext('alice', { email_verified: false })
    .firestore();

  await assertFails(setDoc(doc(unverifiedDb, 'users/alice'), validUserPayload('alice')));
  await assertFails(getDoc(doc(unverifiedDb, 'users/alice')));
  await assertFails(
    setDoc(
      doc(unverifiedDb, 'users/alice/savedOpportunities/wet-entrance-monsoons'),
      validSavedPayload('wet-entrance-monsoons')
    )
  );
});

test('5. Dirty Dozen: Mass assignment, PII injection (email, phone, photoURL, address, role), and shadow fields are rejected', async () => {
  const aliceDb = testEnv
    .authenticatedContext('alice', { email_verified: true })
    .firestore();

  await assertFails(
    setDoc(doc(aliceDb, 'users/alice'), {
      ...validUserPayload('alice'),
      email: 'alice@example.com',
      role: 'admin',
    })
  );

  await assertFails(
    setDoc(doc(aliceDb, 'users/alice'), {
      ...validUserPayload('alice'),
      phone: '+91-9999999999',
      photoURL: 'https://example.com/avatar.png',
    })
  );

  await assertSucceeds(setDoc(doc(aliceDb, 'users/alice'), validUserPayload('alice')));

  await assertFails(
    updateDoc(doc(aliceDb, 'users/alice'), {
      isAdmin: true,
      updatedAt: serverTimestamp(),
    })
  );

  await assertFails(
    updateDoc(doc(aliceDb, 'users/alice'), {
      displayName: '   ',
      updatedAt: serverTimestamp(),
    })
  );

  await assertFails(
    updateDoc(doc(aliceDb, 'users/alice'), {
      displayName: 'a'.repeat(121),
      updatedAt: serverTimestamp(),
    })
  );
});

test('6. Dirty Dozen: 18+ eligibility, consent bypasses, and un-onboarded savedOpportunities writes are rejected', async () => {
  const aliceDb = testEnv
    .authenticatedContext('alice', { email_verified: true })
    .firestore();

  // Master gate: cannot save opportunities before creating an eligible, consented user profile
  await assertFails(
    setDoc(
      doc(aliceDb, 'users/alice/savedOpportunities/wet-entrance-monsoons'),
      validSavedPayload('wet-entrance-monsoons')
    )
  );

  // Under-18 / false declaration rejected
  await assertFails(
    setDoc(doc(aliceDb, 'users/alice'), {
      ...validUserPayload('alice'),
      eligibility: {
        isEighteenOrOlderDeclared: false,
        ageVerificationStatus: 'self_declared_unverified',
        declaredAt: serverTimestamp(),
      },
    })
  );

  // Spoofing verified age status rejected
  await assertFails(
    setDoc(doc(aliceDb, 'users/alice'), {
      ...validUserPayload('alice'),
      eligibility: {
        isEighteenOrOlderDeclared: true,
        ageVerificationStatus: 'verified',
        declaredAt: serverTimestamp(),
      },
    })
  );

  // Missing Terms or Privacy acceptance rejected
  await assertFails(
    setDoc(doc(aliceDb, 'users/alice'), {
      ...validUserPayload('alice'),
      consents: {
        ...validUserPayload('alice').consents,
        termsAccepted: false,
      },
    })
  );
  await assertFails(
    setDoc(doc(aliceDb, 'users/alice'), {
      ...validUserPayload('alice'),
      consents: {
        ...validUserPayload('alice').consents,
        privacyPolicyAccepted: false,
      },
    })
  );
});

test('7. Dirty Dozen: Backdated timestamps and immutable field mutations are rejected', async () => {
  const aliceDb = testEnv
    .authenticatedContext('alice', { email_verified: true })
    .firestore();

  await assertFails(
    setDoc(doc(aliceDb, 'users/alice'), {
      ...validUserPayload('alice'),
      createdAt: Timestamp.fromMillis(1000),
    })
  );

  await assertFails(
    setDoc(doc(aliceDb, 'users/alice'), {
      ...validUserPayload('alice'),
      eligibility: {
        ...validUserPayload('alice').eligibility,
        declaredAt: Timestamp.fromMillis(1000),
      },
    })
  );

  await assertSucceeds(setDoc(doc(aliceDb, 'users/alice'), validUserPayload('alice')));

  await assertFails(
    updateDoc(doc(aliceDb, 'users/alice'), {
      createdAt: Timestamp.fromMillis(1000),
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(
    updateDoc(doc(aliceDb, 'users/alice'), {
      uid: 'bob',
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(
    updateDoc(doc(aliceDb, 'users/alice'), {
      schemaVersion: 2,
      updatedAt: serverTimestamp(),
    })
  );
});

test('8. Saved opportunities enforce approved IDs, guest-migration safety, server timestamps, and forbid updates', async () => {
  const aliceDb = testEnv
    .authenticatedContext('alice', { email_verified: true })
    .firestore();

  await assertSucceeds(setDoc(doc(aliceDb, 'users/alice'), validUserPayload('alice')));

  await assertSucceeds(
    setDoc(
      doc(aliceDb, 'users/alice/savedOpportunities/wet-entrance-monsoons'),
      validSavedPayload('wet-entrance-monsoons', 'opportunity-radar')
    )
  );
  await assertSucceeds(
    setDoc(
      doc(aliceDb, 'users/alice/savedOpportunities/student-nutrition-consistency'),
      validSavedPayload('student-nutrition-consistency', 'guest-migration')
    )
  );
  await assertSucceeds(
    getDocs(collection(aliceDb, 'users/alice/savedOpportunities'))
  );

  // Client updates to savedOpportunities are forbidden (delete + create only)
  await assertFails(
    updateDoc(
      doc(aliceDb, 'users/alice/savedOpportunities/wet-entrance-monsoons'),
      { sourceScreen: 'problem-explorer' }
    )
  );

  // Unapproved IDs, mismatched problemId, invalid sourceScreen, backdated savedAt denied
  await assertFails(
    setDoc(
      doc(aliceDb, 'users/alice/savedOpportunities/unapproved-hack-id'),
      validSavedPayload('unapproved-hack-id')
    )
  );
  await assertFails(
    setDoc(
      doc(aliceDb, 'users/alice/savedOpportunities/excessive-small-delivery-packaging'),
      validSavedPayload('wet-entrance-monsoons')
    )
  );
  await assertFails(
    setDoc(
      doc(aliceDb, 'users/alice/savedOpportunities/excessive-small-delivery-packaging'),
      validSavedPayload('excessive-small-delivery-packaging', 'admin-panel')
    )
  );
  await assertFails(
    setDoc(
      doc(aliceDb, 'users/alice/savedOpportunities/excessive-small-delivery-packaging'),
      {
        ...validSavedPayload('excessive-small-delivery-packaging'),
        savedAt: Timestamp.fromMillis(1000),
      }
    )
  );

  await assertSucceeds(
    deleteDoc(doc(aliceDb, 'users/alice/savedOpportunities/wet-entrance-monsoons'))
  );
});

test('9. Internal research collections and unknown paths remain strictly inaccessible to authenticated users', async () => {
  const aliceDb = testEnv
    .authenticatedContext('alice', { email_verified: true })
    .firestore();

  for (const colName of [
    'dataSources',
    'sourceObservations',
    'problemClusters',
    'evidenceLinks',
    'researchInsights',
    'opportunityEvaluations',
    'publishedProblems',
    'unknownPrivateCollection',
  ]) {
    await assertFails(getDoc(doc(aliceDb, `${colName}/sample-doc`)));
    await assertFails(getDocs(collection(aliceDb, colName)));
    await assertFails(setDoc(doc(aliceDb, `${colName}/sample-doc`), { id: 'sample-doc' }));
  }
});
