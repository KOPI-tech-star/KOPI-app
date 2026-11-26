# Kopi — Engineering Compliance Implementation Tracker

> **Disclaimer:** This document is an engineering implementation tracker only. It is **not** a legal certification, privacy audit, or proof of compliance under India's Digital Personal Data Protection Act (DPDP Act), GDPR, RBI rules, or any other law.

**Status Labels Used:** `NOT STARTED` | `IN PROGRESS` | `IMPLEMENTED` | `TESTED` | `BLOCKED` | `LEGAL REVIEW REQUIRED`

---

## 1. Current Milestone (F2 — Firestore Data Layer & Live Demo Integration)

| Requirement | Milestone | Status | Implementation Files | Verification Method | Outstanding Blocker | Legal / Security Review |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Data minimization (no PII, accounts, or analytics in F2) | Milestone F2 | `TESTED` | `src/data/demoSeedManifest.ts`, `src/data/firestoreContracts.ts`, `src/lib/firebase.ts` | Static code & bundle inspection + unit tests | None | Confirm DPDP scope prior to user accounts |
| Database access restrictions (get-only for 3 demo IDs; internal collections denied) | Milestone F2 | `TESTED` (Live Reads & Candidate Emulator) | `firestore.rules`, `firestore.candidate.rules`, `firestore.rules.test.ts`, `src/data/repositories/firestoreProblemRepository.ts` | Restricted rules deployed via `DeployRules`; live client probes confirmed all 3 approved `demoProblems` reads succeed and all 10 probes return `permission-denied`; candidate rules write-mutation matrix verified (`9/9` passed via `npm run test:rules`) | Deployed `firestore.rules` unchanged; live client writes intentionally blocked until Prompt #27 candidate deployment approval | Pre-launch security rules & App Check review |
| Secret protection (no admin keys, Gemini keys, or service-account JSON in client) | Milestone F2 + DB Admin | `TESTED` | `src/lib/firebase.ts`, `src/lib/firebase.test.ts`, `.env.example`, `server/routes/health.ts`, `server/admin/firebaseAdminClient.ts` | Unit tests + production Vite bundle scan + `adminCli.test.ts` confirms static private-key JSON rejection and zero `firebase-admin` in `dist/` or public Express routes; legacy PostgreSQL retired & archived | Preview sandbox lacks Firestore IAM (`403`); dedicated Cloud Shell SA impersonation awaiting founder IAM setup | Confirm IAM Condition & SA impersonation setup |
| Input validation (runtime validation of Firestore docs & URLs; no HTML execution) | Milestone F2 + DB Admin | `TESTED` | `src/data/firestoreValidation.ts`, `src/data/firestoreValidation.test.ts`, `server/admin/ingestionCore.ts`, `server/admin/adminCli.test.ts` | Unit tests + live `getDocFromServer` verification confirmed 0 discrepancies on 3 demo docs + CLI pre-write validation & post-write verification tested with isolated fixtures | Authorised live Cloud Shell CLI execution awaiting founder IAM grant | Security review of future user-submitted inputs |
| Evidence provenance (verified vs illustrative vs hypothesis vs unknown) | Milestone F2 | `TESTED` | `src/data/firestoreContracts.ts`, `src/data/firestoreValidation.ts`, `src/config/opportunityEvaluation.ts` | Unit tests + live browser verification across all 4 screens enforcing `verifiedCount === 0`, `opportunityScore === null`, empty evidence/insights/alternatives, and AI-origin separation | Live ingestion deferred to future milestone | Editorial/methodology governance sign-off |
| Source permission requirements (disabled by default; review before activation) | Milestone F2 | `IMPLEMENTED` | `src/data/firestoreContracts.ts`, `src/data/firestoreValidation.ts`, `server/admin/ingestionCore.ts` | Schema + validator unit tests (`validateDataSourceRecord`) + CLI fixture ingestion tests | Live ingestion pipeline awaiting authorised Cloud Shell run & legal review | `LEGAL REVIEW REQUIRED` (Terms/robots/API licensing per source) |
| Retention metadata (`retentionPolicy`, `retentionRestrictions`, `removalOrRestrictionStatus`) | Milestone F2 | `IMPLEMENTED` | `src/data/firestoreContracts.ts`, `src/data/firestoreValidation.ts` | Validator unit tests rejecting `restricted`/`removed` observations | Automated retention purge jobs not implemented | `LEGAL REVIEW REQUIRED` (retention windows & takedown SLA) |
| Keyless database administration CLI (Option C: named-DB, dry-run, idempotent, conflict-safe) | DB Automation | `TESTED` (Isolated Fixtures) / `BLOCKED` (Live Execution) | `server/admin/firebaseAdminClient.ts`, `server/admin/ingestionCore.ts`, `server/admin/cli.ts`, `server/admin/adminCli.test.ts` | Unit + CLI fixture tests (`verify-connection`, `seed-demo`, `ingest`, conflict abort/skip/explicit overwrite, approval gate, post-write verification, sandbox/key rejection) | Awaiting founder setup of dedicated SA + per-database `roles/datastore.user` IAM Condition + Cloud Shell `impersonate-service-account` ADC | Founder Cloud Shell IAM & Condition verification |

