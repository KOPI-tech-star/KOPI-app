import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROBLEM_RECORDS,
  getProblemById,
  type Problem,
} from './problemExplorer';
import {
  createEmptyEvaluation,
  getEvaluationReadiness,
  validateEvaluationClaims,
  type OpportunityEvaluation,
  type StructuredEvaluationOutputDraft,
} from './opportunityEvaluation';

// Synthetic test fixture only — not real or verified market data.
function createSyntheticVerifiedProblemFixture(): Problem {
  return {
    id: 'synthetic-verified-problem',
    slug: 'synthetic-verified-problem',
    title: 'Synthetic Verified Problem Fixture',
    summary: 'Synthetic problem fixture for unit-testing claim validation.',
    categories: ['Daily Life'],
    affectedAudience: ['Synthetic test group'],
    recurrenceNote: 'Synthetic weekly pattern fixture',
    isIllustrativeDemo: false,
    evidenceCoverage: {
      sourceCount: 2,
      verifiedCount: 1,
      illustrativeCount: 0,
      lastUpdated: '2026-01-15',
      coverageNote: 'Synthetic test coverage fixture.',
    },
    evidence: [
      {
        id: 'synthetic-ev-verified-1',
        problemId: 'synthetic-verified-problem',
        sourceType: 'interview_note',
        sourceName: 'Synthetic Interview 01',
        excerpt: 'Synthetic verified observation excerpt.',
        observedDate: '2026-01-10',
        externalUrl: null,
        verificationStatus: 'verified',
      },
      {
        id: 'synthetic-ev-unverified-2',
        problemId: 'synthetic-verified-problem',
        sourceType: 'forum_thread',
        sourceName: 'Synthetic Forum Thread 02',
        excerpt: 'Synthetic unverified forum post excerpt.',
        observedDate: '2026-01-12',
        externalUrl: null,
        verificationStatus: 'unverified',
      },
    ],
    insights: [],
    existingAlternatives: [],
    unknownsAndRisks: ['Synthetic unknown gap'],
  };
}

test('A. Existing demonstration problems stay unchanged and produce insufficient_evidence with null scores', () => {
  const expectedIds = [
    'wet-entrance-monsoons',
    'student-nutrition-consistency',
    'excessive-small-delivery-packaging',
  ];

  assert.deepEqual(
    PROBLEM_RECORDS.map((p) => p.id),
    expectedIds
  );

  for (const id of expectedIds) {
    const problem = getProblemById(id);
    assert.ok(problem, `Expected existing problem record "${id}"`);

    const readiness = getEvaluationReadiness(problem);
    assert.equal(readiness.problemId, id);
    assert.equal(readiness.status, 'insufficient_evidence');
    assert.equal(readiness.evidenceAvailable, false);
    assert.equal(readiness.verifiedEvidenceCount, 0);
    assert.equal(readiness.scoreEligible, false);
    assert.ok(readiness.missingRequirements.length > 0);
    assert.ok(readiness.limitations.length > 0);

    const evaluation = createEmptyEvaluation(problem);
    assert.equal(evaluation.problemId, id);
    assert.equal(evaluation.status, 'insufficient_evidence');
    assert.equal(evaluation.overallScore, null);
    assert.equal(evaluation.scoreMethodologyVersion, null);

    const validation = validateEvaluationClaims(evaluation, problem);
    assert.equal(validation.valid, true, validation.errors.join('\n'));
  }
});

test('A2. Having one verified source does not automatically make a problem score-eligible', () => {
  const syntheticProblem = createSyntheticVerifiedProblemFixture();
  const readiness = getEvaluationReadiness(syntheticProblem);

  assert.equal(readiness.evidenceAvailable, true);
  assert.equal(readiness.verifiedEvidenceCount, 1);
  assert.equal(readiness.status, 'evidence_supported');
  // Scoring eligibility remains false without an explicitly approved methodology rubric
  assert.equal(readiness.scoreEligible, false);
  assert.ok(
    readiness.missingRequirements.some((req) =>
      /scoring methodology/i.test(req)
    )
  );
});

