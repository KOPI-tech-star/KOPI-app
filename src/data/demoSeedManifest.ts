import { DEMO_OPPORTUNITIES } from '../config/opportunityRadar';
import { PROBLEM_RECORDS } from '../config/problemExplorer';
import {
  APPROVED_DEMO_PROBLEM_IDS,
  FIRESTORE_COLLECTION_NAMES,
  type ApprovedDemoProblemId,
  type DemoProblemDocument,
} from './firestoreContracts';

export interface DemoSeedManifestEntry {
  readonly collection: typeof FIRESTORE_COLLECTION_NAMES.demoProblems;
  readonly documentId: ApprovedDemoProblemId;
  readonly documentPath: `demoProblems/${ApprovedDemoProblemId}`;
  readonly data: DemoProblemDocument;
}

const SHARED_RESEARCH_LIMITATIONS: readonly string[] = [
  'Illustrative demonstration example only — not verified primary research.',
  'Verified evidence count is 0 and source coverage remains unknown (null).',
  'No numerical opportunity score or commercial viability estimate is assigned.',
] as const;

function buildSeedEntry(problemId: ApprovedDemoProblemId): DemoSeedManifestEntry {
  const radar = DEMO_OPPORTUNITIES.find((item) => item.id === problemId);
  const problem = PROBLEM_RECORDS.find((item) => item.id === problemId);

  if (!radar || !problem) {
    throw new Error(`Missing local demonstration seed data for "${problemId}".`);
  }

  return {
    collection: FIRESTORE_COLLECTION_NAMES.demoProblems,
    documentId: problemId,
    documentPath: `demoProblems/${problemId}`,
    data: {
      id: problemId,
      slug: problemId,
      title: problem.title,
      summary: problem.summary,
      categoryLabel: radar.categoryLabel,
      categories: [...problem.categories],
      illustration: radar.illustration,
      tags: [...radar.tags],
      affectedAudience: [...problem.affectedAudience],
      recurrenceNote: problem.recurrenceNote,
      isIllustrativeDemo: true,
      evidenceAvailability: 'none',
      verifiedEvidenceCount: 0,
      sourceCoverage: null,
      lastUpdated: null,
      coverageNote: problem.evidenceCoverage.coverageNote,
      researchLimitations: [...SHARED_RESEARCH_LIMITATIONS],
      unknownsAndRisks: [...problem.unknownsAndRisks],
      evidence: [],
      insights: [],
      existingAlternatives: [],
      opportunityScore: null,
      schemaVersion: 1,
    },
  };
}

/**
 * Reproducible, read-only seed manifest defining the exact three approved
 * `demoProblems` documents for Milestone F2. Contains zero fabricated URLs,
 * customer quotes, market metrics, or numerical scores.
 */
export const DEMO_PROBLEMS_SEED_MANIFEST: readonly DemoSeedManifestEntry[] =
  APPROVED_DEMO_PROBLEM_IDS.map((id) => buildSeedEntry(id));