---

## 2. Authentication Milestone (Prompt #27 — Implemented Locally; Candidate Rules Awaiting Approval)

| Requirement | Milestone | Status | Implementation Files | Verification Method | Outstanding Blocker | Legal / Security Review |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 18+ eligibility and age assurance | Auth Milestone | `IMPLEMENTED` (Self-Declaration Gate) / `LEGAL REVIEW REQUIRED` | `src/components/AuthOnboardingModal.tsx`, `src/config/legalDisclosures.ts`, `src/data/firestoreValidation.ts` | Unit tests + headless browser verification of 18+ checkbox gating (`ageVerificationStatus: 'self_declared_unverified'`) | Explicit self-declaration only; independent age assurance / DPDP parental-consent workflow not implemented | `LEGAL REVIEW REQUIRED` (DPDP verifiable consent / 18+ gate) |
| Google login (`signInWithPopup` flow) | Auth Milestone | `IMPLEMENTED` (Console Ready) / `BLOCKED` (Live Post-Deploy Test) | `src/lib/firebaseAuth.ts`, `src/components/AuthOnboardingModal.tsx`, `src/components/AccountControls.tsx`, `src/components/WelcomeScreen.tsx` | Unit tests for auth error mapping (`popup-closed`, `popup-blocked`, `unauthorized-domain`) + browser modal flow + founder confirmation that Google provider & preview/mobile domains are active | End-to-end live Google popup sign-in + Firestore onboarding write verification awaits candidate rules deployment | Verify OAuth consent branding & authorized domains |
| Plain-language privacy notices | Auth Milestone | `IMPLEMENTED` (Pre-Launch Drafts) / `LEGAL REVIEW REQUIRED` | `src/config/legalDisclosures.ts`, `src/components/LegalDisclosureModal.tsx` | Unit tests + browser modal verification confirming explicit pre-launch draft labeling | Working engineering draft placeholders only; not counsel-approved statutory notice | `LEGAL REVIEW REQUIRED` |
| Appropriate consent handling (granular, non-bundled) | Auth Milestone | `IMPLEMENTED` | `src/components/AuthOnboardingModal.tsx`, `src/data/firestoreContracts.ts`, `src/data/repositories/userAccountRepository.ts` | Unit tests + Emulator rules verification (`9/9`) verifying separate 18+ eligibility & versioned consent timestamps persisted on `users/{uid}` | Granular withdrawal UI deferred to Account Management Milestone | `LEGAL REVIEW REQUIRED` (DPDP Section 6 notice & consent) |
| Secure authentication & session handling | Auth Milestone | `IMPLEMENTED` (Client Session Persistence) | `src/lib/firebaseAuth.ts`, `src/contexts/AuthAndSavedContext.tsx` | `browserLocalPersistence` configured; `activeUidRef` session-switch state reset + `userAccountRepository` UID guard verified by unit tests | Express ID token verification deferred until server-side user endpoints are introduced | Token verification & revocation review |
| User-specific access isolation (`users/{userId}` rules) | Auth Milestone | `TESTED` (Local Emulator `9/9`) / `BLOCKED` (Deployment Approval) | `firestore.candidate.rules`, `firestore.rules.test.ts`, `firebase.emulator.json`, `.github/workflows/firestore-rules-tests.yml`, `docs/security_spec.md` | ESLint `@firebase/eslint-plugin-security-rules` clean (`0` errors) + `npm run test:rules` (`9/9` live Firestore Emulator tests passing across unauth denial, cross-user isolation, UID spoofing, PII rejection, privilege escalation, onboarding gate, duplicate bookmarks, internal collection denial, and demo reads) | **Candidate rules NOT deployed** (`firestore.rules` remains untouched Milestone F2 ruleset) awaiting explicit founder approval | Candidate deployment approval + live auth verification |
| Minimal registration data (no unnecessary PII) | Auth Milestone | `TESTED` | `src/data/firestoreContracts.ts`, `src/data/firestoreValidation.ts`, `firestore.candidate.rules`, `firestore.rules.test.ts` | Unit tests + Emulator rules verification confirming strict `hasOnly(...)` rejects `email`, `phone`, `photoURL`, and `address` in Firestore | None in schema; Firebase Auth retains identity session separately | `LEGAL REVIEW REQUIRED` |
| Persistent saved opportunities & guest migration | Auth Milestone | `TESTED` (Emulator & Mocked Store) / `BLOCKED` (Live Write Test) | `src/data/repositories/userAccountRepository.ts`, `src/data/guestBookmarkMigration.ts`, `src/components/SavedOpportunitiesScreen.tsx`, `firestore.rules.test.ts` | Unit + repository tests + Emulator rules verification (`hasCompletedOnboardingProfile` gate, `isApprovedProblemId`, duplicate-safe `problemId` key, safe UID switch purge) | Live Firestore user-write verification blocked until `firestore.candidate.rules` is approved & deployed | Verify post-deployment live user writes & guest migration |