test('B. Missing or invalid problems fail safely across readiness, empty evaluation, and validation', () => {
  const missingReadiness = getEvaluationReadiness(null);
  assert.equal(missingReadiness.problemId, '');
  assert.equal(missingReadiness.status, 'insufficient_evidence');
  assert.equal(missingReadiness.evidenceAvailable, false);
  assert.equal(missingReadiness.verifiedEvidenceCount, 0);
  assert.equal(missingReadiness.scoreEligible, false);

  const missingEval = createEmptyEvaluation(undefined);
  assert.equal(missingEval.problemId, '');
  assert.equal(missingEval.status, 'insufficient_evidence');
  assert.equal(missingEval.overallScore, null);

  const validationNull = validateEvaluationClaims(missingEval, null);
  assert.equal(validationNull.valid, false);

  const monsoon = getProblemById('wet-entrance-monsoons');
  assert.ok(monsoon);
  const mismatchedEval: OpportunityEvaluation = {
    ...createEmptyEvaluation(monsoon),
    problemId: 'different-problem-id',
  };
  const mismatchedResult = validateEvaluationClaims(mismatchedEval, monsoon);
  assert.equal(mismatchedResult.valid, false);
  assert.ok(
    mismatchedResult.errors.some((e) => /mismatched problemId/i.test(e))
  );
});

test('C. Claim validation rejects foreign evidence IDs, nonexistent references, unverified claims marked verified, duplicate IDs, unsupported scores, and false evidence_supported demos', () => {
  const monsoon = getProblemById('wet-entrance-monsoons');
  assert.ok(monsoon);
  const syntheticProblem = createSyntheticVerifiedProblemFixture();

  // 1. Evidence ID belonging to another problem
  const baseSyntheticEval = createEmptyEvaluation(syntheticProblem);
  const foreignEvidenceEval: OpportunityEvaluation = {
    ...baseSyntheticEval,
    dimensions: baseSyntheticEval.dimensions.map((dim) =>
      dim.key === 'customer_problem'
        ? {
            ...dim,
            status: 'hypothesis_only',
            findings: [
              {
                id: 'claim-foreign',
                statement: 'Foreign reference check',
                basis: 'user_supplied',
                supportingEvidenceIds: ['other-problem-ev-99'],
                assumptions: [],
                limitations: [],
              },
            ],
          }
        : dim
    ),
  };
  const foreignRes = validateEvaluationClaims(
    foreignEvidenceEval,
    syntheticProblem
  );
  assert.equal(foreignRes.valid, false);
  assert.ok(
    foreignRes.errors.some((e) => /missing or foreign evidence ID/i.test(e))
  );

  // 2. Verified-source claim without evidence or referencing unverified evidence
  const unbackedVerifiedEval: OpportunityEvaluation = {
    ...baseSyntheticEval,
    dimensions: baseSyntheticEval.dimensions.map((dim) =>
      dim.key === 'customer_problem'
        ? {
            ...dim,
            status: 'evidence_backed',
            findings: [
              {
                id: 'claim-no-ev',
                statement: 'Claim with no evidence',
                basis: 'verified_source',
                supportingEvidenceIds: [],
                assumptions: [],
                limitations: [],
              },
              {
                id: 'claim-unverified-ev',
                statement: 'Claim referencing unverified forum thread',
                basis: 'verified_source',
                supportingEvidenceIds: ['synthetic-ev-unverified-2'],
                assumptions: [],
                limitations: [],
              },
            ],
          }
        : dim
    ),
  };
  const unbackedRes = validateEvaluationClaims(
    unbackedVerifiedEval,
    syntheticProblem
  );
  assert.equal(unbackedRes.valid, false);
  assert.ok(
    unbackedRes.errors.some((e) =>
      /must reference at least one verified evidence/i.test(e)
    )
  );
  assert.ok(
    unbackedRes.errors.some((e) =>
      /references unverified, illustrative, or foreign evidence/i.test(e)
    )
  );

  // 3. Duplicate claim IDs
  const duplicateClaimEval: OpportunityEvaluation = {
    ...baseSyntheticEval,
    dimensions: baseSyntheticEval.dimensions.map((dim) =>
      dim.key === 'customer_problem'
        ? {
            ...dim,
            status: 'hypothesis_only',
            findings: [
              {
                id: 'dup-claim-1',
                statement: 'First hypothesis',
                basis: 'ai_hypothesis',
                supportingEvidenceIds: [],
                assumptions: ['Assumption A'],
                limitations: ['Unverified'],
              },
              {
                id: 'dup-claim-1',
                statement: 'Second hypothesis with duplicate id',
                basis: 'user_supplied',
                supportingEvidenceIds: [],
                assumptions: [],
                limitations: [],
              },
            ],
          }
        : dim
    ),
  };
  const dupRes = validateEvaluationClaims(duplicateClaimEval, syntheticProblem);
  assert.equal(dupRes.valid, false);
  assert.ok(dupRes.errors.some((e) => /Duplicate claim ID/i.test(e)));

  // 4. Unsupported numeric overallScore or dimension score
  const scoredDemoEval: OpportunityEvaluation = {
    ...createEmptyEvaluation(monsoon),
    overallScore: 72,
    scoreMethodologyVersion: 'v1-unapproved',
  };
  const scoredDemoRes = validateEvaluationClaims(scoredDemoEval, monsoon);
  assert.equal(scoredDemoRes.valid, false);
  assert.ok(
    scoredDemoRes.errors.some((e) => /cannot have a non-null overallScore/i.test(e))
  );

  const scoredSyntheticEval: OpportunityEvaluation = {
    ...baseSyntheticEval,
    status: 'evidence_supported',
    overallScore: 72,
    scoreMethodologyVersion: null,
  };
  const scoredSyntheticRes = validateEvaluationClaims(
    scoredSyntheticEval,
    syntheticProblem
  );
  assert.equal(scoredSyntheticRes.valid, false);
  assert.ok(
    scoredSyntheticRes.errors.some((e) =>
      /without an approved scoreMethodologyVersion/i.test(e)
    )
  );

  // 5. Demonstration evaluation falsely marked evidence_supported
  const forgedDemoEval: OpportunityEvaluation = {
    ...createEmptyEvaluation(monsoon),
    status: 'evidence_supported',
  };
  const forgedDemoRes = validateEvaluationClaims(forgedDemoEval, monsoon);
  assert.equal(forgedDemoRes.valid, false);
  assert.ok(
    forgedDemoRes.errors.some((e) =>
      /cannot be represented as a completed evidence_supported evaluation/i.test(e)
    )
  );
});

