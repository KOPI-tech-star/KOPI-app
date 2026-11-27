# KOPI Research Import Package Schema (`packageVersion: 1`)

This specification defines the validated JSON import package format accepted by Kopi's server-only research administration CLI:

```bash
npx tsx server/admin/cli.ts research-import --file <package.json> --dry-run
npx tsx server/admin/cli.ts research-import --file <package.json> --apply --approve
```

## Core Governance & Safety Rules

1. **Approved, Active Sources Only:** Every `dataSource` and every referenced `sourceId` must satisfy:
   - `permissionReviewStatus === "approved"`
   - `activationStatus === "active"`
2. **Zero Scraping / Zero PII:** Packages containing scraping directives (`scrapeUrl`, `htmlSelector`, `cssSelector`, `xpath`, `bypassRobots`, `bypassPaywall`, `cookieHeader`, `sessionCookie`), email addresses, phone numbers, raw HTML/script tags, or non-HTTPS URLs are rejected before any Firestore write.
3. **Explicit Synthetic vs Real Marker:** Every package must declare `"isSyntheticTestFixture": true` for synthetic test fixtures or `false` for vetted real research.
4. **Canonical URL Normalization & Deduplication:**
   - Incoming `permittedSourceUrl` values are canonicalized (lowercase scheme/host, stripping `utm_*`, `fbclid`, `gclid`, `mc_cid`, `mc_eid`, fragment hashes, and trailing slashes).
   - Observations are hashed deterministically (`sha256-...` over `sourceId`, `canonicalUrl`, normalized `permittedExcerptOrSummary`, and normalized `problemStatement`) and deduplicated across existing Firestore `sourceObservations` and within the current batch.
5. **Append-Safe & Keyless:** Arbitrary deletion is strictly prohibited. All writes run via keyless ADC impersonation targeting Kopi's named Firestore database inside atomic transactions with post-write read-back verification.

## Package Top-Level Fields

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `packageVersion` | `1` | Yes | Schema version (`1`). |
| `packageId` | `string` | Yes | Firestore-safe package identifier (`[a-zA-Z0-9_-]`). |
| `isSyntheticTestFixture` | `boolean` | Yes | `true` for synthetic test fixtures; `false` for real research. |
| `description` | `string` | No | Human-readable summary of the package contents. |
| `sources` | `DataSourceDocument[]` | Yes | Approved, active source metadata records. |
| `observations` | `ResearchImportObservationInput[]` | Yes | Permitted excerpts/summaries linked to an approved `sourceId`. |

## `DataSourceDocument` Required Fields

- `sourceId` (valid Firestore doc ID)
- `sourceName`, `sourceCategory` (`civic_feedback | public_forum | app_reviews | research_report | news_or_trade_press | customer_interview | internal_manual_research`)
- `permittedAccessMechanism` (`official_api | open_dataset | manual_import | permitted_feed | founder_interview`)
- `termsOrLicenceReference`, `permissionReviewStatus` (`"approved"`), `reviewDate` (ISO timestamp)
- `attributionRequirements`, `retentionRestrictions`, `activationStatus` (`"active"`)
- `createdAt`, `updatedAt` (ISO timestamps), `schemaVersion: 1`

## `ResearchImportObservationInput` Fields

- **Required:** `sourceId`, `externalReference`, `permittedExcerptOrSummary`, `observationTimestamp` (ISO timestamp), `provenance`, `retentionPolicy`
- **Recommended:** `observationId` (derived deterministically if omitted), `permittedSourceUrl` (`https://...` or `null`), `sourceType` (`research_publication | government_dataset | news_article | community_submission | forum_thread | field_observation | interview_note | review_excerpt | support_ticket`), `sourceName`, `independentGroupKey` (prevents syndication double-counting), `geography`, `verificationStatus` (`verified | unverified | illustrative_demo`), `publicationTimestamp`, `removalOrRestrictionStatus` (`active | restricted | removed`)
- **Structured Problem Fields (optional pre-extraction or populated by `extract-observations`):** `problemStatement`, `context`, `affectedCustomerSegment`, `reportedConsequences`, `existingWorkaround`, `spendingOrWtpSignal`

## Complete End-to-End Editorial Workflow

1. `research-import --file <pkg.json> [--dry-run | --apply --approve]`
2. `extract-observations [--observation-id <id>] [--dry-run | --apply --approve]` *(requires `GEMINI_API_KEY`)*
3. `propose-clusters [--dry-run | --apply --approve]`
4. `assess-evidence --problem-id <id> [--dry-run | --apply --approve]`
5. `review-cluster --problem-id <id> --action submit --reviewer <id> [--apply --approve]`
6. `review-cluster --problem-id <id> --action approve --reviewer <id> [--exception-reason "..."] [--apply --approve]`
7. `preview-publication --problem-id <id>`
8. `publish-problem --problem-id <id> [--dry-run | --apply --approve]`
9. `archive-problem --problem-id <id> --reason "..." [--dry-run | --apply --approve]`
