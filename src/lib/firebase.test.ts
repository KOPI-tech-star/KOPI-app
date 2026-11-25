import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { deleteApp, getApps } from 'firebase/app';
import rawFirebaseConfig from '../../firebase-applet-config.json';
import {
  firebaseApp,
  firebaseAuth,
  firebaseClientConfig,
  firestoreDb,
  getFirebaseClientServices,
  getFirestoreTarget,
  initializeFirebaseClient,
  validateFirebaseClientConfig,
} from './firebase';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');

test('1. Firebase configuration validation accepts provisioned config and rejects invalid or default DB configs', () => {
  const validated = validateFirebaseClientConfig(rawFirebaseConfig);
  assert.equal(validated.projectId, 'gen-lang-client-0653252950');
  assert.equal(
    validated.firestoreDatabaseId,
    'ai-studio-kopi-6863852d-35ae-4115-97d3-3fcc2fdd6372'
  );

  assert.throws(() => validateFirebaseClientConfig(null), /expected a JSON object/);
  assert.throws(
    () =>
      validateFirebaseClientConfig({
        ...rawFirebaseConfig,
        firestoreDatabaseId: '(default)',
      }),
    /must target the named database/
  );
  assert.throws(
    () =>
      validateFirebaseClientConfig({
        ...rawFirebaseConfig,
        firestoreDatabaseId: '',
      }),
    /cannot be empty/
  );
  assert.throws(
    () =>
      validateFirebaseClientConfig({
        ...rawFirebaseConfig,
        projectId: 'remixed-project-id',
      }),
    /unprovisioned placeholder/
  );
  assert.throws(
    () =>
      validateFirebaseClientConfig({
        ...rawFirebaseConfig,
        private_key: 'forbidden',
      }),
    /service-account credentials are prohibited/
  );
});

test('2 & 3. Correct Firebase project and non-default named Firestore database are selected', () => {
  assert.equal(firebaseApp.options.projectId, 'gen-lang-client-0653252950');
  assert.equal(
    firebaseClientConfig.authDomain,
    'gen-lang-client-0653252950.firebaseapp.com'
  );

  const target = getFirestoreTarget(firestoreDb);
  assert.equal(target.projectId, 'gen-lang-client-0653252950');
  assert.equal(
    target.databaseId,
    'ai-studio-kopi-6863852d-35ae-4115-97d3-3fcc2fdd6372'
  );
});

test('4. No duplicate Firebase application instances are created on repeated initialization', async () => {
  const appsBefore = getApps().length;
  assert.equal(appsBefore, 1);

  const first = getFirebaseClientServices();
  const second = getFirebaseClientServices();
  const reinitialized = initializeFirebaseClient(rawFirebaseConfig);

  assert.equal(first, second);
  assert.equal(reinitialized.app, firebaseApp);
  assert.equal(reinitialized.auth, firebaseAuth);
  assert.equal(reinitialized.db, firestoreDb);
  assert.equal(getApps().length, 1);

  // Initializing with a mismatched projectId on the existing default app fails safely
  assert.throws(
    () =>
      initializeFirebaseClient({
        ...rawFirebaseConfig,
        projectId: 'wrong-project-id',
      }),
    /already initialized for project/
  );

  // Named secondary instance in isolated test cleans up cleanly
  const isolated = initializeFirebaseClient(rawFirebaseConfig, {
    appName: 'kopi-isolated-verification-app',
  });
  try {
    assert.equal(
      getFirestoreTarget(isolated.db).databaseId,
      'ai-studio-kopi-6863852d-35ae-4115-97d3-3fcc2fdd6372'
    );
  } finally {
    await deleteApp(isolated.app);
  }
});

test('5. No accidental use of "(default)" Firestore database in SDK target or module source', () => {
  const target = getFirestoreTarget(firestoreDb);
  assert.notEqual(target.databaseId, '(default)');

  const firebaseModuleSource = fs.readFileSync(
    path.join(ROOT_DIR, 'src/lib/firebase.ts'),
    'utf8'
  );
  assert.match(
    firebaseModuleSource,
    /getFirestore\(app,\s*config\.firestoreDatabaseId\)/
  );
  assert.doesNotMatch(firebaseModuleSource, /getFirestore\(\s*app?\s*\)/);
});

test('6. Absence of administrative credentials and isolation of firebase-admin from client & public Express routes', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  assert.ok(packageJson.dependencies?.firebase);

  const rawRecord = rawFirebaseConfig as Record<string, unknown>;
  assert.equal(rawRecord.private_key, undefined);
  assert.equal(rawRecord.client_email, undefined);

  const firebaseModuleSource = fs.readFileSync(
    path.join(ROOT_DIR, 'src/lib/firebase.ts'),
    'utf8'
  );
  assert.doesNotMatch(firebaseModuleSource, /firebase-admin/);

  const serverEntrySource = fs.readFileSync(
    path.join(ROOT_DIR, 'server.ts'),
    'utf8'
  );
  const serverAppSource = fs.readFileSync(
    path.join(ROOT_DIR, 'server/app.ts'),
    'utf8'
  );
  assert.doesNotMatch(serverEntrySource, /firebase-admin|server\/admin/);
  assert.doesNotMatch(serverAppSource, /firebase-admin|server\/admin/);
});

test('7 & 8. Firebase initialization triggers zero Firestore operations and zero automatic authentication', () => {
  assert.equal(firebaseAuth.currentUser, null);
  assert.equal(firebaseAuth.app, firebaseApp);

  const firebaseModuleSource = fs.readFileSync(
    path.join(ROOT_DIR, 'src/lib/firebase.ts'),
    'utf8'
  );

  const prohibitedDbOps = [
    'setDoc',
    'addDoc',
    'updateDoc',
    'deleteDoc',
    'getDoc',
    'getDocs',
    'getDocFromServer',
    'onSnapshot',
    'writeBatch',
    'runTransaction',
  ];
  for (const op of prohibitedDbOps) {
    assert.doesNotMatch(firebaseModuleSource, new RegExp(`\\b${op}\\b`));
  }

  const prohibitedAuthOps = [
    'signInWithPopup',
    'signInWithRedirect',
    'signInAnonymously',
    'signInWithEmailAndPassword',
    'createUserWithEmailAndPassword',
  ];
  for (const op of prohibitedAuthOps) {
    assert.doesNotMatch(firebaseModuleSource, new RegExp(`\\b${op}\\b`));
  }
});

test('9. Deployed Milestone F2 Firestore Security Rules enforce narrow get-only demo access and blueprint remains unchanged', () => {
  const rules = fs.readFileSync(path.join(ROOT_DIR, 'firestore.rules'), 'utf8');
  assert.match(rules, /rules_version\s*=\s*'2'/);
  assert.match(rules, /match\s+\/demoProblems\/\{problemId\}/);
  assert.match(rules, /allow\s+get:\s+if\s+problemId\s+in\s+\[/);
  assert.match(rules, /allow\s+list,\s*create,\s*update,\s*delete:\s*if\s+false;/);
  assert.match(rules, /match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;/);
  assert.doesNotMatch(rules, /allow\s+read,\s*write:\s*if\s+true/);
  assert.doesNotMatch(rules, /if\s+request\.auth\s*!=\s*null/);

  const blueprint = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, 'firebase-blueprint.json'), 'utf8')
  ) as { entities: Record<string, unknown>; firestore: Record<string, unknown> };
  assert.deepEqual(blueprint, { entities: {}, firestore: {} });
});