---

## 3. Account Management Milestone (Deferred)

| Requirement | Milestone | Status | Implementation Files | Verification Method | Outstanding Blocker | Legal / Security Review |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Account deletion | Account Milestone | `NOT STARTED` | — | — | Depends on Auth rules deployment & Admin/deletion workflow | `LEGAL REVIEW REQUIRED` |
| Data deletion (user-owned saved items & submissions) | Account Milestone | `IN PROGRESS` (Saved item removal live; full profile purge deferred) | `src/data/repositories/userAccountRepository.ts` (`removeSavedOpportunity`) | Repository unit tests for `savedOpportunities` deletion; `users/{uid}` profile delete intentionally denied by client rules | Full account/consent purge flow deferred | `LEGAL REVIEW REQUIRED` |
| Data export (machine-readable user data export) | Account Milestone | `NOT STARTED` | — | — | Depends on Account Management Milestone | `LEGAL REVIEW REQUIRED` |
| Consent withdrawal where applicable | Account Milestone | `NOT STARTED` | — | — | Depends on Account Management Milestone | `LEGAL REVIEW REQUIRED` |
| Retention schedules | Account Milestone | `NOT STARTED` | — | — | Backend cron/worker not implemented | `LEGAL REVIEW REQUIRED` |
| Backup deletion procedures | Account Milestone | `NOT STARTED` | — | — | Operational runbook not created | `LEGAL REVIEW REQUIRED` |
| Grievance and contact mechanisms (Grievance Officer details) | Account Milestone | `NOT STARTED` | — | — | Governance contact not published | `LEGAL REVIEW REQUIRED` (DPDP Grievance Redressal) |

---

## 4. AI Integration Milestone (Deferred)

| Requirement | Milestone | Status | Implementation Files | Verification Method | Outstanding Blocker | Legal / Security Review |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Backend-only AI API calls (`GEMINI_API_KEY` server-side only) | AI Milestone | `NOT STARTED` | `.env.example` (placeholder only) | Bundle scan confirms no Gemini key/SDK in client | Server AI endpoints not built | Security review of API proxy & auth |
| AI processing disclosure | AI Milestone | `NOT STARTED` | — | — | Deferred to AI Milestone | `LEGAL REVIEW REQUIRED` |
| Provider terms review (Gemini API / Cloud terms) | AI Milestone | `LEGAL REVIEW REQUIRED` | — | — | Legal/founder review required | `LEGAL REVIEW REQUIRED` |
| Prompt injection safeguards | AI Milestone | `NOT STARTED` | — | — | Deferred to AI Milestone | Security review of untrusted excerpt isolation |
| Structured output validation | AI Milestone | `IN PROGRESS` | `src/config/opportunityEvaluation.ts` (`StructuredEvaluationOutputDraft`), `src/data/firestoreValidation.ts` | Unit tests enforcing AI vs verified separation | Live AI output parser not built | Security & integrity audit |
| Rate limiting | AI Milestone | `NOT STARTED` | — | — | Deferred to AI Milestone | Abuse & DoS review |
| Per-user usage limits | AI Milestone | `NOT STARTED` | — | — | Depends on Auth Milestone | Quota & abuse review |
| Monthly cost controls | AI Milestone | `NOT STARTED` | — | — | Cloud billing & budget alerts not configured | Founder billing approval |
| Honest AI claims (no hallucinated stats/scores) | AI Milestone | `TESTED` | `src/config/opportunityEvaluation.ts`, `src/data/firestoreValidation.ts` | Unit tests enforcing `ai_generated !== verified_observation` | Live AI prompts not yet built | Ongoing QA review |

