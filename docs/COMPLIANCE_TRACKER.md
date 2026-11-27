# Kopi — Engineering Compliance Implementation Tracker

> **Disclaimer:** This document is an engineering implementation tracker only. It is **not** a legal certification, privacy audit, or proof of compliance under India's Digital Personal Data Protection Act (DPDP Act), GDPR, RBI rules, or any other law.

**Status Labels Used:** `NOT STARTED` | `IN PROGRESS` | `IMPLEMENTED` | `TESTED` | `BLOCKED` | `LEGAL REVIEW REQUIRED`

---

## 1. Current Milestone (F2 — Firestore Data Layer & Live Demo Integration)

| Requirement | Milestone | Status | Implementation Files | Verification Method | Outstanding Blocker | Legal / Security Review |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Data minimization (no PII, accounts, or analytics in F2) | Milestone F2 | `TESTED` | `src/data/demoSeedManifest.ts`, `src/data/firestoreContracts.ts`, `src/lib/firebase.ts` | Static code & bundle inspection + unit tests | None | Confirm DPDP scope prior to user accounts |
| Database access restrictions (get-only for 3 demo IDs; internal collections denied) | Milestone F2 + Auth | `TESTED` (Live Demo Reads, CI Emulator `9/9`, Deployed) | `firestore.rules`, `firestore.candidate.rules`, `archive/firestore.milestone-f2.rules`, `firestore.rules.test.ts` | Verified `9/9` in isolated GitHub Actions Emulator (commit `3f5d6bf`) and deployed to named DB via `fax.DeployRules`; live probes confirm approved `demoProblems` reads succeed and unauthenticated `users`/internal reads/writes fail with `permission-denied` | Interactive founder Google Sign-In & Firestore user write verification pending | Pre-launch security rules & App Check review |
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
| Google login (`signInWithPopup` flow) | Auth Milestone | `IMPLEMENTED` (Rules Deployed; Live Founder E2E Pending) | `src/lib/firebaseAuth.ts`, `src/components/AuthOnboardingModal.tsx`, `src/components/AccountControls.tsx`, `src/components/WelcomeScreen.tsx` | Unit tests for auth error mapping + browser modal flow + founder confirmation that Google provider & preview/mobile domains are active | Interactive founder browser Google Sign-In + Firestore onboarding verification in progress | Verify OAuth consent branding & authorized domains |
| Plain-language privacy notices | Auth Milestone | `IMPLEMENTED` (Pre-Launch Drafts) / `LEGAL REVIEW REQUIRED` | `src/config/legalDisclosures.ts`, `src/components/LegalDisclosureModal.tsx` | Unit tests + browser modal verification confirming explicit pre-launch draft labeling | Working engineering draft placeholders only; not counsel-approved statutory notice | `LEGAL REVIEW REQUIRED` |
| Appropriate consent handling (granular, non-bundled) | Auth Milestone | `IMPLEMENTED` | `src/components/AuthOnboardingModal.tsx`, `src/data/firestoreContracts.ts`, `src/data/repositories/userAccountRepository.ts` | Unit tests + CI Emulator rules verification (`9/9`) verifying separate 18+ eligibility & versioned consent timestamps persisted on `users/{uid}` | Granular withdrawal UI deferred to Account Management Milestone | `LEGAL REVIEW REQUIRED` (DPDP Section 6 notice & consent) |
| Secure authentication & session handling | Auth Milestone | `IMPLEMENTED` (Client Session Persistence) | `src/lib/firebaseAuth.ts`, `src/contexts/AuthAndSavedContext.tsx` | `browserLocalPersistence` configured; `activeUidRef` session-switch state reset + `userAccountRepository` UID guard verified by unit tests | Express ID token verification deferred until server-side user endpoints are introduced | Token verification & revocation review |
| User-specific access isolation (`users/{userId}` rules) | Auth Milestone | `TESTED` (CI Emulator `9/9`) & `DEPLOYED` | `firestore.rules`, `firestore.candidate.rules`, `archive/firestore.milestone-f2.rules`, `firestore.rules.test.ts`, `.github/workflows/firestore-rules-tests.yml` | ESLint clean (`0` errors) + GitHub Actions Emulator suite passed (`9/9` on commit `3f5d6bf`) + deployed to `ai-studio-kopi-6863852d-35ae-4115-97d3-3fcc2fdd6372` via `fax.DeployRules` | Live interactive authenticated multi-account isolation check pending founder E2E walkthrough | Security rules audit + live auth E2E |
| Minimal registration data (no unnecessary PII) | Auth Milestone | `TESTED` | `src/data/firestoreContracts.ts`, `src/data/firestoreValidation.ts`, `firestore.rules`, `firestore.rules.test.ts` | Unit tests + Emulator rules verification confirming strict `hasOnly(...)` rejects `email`, `phone`, `photoURL`, and `address` in Firestore | None in schema; Firebase Auth retains identity session separately | `LEGAL REVIEW REQUIRED` |
| Persistent saved opportunities & guest migration | Auth Milestone | `IMPLEMENTED` (Rules Deployed; Live Founder E2E Pending) | `src/data/repositories/userAccountRepository.ts`, `src/data/guestBookmarkMigration.ts`, `src/components/SavedOpportunitiesScreen.tsx`, `firestore.rules.test.ts` | Unit + repository tests + CI Emulator rules verification (`hasCompletedOnboardingProfile` gate, `isApprovedProblemId`, duplicate-safe `problemId` key, safe UID switch purge) | Interactive founder verification of live save/refresh/sign-out/migration persistence pending | Verify post-deployment live user writes & guest migration |

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

