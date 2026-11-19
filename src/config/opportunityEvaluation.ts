import {
  getEvidenceForProblem,
  validateEvidenceReferences,
  type IntegrityValidationResult,
  type Problem,
} from './problemExplorer';

/**
 * Non-interchangeable readiness and evaluation maturity states.
 * - `insufficient_evidence`: missing or demo-only data; no credible evaluation possible.
 * - `preliminary_hypothesis`: non-verified inputs or hypotheses exist, but lack verified sources.
 * - `evidence_supported`: backed by independently verified evidence records.
 */
export type EvaluationStatus =
  | 'insufficient_evidence'
  | 'preliminary_hypothesis'
  | 'evidence_supported';

/**
 * Provenance classification for every evaluation claim and risk item.
 * Prevents conflating user assertions or AI hypotheses with verified sources.
 */
export type ClaimBasis =
  | 'verified_source'
  | 'user_supplied'
  | 'ai_hypothesis'
  | 'unknown';

export type EvaluationDimensionKey =
  | 'evidence_strength'
  | 'customer_problem'
  | 'market_context'
  | 'existing_alternatives'
  | 'business_feasibility'
  | 'risks';

export type EvaluationDimensionStatus =
  | 'unavailable'
  | 'hypothesis_only'
  | 'evidence_backed';

export interface EvaluationReadiness {
  readonly problemId: string;
  readonly status: EvaluationStatus;
  readonly evidenceAvailable: boolean;
  readonly verifiedEvidenceCount: number;
  readonly missingRequirements: readonly string[];
  readonly limitations: readonly string[];
  readonly scoreEligible: boolean;
}

export interface EvaluationClaim {
  readonly id: string;
  readonly statement: string;
  readonly basis: ClaimBasis;
  readonly supportingEvidenceIds: readonly string[];
  readonly assumptions: readonly string[];
  readonly limitations: readonly string[];
}

export interface EvaluationDimension {
  readonly key: EvaluationDimensionKey;
  readonly label: string;
  readonly status: EvaluationDimensionStatus;
  readonly findings: readonly EvaluationClaim[];
  readonly assumptions: readonly string[];
  readonly limitations: readonly string[];
  readonly evidenceReferences: readonly string[];
  readonly unavailableReason: string | null;
  readonly score: number | null;
}

export interface EvaluationRisk {
  readonly id: string;
  readonly description: string;
  readonly basis: ClaimBasis;
  readonly supportingEvidenceIds: readonly string[];
}

export interface RecommendedValidationStep {
  readonly id: string;
  readonly action: string;
  readonly targetUnknownOrGap: string;
  readonly expectedSignal: string;
}

export interface OpportunityEvaluation {
  readonly id: string;
  readonly problemId: string;
  readonly status: EvaluationStatus;
  readonly createdAt: string | null;
  readonly dimensions: readonly EvaluationDimension[];
  readonly risks: readonly EvaluationRisk[];
  readonly assumptions: readonly string[];
  readonly unknowns: readonly string[];
  readonly recommendedNextSteps: readonly RecommendedValidationStep[];
  readonly overallScore: number | null;
  readonly scoreMethodologyVersion: string | null;
  readonly evidenceReferences: readonly string[];
  readonly limitations: readonly string[];
}

/**
 * Future server-side structured AI boundary contracts.
 * Keeps supplied facts, verified observations, AI interpretations, assumptions,
 * and unknown information strictly separated without coupling to any SDK.
 */
export interface EvaluationInputFact {
  readonly id: string;
  readonly text: string;
  readonly provenance: 'verified_observation' | 'user_supplied_fact';
  readonly evidenceId: string | null;
}

export interface StructuredEvaluationOutputDraft {
  readonly problemId: string;
  readonly suppliedFacts: readonly EvaluationInputFact[];
  readonly verifiedObservations: readonly EvaluationInputFact[];
  readonly aiInterpretations: readonly EvaluationClaim[];
  readonly assumptions: readonly string[];
  readonly unknownInformation: readonly string[];
}

const DIMENSION_SPECS: readonly {
  readonly key: EvaluationDimensionKey;
  readonly label: string;
  readonly unavailableReason: string;
}[] = [
  {
    key: 'evidence_strength',
    label: 'Evidence Strength',
    unavailableReason:
      'Verified source observations have not been connected yet; evidence strength cannot be assessed.',
  },
  {
    key: 'customer_problem',
    label: 'Customer Problem',
    unavailableReason:
      'Primary customer interviews and verified behavioral evidence are unavailable.',
  },
  {
    key: 'market_context',
    label: 'Market Context',
    unavailableReason:
      'Market sizing, demand frequency, and willingness-to-pay data are unavailable (unknown demand is not zero demand).',
  },
  {
    key: 'existing_alternatives',
    label: 'Existing Alternatives',
    unavailableReason:
      'Existing solutions and competitor shortcomings have not yet been researched.',
  },
  {
    key: 'business_feasibility',
    label: 'Business Feasibility',
    unavailableReason:
      'Delivery economics, unit costs, and operational feasibility require verified customer and alternative evidence first.',
  },
  {
    key: 'risks',
    label: 'Risks & Assumptions',
    unavailableReason:
      'Evidence-backed operational and market risks cannot be verified without source data.',
  },
] as const;