---

## 5. Pre-Launch Milestone (Required Before Public Release)

| Requirement | Milestone | Status | Implementation Files | Verification Method | Outstanding Blocker | Legal / Security Review |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Privacy policy | Pre-Launch | `IN PROGRESS` (Draft Placeholder Only) | `src/config/legalDisclosures.ts` | Rendered via `LegalDisclosureModal` | Counsel drafting & approval required before public launch | `LEGAL REVIEW REQUIRED` |
| Terms of use | Pre-Launch | `IN PROGRESS` (Draft Placeholder Only) | `src/config/legalDisclosures.ts` | Rendered via `LegalDisclosureModal` | Counsel drafting & approval required before public launch | `LEGAL REVIEW REQUIRED` |
| Incident response procedures | Pre-Launch | `NOT STARTED` | — | — | Operational runbook required | `LEGAL REVIEW REQUIRED` |
| Applicable breach notification requirements (e.g., CERT-In / DPDP Board) | Pre-Launch | `LEGAL REVIEW REQUIRED` | — | — | Legal/founder review required | `LEGAL REVIEW REQUIRED` |
| HTTPS and deployment security | Pre-Launch | `IN PROGRESS` | `server/app.ts` (security headers), `src/config/problemExplorer.ts` (`sanitizeExternalUrl`) | Server tests + header inspection | Cloud Run / custom domain TLS & HSTS review pre-launch | Security review |
| Administrative MFA (Google Cloud / Firebase console accounts) | Pre-Launch | `NOT STARTED` | — | — | Founder organization account verification | Security review |
| IAM permissions review (least-privilege service accounts) | Pre-Launch | `BLOCKED` | `docs/COMPLIANCE_TRACKER.md` | Preview ADC verified lacking Firestore IAM (`403`) | Project ownership & billing confirmation required | Security review |
| Abuse protection (Firebase App Check, rate limiting, quota alerts) | Pre-Launch | `NOT STARTED` | — | — | Public `demoProblems` reads currently unthrottled by App Check | Security review |
| DPDP applicability and legal review | Pre-Launch | `LEGAL REVIEW REQUIRED` | — | — | External counsel review required | `LEGAL REVIEW REQUIRED` |
| International privacy applicability review | Pre-Launch | `LEGAL REVIEW REQUIRED` | — | — | External counsel review required | `LEGAL REVIEW REQUIRED` |
| Independent security assessment | Pre-Launch | `NOT STARTED` | — | — | Pre-launch pentest/review pending | Independent security review |

---

## 6. Future Payments Milestone (Deferred)

| Requirement | Milestone | Status | Implementation Files | Verification Method | Outstanding Blocker | Legal / Security Review |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Transparent pricing | Payments Milestone | `NOT STARTED` | — | — | Deferred | `LEGAL REVIEW REQUIRED` |
| Subscription cancellation | Payments Milestone | `NOT STARTED` | — | — | Deferred | `LEGAL REVIEW REQUIRED` |
| Recurring payment mandates | Payments Milestone | `NOT STARTED` | — | — | Deferred | `LEGAL REVIEW REQUIRED` (RBI e-mandate rules) |
| Applicable RBI requirements | Payments Milestone | `LEGAL REVIEW REQUIRED` | — | — | Deferred | `LEGAL REVIEW REQUIRED` |
| Refund and consumer protection obligations | Payments Milestone | `NOT STARTED` | — | — | Deferred | `LEGAL REVIEW REQUIRED` |
