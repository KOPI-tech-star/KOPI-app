# Kopi — Engineering Compliance Implementation Tracker

> **Disclaimer:** This document is an engineering implementation tracker only. It is **not** a legal certification, privacy audit, or proof of compliance under India's Digital Personal Data Protection Act (DPDP Act), GDPR, RBI rules, or any other law.

**Status Labels Used:** `NOT STARTED` | `IN PROGRESS` | `IMPLEMENTED` | `TESTED` | `BLOCKED` | `LEGAL REVIEW REQUIRED`

---

## 1. Current Milestone (F2 — Firestore Data Layer & Live Demo Integration)

| Requirement | Milestone | Status | Implementation Files | Verification Method | Outstanding Blocker | Legal / Security Review |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Data minimization (no PII, accounts, or analytics in F2) | Milestone F2 | `TESTED` | `src/data/demoSeedManifest.ts`, `src/data/firestoreContracts.ts`, `src/lib/firebase.ts` | Static code & bundle inspection + unit tests | None | Confirm DPDP scope prior to user accounts |
| Database access restrictions (get-only for 3 demo IDs; internal collections denied) | Milestone F2 | `TESTED` (Live Reads) / `NOT EXECUTED` (Local Emulator Writes) | `firestore.rules`, `firestore.candidate.rules`, `src/data/repositories/firestoreProblemRepository.ts` | Restricted rules deployed via `DeployRules`; live client probes confirmed all 3 approved `demoProblems` reads succeed and all 10 probes (unapproved ID, collection `list`, 7 internal/reserved collections, arbitrary `users` collection) return `permission-denied` | Local Java/Emulator absent in container for write-mutation TDD (live mutations intentionally not attempted) | Pre-launch security rules & App Check review |
| Secret protection (no admin keys, Gemini keys, or service-account JSON in client) | Milestone F2 + DB Admin | `TESTED` | `src/lib/firebase.ts`, `src/lib/firebase.test.ts`, `.env.example`, `server/routes/health.ts`, `server/admin/firebaseAdminClient.ts` | Unit tests + production Vite bundle scan + `adminCli.test.ts` confirms static private-key JSON rejection and zero `firebase-admin` in `dist/` or public Express routes; legacy PostgreSQL retired & archived | Preview sandbox lacks Firestore IAM (`403`); dedicated Cloud Shell SA impersonation awaiting founder IAM setup | Confirm IAM Condition & SA impersonation setup |
| Input validation (runtime validation of Firestore docs & URLs; no HTML execution) | Milestone F2 + DB Admin | `TESTED` | `src/data/firestoreValidation.ts`, `src/data/firestoreValidation.test.ts`, `server/admin/ingestionCore.ts`, `server/admin/adminCli.test.ts` | Unit tests + live `getDocFromServer` verification confirmed 0 discrepancies on 3 demo docs + CLI pre-write validation & post-write verification tested with isolated fixtures | Authorised live Cloud Shell CLI execution awaiting founder IAM grant | Security review of future user-submitted inputs |
| Evidence provenance (verified vs illustrative vs hypothesis vs unknown) | Milestone F2 | `TESTED` | `src/data/firestoreContracts.ts`, `src/data/firestoreValidation.ts`, `src/config/opportunityEvaluation.ts` | Unit tests + live browser verification across all 4 screens enforcing `verifiedCount === 0`, `opportunityScore === null`, empty evidence/insights/alternatives, and AI-origin separation | Live ingestion deferred to future milestone | Editorial/methodology governance sign-off |
| Source permission requirements (disabled by default; review before activation) | Milestone F2 | `IMPLEMENTED` | `src/data/firestoreContracts.ts`, `src/data/firestoreValidation.ts`, `server/admin/ingestionCore.ts` | Schema + validator unit tests (`validateDataSourceRecord`) + CLI fixture ingestion tests | Live ingestion pipeline awaiting authorised Cloud Shell run & legal review | `LEGAL REVIEW REQUIRED` (Terms/robots/API licensing per source) |
| Retention metadata (`retentionPolicy`, `retentionRestrictions`, `removalOrRestrictionStatus`) | Milestone F2 | `IMPLEMENTED` | `src/data/firestoreContracts.ts`, `src/data/firestoreValidation.ts` | Validator unit tests rejecting `restricted`/`removed` observations | Automated retention purge jobs not implemented | `LEGAL REVIEW REQUIRED` (retention windows & takedown SLA) |
| Keyless database administration CLI (Option C: named-DB, dry-run, idempotent, conflict-safe) | DB Automation | `TESTED` (Isolated Fixtures) / `BLOCKED` (Live Execution) | `server/admin/firebaseAdminClient.ts`, `server/admin/ingestionCore.ts`, `server/admin/cli.ts`, `server/admin/adminCli.test.ts` | Unit + CLI fixture tests (`verify-connection`, `seed-demo`, `ingest`, conflict abort/skip/explicit overwrite, approval gate, post-write verification, sandbox/key rejection) | Awaiting founder setup of dedicated SA + per-database `roles/datastore.user` IAM Condition + Cloud Shell `impersonate-service-account` ADC | Founder Cloud Shell IAM & Condition verification |