## 4. AI Integration & Research Intelligence Engine (Prompt #28 — Implemented Server-Only)

| Requirement | Milestone | Status | Implementation Files | Verification Method | Outstanding Blocker | Legal / Security Review |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Backend-only AI API calls (`GEMINI_API_KEY` and `GEMINI_EXTRACTION_MODEL` server-side only) | Prompt #28 | `TESTED` (Isolated Mocks; Missing-Key Explicit Fail) | `server/admin/aiExtraction.ts`, `.env.example` | Bundle scan verifies zero `@google/genai`, `GEMINI_API_KEY`, or `GEMINI_EXTRACTION_MODEL` in `dist/assets/` or public Express routes; unit tests confirm explicit `missing_api_key` failure and model configurability (default `gemini-4-hydrogen`) | Live Gemini run awaits operator `GEMINI_API_KEY` (and optional `GEMINI_EXTRACTION_MODEL` override if `gemini-4-hydrogen` is unavailable outside AI Studio) in Cloud Shell | Security review of key rotation & operator access |
| Prompt injection safeguards | Prompt #28 | `TESTED` | `server/admin/aiExtraction.ts` (`<untrusted_source_material>` tag isolation & tag-stripping) | Unit tests verify delimiter wrapping and HTML/script rejection | Ongoing prompt red-teaming on live excerpts | Security review of untrusted excerpt isolation |
| Structured output validation | Prompt #28 | `TESTED` | `server/admin/aiExtraction.ts` (`parseAndValidateAiExtractionResponse`), `src/data/firestoreValidation.ts` | Strict schema parsing rejecting malformed/non-JSON/XSS responses | Ongoing schema monitoring on live Gemini outputs | Security & integrity audit |
| Honest AI claims & provenance separation (`ai_generated !== verified_observation`) | Prompt #28 | `TESTED` | `server/admin/aiExtraction.ts`, `server/admin/publicationWorkflow.ts`, `src/data/firestoreValidation.ts` | Unit tests prove `extractObservationWithGemini` never outputs `verified_observation` and public projection separates `evidence_backed` vs `hypothesis` vs qualitative relevance (`Not scored`) | Ongoing editorial QA | Ongoing QA review |
| Permissioned research import, deduplication & clustering | Prompt #28 | `TESTED` (Synthetic Fixture Only) | `server/admin/researchImport.ts`, `server/admin/clusteringAndEvidence.ts`, `server/admin/ingestionCore.ts`, `docs/RESEARCH_IMPORT_SCHEMA.md` | Unit + CLI tests verify active/approved source checks, PII/scraping/non-HTTPS rejection, SHA-256 fingerprinting, deterministic clustering & 7-dimension qualitative review, and generic ingestion governance blocks | Live Cloud Shell execution on vetted real research packages pending founder approval | `LEGAL REVIEW REQUIRED` (Source Terms/licences before adding real feeds) |
| Editorial gate & sanitized publication (`>= 2` independent records or founder exception) | Prompt #28 | `TESTED` (In-Memory Store & Candidate Rules Pending CI) | `server/admin/publicationWorkflow.ts`, `server/admin/ingestionCore.ts`, `server/admin/cli.ts`, `firestore.candidate.rules`, `firestore.rules.test.ts`, `firebase.json` | Unit tests prove `draft -> under_review -> approved -> published` transaction strips `reviewNotes`/`approvedBy`/`reviewedBy`, invalidates stale approval on material updates, enforces `isIllustrativeDemo == false` + `publicationStatus == 'published'` in candidate rules & queries, and binds `firebase.json` to named DB only | GitHub Actions `test:rules` verification + explicit founder approval required before deploying Prompt #28 candidate rules | Governance & editorial sign-off |
| Rate limiting / per-user AI usage limits / monthly cost controls | Future User-Facing AI | `NOT STARTED` | — | Gemini is operator-only in Prompt #28 (no end-user AI endpoints) | Configure if/when end-user AI features launch | Cost & abuse review |
| AI processing disclosure (end-user features) | Future User-Facing AI | `NOT STARTED` | — | Currently internal research tooling only | Deferred until user-facing AI capabilities are added | `LEGAL REVIEW REQUIRED` |

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