/**
 * Approved numerical scoring rubrics.
 * Intentionally empty until an explicit, reviewed, and versioned scoring methodology exists.
 */
export const APPROVED_SCORING_METHODOLOGY_VERSIONS: readonly string[] = [];

export function isApprovedScoringMethodology(
  version: string | null | undefined
): boolean {
  if (!version || !version.trim()) return false;
  return APPROVED_SCORING_METHODOLOGY_VERSIONS.includes(version.trim());
}

function isRecurrenceUnavailable(recurrenceNote: string): boolean {
  const normalized = recurrenceNote.trim().toLowerCase();
  return !normalized || normalized.startsWith('not available');
}

/**
 * Deterministically assesses whether a Problem record contains verified evidence
 * suitable for evaluation. Never infers viability or demand from category, title,
 * or summary, and never grants score eligibility without an approved methodology.
 */
export function getEvaluationReadiness(
  problem: Problem | null | undefined
): EvaluationReadiness {
  if (!problem || !problem.id || !problem.id.trim()) {
    return {
      problemId: '',
      status: 'insufficient_evidence',
      evidenceAvailable: false,
      verifiedEvidenceCount: 0,
      missingRequirements: [
        'A valid problem record is required before evaluation readiness can be assessed.',
      ],
      limitations: [
        'Problem record is missing or contains an invalid identifier.',
      ],
      scoreEligible: false,
    };
  }

  const integrity = validateEvidenceReferences(problem);
  const matchingEvidence = getEvidenceForProblem(problem.id, [problem]);
  const verifiedRecords = problem.isIllustrativeDemo
    ? []
    : matchingEvidence.filter(
        (record) => record.verificationStatus === 'verified'
      );

  const evidenceAvailable =
    !problem.isIllustrativeDemo && matchingEvidence.length > 0;
  const verifiedEvidenceCount = verifiedRecords.length;

  const missingRequirements: string[] = [];
  const limitations: string[] = [];

  if (problem.isIllustrativeDemo) {
    missingRequirements.push(
      'Replace illustrative demonstration placeholder with independently collected primary research.'
    );
    limitations.push(
      'This is an illustrative demonstration problem with no verified external or field evidence.'
    );
  }

  if (verifiedEvidenceCount === 0) {
    missingRequirements.push(
      'At least one independently verified primary evidence record is required.'
    );
  }

  if (isRecurrenceUnavailable(problem.recurrenceNote)) {
    missingRequirements.push(
      'Recurrence frequency has not yet been verified (unknown recurrence is not zero recurrence).'
    );
  }

  if (problem.existingAlternatives.length === 0) {
    missingRequirements.push(
      'Existing alternatives and observed shortcomings have not yet been researched.'
    );
  }

  if (problem.evidenceCoverage.sourceCount === null) {
    limitations.push(
      'Source coverage count is unknown and intentionally left unassigned.'
    );
  }

  if (!integrity.valid) {
    missingRequirements.push(
      'Resolve problem evidence integrity errors before evaluating.'
    );
    limitations.push(...integrity.errors);
  }

  // Numerical scoring always remains ineligible until a formal methodology is approved.
  const hasApprovedMethodology =
    APPROVED_SCORING_METHODOLOGY_VERSIONS.length > 0;
  if (!hasApprovedMethodology) {
    missingRequirements.push(
      'An explicitly approved and versioned numerical scoring methodology is required before scoring is eligible.'
    );
    limitations.push(
      'No numerical scoring rubric is currently approved; score calculation is disabled.'
    );
  }

  let status: EvaluationStatus = 'insufficient_evidence';
  if (!problem.isIllustrativeDemo && integrity.valid && evidenceAvailable) {
    status =
      verifiedEvidenceCount > 0
        ? 'evidence_supported'
        : 'preliminary_hypothesis';
  }

  return {
    problemId: problem.id,
    status,
    evidenceAvailable,
    verifiedEvidenceCount,
    missingRequirements,
    limitations,
    scoreEligible: false,
  };
}

/**
 * Creates a valid, honest initial OpportunityEvaluation structure without
 * fabricating customer claims, competitors, revenue models, or numerical scores.
 */
