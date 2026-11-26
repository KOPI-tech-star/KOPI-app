# Kopi — Firestore Security Specification (Prompt #27 Candidate Rules)

- **Target Firebase Project:** `gen-lang-client-0653252950`
- **Target Named Firestore Database:** `ai-studio-kopi-6863852d-35ae-4115-97d3-3fcc2fdd6372`
- **Candidate Rules File:** `firestore.candidate.rules`
- **Active Deployed Ruleset:** `firestore.rules` (Milestone F2 read-only `demoProblems` — **unchanged until executable rules test verification & founder deployment approval**)

---

## 1. Role Matrix & Trust Boundaries

| Role / Caller | `demoProblems/{problemId}` | `users/{userId}` | `users/{userId}/savedOpportunities/{problemId}` | Internal & Reserved Collections (`dataSources`, `sourceObservations`, `problemClusters`, `evidenceLinks`, `researchInsights`, `opportunityEvaluations`, `publishedProblems`) |
| :--- | :--- | :--- | :--- | :--- |
| **Unauthenticated Visitor** | `get` ONLY for the 3 approved demo IDs (`list` denied) | Denied | Denied | Denied |
| **Authenticated User (`uid == userId`, `email_verified == true`)** | `get` ONLY for the 3 approved demo IDs (`list` denied) | `get`, `create`, `update` strictly for own `{uid}` (`list`, `delete` denied) | `get`, `list`, `create`, `delete` strictly under own `{uid}` (`update` denied) | Denied |
| **Authenticated Other User (`uid != userId`)** | `get` ONLY for the 3 approved demo IDs | Denied | Denied | Denied |
| **Privileged Backend CLI (`kopi-db-admin`)** | Admin SDK bypasses client rules (explicitly authorized via Cloud Shell IAM) | Not used in browser | Not used in browser | Admin SDK only |

---

## 2. Business Logic Invariants & PII Isolation

1. **Zero Unnecessary PII in Firestore:** `users/{userId}` permits **only** `uid`, `displayName` (`string | null` with trimmed non-empty text <= 120 chars), `eligibility`, `consents`, `createdAt`, `updatedAt`, and `schemaVersion`. Storing `email`, `phone`, `photoURL`, `address`, `role`, or privilege fields is blocked by `hasOnly(...)` in Security Rules and rejected by client validation.
2. **Verified Email Requirement:** Account ownership requires `request.auth != null && request.auth.uid == userId && request.auth.token.email_verified == true`.
3. **18+ Self-Declaration Honesty:** `eligibility` must record `isEighteenOrOlderDeclared == true`, `ageVerificationStatus == 'self_declared_unverified'`, and `declaredAt == request.time`. Client rules explicitly prevent any field claiming independent age verification.
4. **Versioned Consent Recording:** `consents` must include `termsAccepted == true`, non-empty bounded `termsVersion`, `termsAcceptedAt == request.time`, `privacyPolicyAccepted == true`, non-empty bounded `privacyPolicyVersion`, and `privacyAcceptedAt == request.time`.
5. **Immutable Ownership & Action-Restricted Updates:**
   - On `users/{userId}` `create`: `uid == userId`, `createdAt == request.time`, `updatedAt == request.time`, `schemaVersion == 1`.
   - On `users/{userId}` `update`: `diff(resource.data).affectedKeys().hasOnly(['displayName', 'consents', 'updatedAt'])`, `uid == resource.data.uid`, `createdAt == resource.data.createdAt`, `eligibility == resource.data.eligibility`, `updatedAt == request.time`, `schemaVersion == 1`.
   - Client-side profile deletion (`delete`) and user listing (`list`) are denied to protect account/consent audit integrity and prevent enumeration.
6. **Parent Onboarding Master Gate & Duplicate-Safe Saved Opportunities:**
   - Keyed by `{problemId}` at `users/{userId}/savedOpportunities/{problemId}` (`allow create, delete`, `allow update: if false`).
   - `create` enforces `hasCompletedOnboardingProfile(userId)` via `exists()`/`get()` on `users/{userId}` AFTER static payload checks, blocking direct SDK bookmark writes if the user bypassed 18+ eligibility and consent onboarding.
   - `problemId` must match the document ID, pass `isValidId`, and refer to either an approved demonstration ID or an existing `publishedProblems` document.
   - `savedAt == request.time`, `sourceScreen` must match an allowlisted surface string, and `schemaVersion == 1`.
7. **Preserved Milestone F2 Restrictions:** `demoProblems` permits individual `get` only on the 3 approved IDs (`list`, `create`, `update`, `delete` denied). All 7 internal/reserved collections remain `allow read, write: if false`. Default catch-all remains `allow read, write: if false`.

---

## 3. "Dirty Dozen" Adversarial Attack Vectors Covered by `firestore.rules.test.ts`

1. **Unauthenticated Write / List:** Anonymous client attempts `create` on `users/anon-uid` or `list` on `users` or `demoProblems`.
2. **Cross-User Read / Enumeration:** Authenticated User A (`alice`) attempts `get` on `users/bob` or `list` on `users/bob/savedOpportunities`.
3. **Cross-User Write / Spoofed Ownership:** Authenticated User A (`alice`) attempts `create`/`delete` on `users/bob/savedOpportunities/wet-entrance-monsoons`, or creates `users/alice` with `data.uid = 'bob'`.
4. **Unverified Token:** Authenticated caller with `email_verified: false` attempts `users/{uid}` or `savedOpportunities` access.
5. **Mass Assignment / PII Injection:** Caller injects `email`, `phone`, `role: 'admin'`, or `isAdmin: true` into `users/alice`.
6. **Consent & Eligibility Bypass:** Caller submits `eligibility.isEighteenOrOlderDeclared: false`, tries to fake `ageVerificationStatus: 'verified'`, or omits `consents.termsAccepted` / `consents.privacyPolicyAccepted`.
7. **Timestamp Forgery:** Caller passes backdated `createdAt`, `savedAt`, or `termsAcceptedAt` instead of `request.time`.
8. **Immutable Field Mutation:** Caller attempts `update` on `users/alice` changing `uid`, `createdAt`, or `eligibility.declaredAt`.
9. **Type Confusion & Field Overflow:** Caller sends oversized `displayName` (> 120 chars), negative/string `schemaVersion`, or invalid `sourceScreen`.
10. **Path Traversal & Malformed IDs:** Caller attempts path traversal or invalid IDs (`../admin`, empty/oversized IDs).
11. **Unapproved Opportunity Reference:** Caller tries to save a non-existent or unapproved `problemId` (`fake-opportunity-999`) under `savedOpportunities`.
12. **Internal Collection Tampering:** Authenticated caller attempts to read or write `dataSources`, `problemClusters`, `publishedProblems`, or `demoProblems`.