test('D. AI hypotheses and user-supplied assertions remain distinguishable from evidence-backed claims', () => {
  const syntheticProblem = createSyntheticVerifiedProblemFixture();
  const baseEval = createEmptyEvaluation(syntheticProblem);

  // An evaluation containing ONLY ai_hypothesis + user_supplied cannot pass as evidence_supported
  const hypothesisOnlyMasquerade: OpportunityEvaluation = {
    ...baseEval,
    status: 'evidence_supported',
    dimensions: baseEval.dimensions.map((dim) =>
      dim.key === 'customer_problem'
        ? {
            ...dim,
            status: 'evidence_backed',
            findings: [
              {
                id: 'hyp-1',
                statement: 'Synthetic AI hypothesis about lobby traffic',
                basis: 'ai_hypothesis',
                supportingEvidenceIds: [],
                assumptions: ['Synthetic assumption'],
                limitations: ['Requires primary observation'],
              },
              {
                id: 'usr-1',
                statement: 'Synthetic user assertion without verification',
                basis: 'user_supplied',
                supportingEvidenceIds: [],
                assumptions: [],
                limitations: ['Unverified self-report'],
              },
            ],
          }
        : dim
    ),
  };

  const masqueradeResult = validateEvaluationClaims(
    hypothesisOnlyMasquerade,
    syntheticProblem
  );
  assert.equal(masqueradeResult.valid, false);
  assert.ok(
    masqueradeResult.errors.some((e) =>
      /marked evidence_backed without any verified_source claims/i.test(e)
    )
  );
  assert.ok(
    masqueradeResult.errors.some((e) =>
      /using only user_supplied or ai_hypothesis claims/i.test(e)
    )
  );

  // Properly labelled preliminary_hypothesis passes validation cleanly
  const validPreliminary: OpportunityEvaluation = {
    ...hypothesisOnlyMasquerade,
    status: 'preliminary_hypothesis',
    dimensions: hypothesisOnlyMasquerade.dimensions.map((dim) =>
      dim.key === 'customer_problem'
        ? { ...dim, status: 'hypothesis_only' }
        : dim
    ),
  };
  const validPrelimResult = validateEvaluationClaims(
    validPreliminary,
    syntheticProblem
  );
  assert.equal(validPrelimResult.valid, true, validPrelimResult.errors.join('\n'));

  // Future Gemini boundary structure keeps provenance explicitly separated
  const futureDraft: StructuredEvaluationOutputDraft = {
    problemId: syntheticProblem.id,
    suppliedFacts: [
      {
        id: 'fact-user-1',
        text: 'Synthetic user context',
        provenance: 'user_supplied_fact',
        evidenceId: null,
      },
    ],
    verifiedObservations: [
      {
        id: 'obs-1',
        text: 'Synthetic verified observation excerpt.',
        provenance: 'verified_observation',
        evidenceId: 'synthetic-ev-verified-1',
      },
    ],
    aiInterpretations: [
      {
        id: 'ai-interp-1',
        statement: 'Synthetic AI interpretation',
        basis: 'ai_hypothesis',
        supportingEvidenceIds: [],
        assumptions: ['Synthetic AI assumption'],
        limitations: ['Must not be stored as verified evidence'],
      },
    ],
    assumptions: ['Synthetic assumption'],
    unknownInformation: ['Synthetic unknown gap'],
  };
  assert.equal(futureDraft.aiInterpretations[0]?.basis, 'ai_hypothesis');
  assert.equal(futureDraft.verifiedObservations[0]?.provenance, 'verified_observation');
});