export function createEmptyEvaluation(
  problem: Problem | null | undefined
): OpportunityEvaluation {
  const readiness = getEvaluationReadiness(problem);

  const dimensions: EvaluationDimension[] = DIMENSION_SPECS.map((spec) => ({
    key: spec.key,
    label: spec.label,
    status: 'unavailable',
    findings: [],
    assumptions: [],
    limitations: [
      spec.unavailableReason,
      'Verified evidence is unavailable; no claims or scores are generated.',
    ],
    evidenceReferences: [],
    unavailableReason: spec.unavailableReason,
    score: null,
  }));

  if (!problem || !problem.id || !problem.id.trim()) {
    return {
      id: 'eval-missing-problem',
      problemId: '',
      status: 'insufficient_evidence',
      createdAt: null,
      dimensions,
      risks: [],
      assumptions: [],
      unknowns: [],
      recommendedNextSteps: [],
      overallScore: null,
      scoreMethodologyVersion: null,
      evidenceReferences: [],
      limitations: [
        'Cannot initialize opportunity evaluation because the problem record is missing or invalid.',
      ],
    };
  }

  return {
    id: `eval-${problem.id}`,
    problemId: problem.id,
    status:
      readiness.status === 'evidence_supported'
        ? 'insufficient_evidence'
        : readiness.status,
    createdAt: null,
    dimensions,
    risks: [],
    assumptions: [],
    unknowns: [...problem.unknownsAndRisks],
    recommendedNextSteps: [],
    overallScore: null,
    scoreMethodologyVersion: null,
    evidenceReferences: [],
    limitations: [
      'Verified evidence is unavailable for this problem; evaluation findings and numerical scores remain uncomputed.',
      'Unknown market demand and unverified recurrence must never be interpreted as zero demand or zero opportunity.',
      ...readiness.limitations,
    ],
  };
}

/**
 * Validates all claims, evidence references, provenance labels, status transitions,
 * and numerical score invariants on an OpportunityEvaluation against its Problem record.
 */