---

## 2. Authentication Milestone (Deferred — Post-F2 Approval)

| Requirement | Milestone | Status | Implementation Files | Verification Method | Outstanding Blocker | Legal / Security Review |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 18+ eligibility and age assurance | Auth Milestone | `NOT STARTED` | — | — | Deferred pending milestone approval | `LEGAL REVIEW REQUIRED` (DPDP verifiable consent / 18+ gate) |
| Google login (`signInWithPopup` flow) | Auth Milestone | `NOT STARTED` | `src/lib/firebase.ts` (SDK initialized only) | Auth SDK init verified (`currentUser === null`) | Auth UI & consent flow deferred | Verify OAuth consent branding & authorized domains |
| Plain-language privacy notices | Auth Milestone | `NOT STARTED` | — | — | Deferred to Auth Milestone | `LEGAL REVIEW REQUIRED` |
| Appropriate consent handling (granular, non-bundled) | Auth Milestone | `NOT STARTED` | — | — | Deferred to Auth Milestone | `LEGAL REVIEW REQUIRED` (DPDP Section 6 notice & consent) |
| Secure authentication & session handling | Auth Milestone | `NOT STARTED` | — | — | Express ID token verification (`verifyIdToken`) not wired | Token verification & revocation review |
| User-specific access isolation (`users/{userId}` rules) | Auth Milestone | `NOT STARTED` | — | — | Deferred until user collections exist | Security rules audit + Emulator TDD |
| Minimal registration data (no unnecessary PII) | Auth Milestone | `NOT STARTED` | — | — | Deferred to Auth Milestone | `LEGAL REVIEW REQUIRED` |

---

## 3. Account Management Milestone (Deferred)

| Requirement | Milestone | Status | Implementation Files | Verification Method | Outstanding Blocker | Legal / Security Review |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Account deletion | Account Milestone | `NOT STARTED` | — | — | Depends on Auth Milestone & Admin/IAM access | `LEGAL REVIEW REQUIRED` |
| Data deletion (user-owned saved items & submissions) | Account Milestone | `NOT STARTED` | — | — | Depends on Auth Milestone | `LEGAL REVIEW REQUIRED` |
| Data export (machine-readable user data export) | Account Milestone | `NOT STARTED` | — | — | Depends on Auth Milestone | `LEGAL REVIEW REQUIRED` |
| Consent withdrawal where applicable | Account Milestone | `NOT STARTED` | — | — | Depends on Consent system | `LEGAL REVIEW REQUIRED` |
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
| Privacy policy | Pre-Launch | `NOT STARTED` | — | — | Legal drafting required | `LEGAL REVIEW REQUIRED` |
| Terms of use | Pre-Launch | `NOT STARTED` | — | — | Legal drafting required | `LEGAL REVIEW REQUIRED` |
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