test('E. Unknown market data and unknown recurrence never default to zero values', () => {
  for (const problem of PROBLEM_RECORDS) {
    const readiness = getEvaluationReadiness(problem);
    assert.ok(
      readiness.missingRequirements.some((req) =>
        /recurrence/i.test(req)
      )
    );

    const emptyEval = createEmptyEvaluation(problem);
    assert.equal(emptyEval.overallScore, null);
    assert.notEqual(emptyEval.overallScore, 0);

    const marketDim = emptyEval.dimensions.find(
      (d) => d.key === 'market_context'
    );
    assert.ok(marketDim);
    assert.equal(marketDim.status, 'unavailable');
    assert.equal(marketDim.score, null);
    assert.notEqual(marketDim.score, 0);
    assert.match(marketDim.unavailableReason ?? '', /unknown demand is not zero demand/i);
  }
});

test('F. createEmptyEvaluation preserves research gaps, keeps findings empty, and avoids fabricated competitors or revenue models', () => {
  const nutrition = getProblemById('student-nutrition-consistency');
  assert.ok(nutrition);

  const emptyEval = createEmptyEvaluation(nutrition);

  assert.equal(emptyEval.problemId, nutrition.id);
  assert.equal(emptyEval.status, 'insufficient_evidence');
  assert.equal(emptyEval.createdAt, null);
  assert.equal(emptyEval.overallScore, null);
  assert.equal(emptyEval.scoreMethodologyVersion, null);
  assert.equal(emptyEval.dimensions.length, 6);
  assert.deepEqual(emptyEval.risks, []);
  assert.deepEqual(emptyEval.assumptions, []);
  assert.deepEqual(emptyEval.recommendedNextSteps, []);
  assert.deepEqual(emptyEval.evidenceReferences, []);
  assert.deepEqual(emptyEval.unknowns, nutrition.unknownsAndRisks);

  for (const dim of emptyEval.dimensions) {
    assert.equal(dim.status, 'unavailable');
    assert.deepEqual(dim.findings, []);
    assert.deepEqual(dim.assumptions, []);
    assert.deepEqual(dim.evidenceReferences, []);
    assert.equal(dim.score, null);
    assert.ok(dim.limitations.length > 0);
  }

  assert.ok(
    emptyEval.limitations.some((l) => /verified evidence is unavailable/i.test(l))
  );
});