export function validateEvaluationClaims(
  evaluation: OpportunityEvaluation,
  problem: Problem | null | undefined
): IntegrityValidationResult {
  const errors: string[] = [];

  if (!problem || !problem.id || !problem.id.trim()) {
    return {
      valid: false,
      errors: [
        'Cannot validate evaluation against a missing or invalid problem record.',
      ],
    };
  }

  if (!evaluation.id.trim()) {
    errors.push('Evaluation id must not be empty.');
  }

  if (!evaluation.problemId.trim()) {
    errors.push('Evaluation problemId must not be empty.');
  } else if (evaluation.problemId !== problem.id) {
    errors.push(
      `Evaluation "${evaluation.id}" references mismatched problemId "${evaluation.problemId}" (expected "${problem.id}").`
    );
  }

  const problemIntegrity = validateEvidenceReferences(problem);
  if (!problemIntegrity.valid) {
    errors.push(...problemIntegrity.errors);
  }

  const evidenceById = new Map(
    problem.evidence
      .filter((record) => record.problemId === problem.id)
      .map((record) => [record.id, record])
  );
  const verifiedEvidenceIds = new Set(
    problem.isIllustrativeDemo
      ? []
      : problem.evidence
          .filter(
            (record) =>
              record.problemId === problem.id &&
              record.verificationStatus === 'verified'
          )
          .map((record) => record.id)
  );

  // Demonstration records cannot be falsely marked as evidence-supported or scored.
  if (problem.isIllustrativeDemo && evaluation.status === 'evidence_supported') {
    errors.push(
      `Demonstration problem "${problem.id}" cannot be represented as a completed evidence_supported evaluation.`
    );
  }

  if (evaluation.overallScore !== null) {
    if (problem.isIllustrativeDemo) {
      errors.push(
        `Demonstration problem "${problem.id}" cannot have a non-null overallScore.`
      );
    }

    if (
      typeof evaluation.overallScore !== 'number' ||
      Number.isNaN(evaluation.overallScore) ||
      !Number.isFinite(evaluation.overallScore) ||
      evaluation.overallScore < 0 ||
      evaluation.overallScore > 100
    ) {
      errors.push(
        `Evaluation "${evaluation.id}" has an invalid overallScore (${String(evaluation.overallScore)}).`
      );
    }

    if (evaluation.status !== 'evidence_supported') {
      errors.push(
        `Evaluation "${evaluation.id}" cannot provide overallScore while status is "${evaluation.status}".`
      );
    }

    if (!isApprovedScoringMethodology(evaluation.scoreMethodologyVersion)) {
      errors.push(
        `Evaluation "${evaluation.id}" supplies overallScore without an approved scoreMethodologyVersion.`
      );
    }

    if (verifiedEvidenceIds.size === 0) {
      errors.push(
        `Evaluation "${evaluation.id}" supplies overallScore without any verified evidence records.`
      );
    }
  } else if (
    evaluation.scoreMethodologyVersion !== null &&
    !isApprovedScoringMethodology(evaluation.scoreMethodologyVersion)
  ) {
    errors.push(
      `Evaluation "${evaluation.id}" references unapproved scoreMethodologyVersion "${evaluation.scoreMethodologyVersion}".`
    );
  }

  // Validate top-level evidence references
  for (const evId of evaluation.evidenceReferences) {
    if (!evidenceById.has(evId)) {
      errors.push(
        `Evaluation "${evaluation.id}" references missing or foreign evidence ID "${evId}".`
      );
    }
  }

  const seenClaimIds = new Set<string>();
  let hasVerifiedClaim = false;

  for (const dimension of evaluation.dimensions) {
    if (dimension.score !== null) {
      if (problem.isIllustrativeDemo) {
        errors.push(
          `Demonstration problem "${problem.id}" cannot assign a numeric score to dimension "${dimension.key}".`
        );
      }
      if (!isApprovedScoringMethodology(evaluation.scoreMethodologyVersion)) {
        errors.push(
          `Dimension "${dimension.key}" assigns a numeric score without an approved scoreMethodologyVersion.`
        );
      }
    }

    for (const evId of dimension.evidenceReferences) {
      if (!evidenceById.has(evId)) {
        errors.push(
          `Dimension "${dimension.key}" references missing or foreign evidence ID "${evId}".`
        );
      }
    }

    let dimensionHasVerifiedClaim = false;

    for (const claim of dimension.findings) {
      if (!claim.id.trim()) {
        errors.push(
          `Dimension "${dimension.key}" contains a claim with an empty id.`
        );
      } else if (seenClaimIds.has(claim.id)) {
        errors.push(`Duplicate claim ID "${claim.id}" detected in evaluation.`);
      } else {
        seenClaimIds.add(claim.id);
      }

      if (!claim.statement.trim()) {
        errors.push(
          `Claim "${claim.id}" in dimension "${dimension.key}" has an empty statement.`
        );
      }

      for (const evId of claim.supportingEvidenceIds) {
        const matched = evidenceById.get(evId);
        if (!matched) {
          errors.push(
            `Claim "${claim.id}" references missing or foreign evidence ID "${evId}".`
          );
        }
      }

      if (claim.basis === 'verified_source') {
        if (claim.supportingEvidenceIds.length === 0) {
          errors.push(
            `Verified-source claim "${claim.id}" must reference at least one verified evidence record.`
          );
        } else {
          const allVerified = claim.supportingEvidenceIds.every((evId) =>
            verifiedEvidenceIds.has(evId)
          );
          if (!allVerified) {
            errors.push(
              `Verified-source claim "${claim.id}" references unverified, illustrative, or foreign evidence.`
            );
          } else {
            hasVerifiedClaim = true;
            dimensionHasVerifiedClaim = true;
          }
        }
      }
    }

    if (
      dimension.status === 'evidence_backed' &&
      !dimensionHasVerifiedClaim
    ) {
      errors.push(
        `Dimension "${dimension.key}" is marked evidence_backed without any verified_source claims backed by verified evidence.`
      );
    }
  }

  const seenRiskIds = new Set<string>();
  for (const risk of evaluation.risks) {
    if (!risk.id.trim()) {
      errors.push('Evaluation risk item has an empty id.');
    } else if (seenRiskIds.has(risk.id)) {
      errors.push(`Duplicate risk ID "${risk.id}" detected in evaluation.`);
    } else {
      seenRiskIds.add(risk.id);
    }

    for (const evId of risk.supportingEvidenceIds) {
      if (!evidenceById.has(evId)) {
        errors.push(
          `Risk "${risk.id}" references missing or foreign evidence ID "${evId}".`
        );
      }
    }

    if (risk.basis === 'verified_source') {
      if (
        risk.supportingEvidenceIds.length === 0 ||
        !risk.supportingEvidenceIds.every((evId) => verifiedEvidenceIds.has(evId))
      ) {
        errors.push(
          `Verified-source risk "${risk.id}" must reference verified evidence belonging to problem "${problem.id}".`
        );
      }
    }
  }

  if (evaluation.status === 'evidence_supported') {
    if (verifiedEvidenceIds.size === 0) {
      errors.push(
        `Evaluation "${evaluation.id}" cannot have status "evidence_supported" without verified evidence on problem "${problem.id}".`
      );
    }
    if (!hasVerifiedClaim) {
      errors.push(
        `Evaluation "${evaluation.id}" cannot have status "evidence_supported" using only user_supplied or ai_hypothesis claims.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
