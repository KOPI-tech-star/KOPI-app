import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_OPPORTUNITIES } from './opportunityRadar';
import {
  PROBLEM_RECORDS,
  filterProblems,
  getEvidenceForProblem,
  getProblemById,
  sanitizeExternalUrl,
  validateEvidenceReferences,
  validateProblemDatasetIntegrity,
  type Problem,
} from './problemExplorer';

test('PROBLEM_RECORDS preserve all three Opportunity Radar IDs, titles, descriptions, and categories', () => {
  assert.equal(PROBLEM_RECORDS.length, 3);
  assert.deepEqual(
    PROBLEM_RECORDS.map((p) => p.id),
    DEMO_OPPORTUNITIES.map((o) => o.id)
  );

  for (const opp of DEMO_OPPORTUNITIES) {
    const problem = getProblemById(opp.id);
    assert.ok(problem, `Expected problem for Radar ID "${opp.id}"`);
    assert.equal(problem.title, opp.title);
    assert.equal(problem.summary, opp.description);
    assert.deepEqual(problem.categories, opp.categories);
  }
});

test('Demonstration records remain explicitly marked illustrative with empty evidence and unknown coverage', () => {
  const integrity = validateProblemDatasetIntegrity(PROBLEM_RECORDS);
  assert.equal(integrity.valid, true, integrity.errors.join('\n'));

  for (const problem of PROBLEM_RECORDS) {
    assert.equal(problem.isIllustrativeDemo, true);
    assert.deepEqual(problem.evidence, []);
    assert.deepEqual(problem.insights, []);
    assert.deepEqual(problem.existingAlternatives, []);
    assert.equal(problem.evidenceCoverage.sourceCount, null);
    assert.equal(problem.evidenceCoverage.verifiedCount, 0);
    assert.equal(problem.evidenceCoverage.lastUpdated, null);
    assert.match(
      problem.evidenceCoverage.coverageNote,
      /not connected|illustrative demonstration/i
    );
    assert.ok(!('opportunityScore' in problem));
  }
});

test('getProblemById retrieves existing records and returns null for unknown or blank IDs', () => {
  const monsoon = getProblemById('wet-entrance-monsoons');
  assert.ok(monsoon);
  assert.equal(monsoon.id, 'wet-entrance-monsoons');

  assert.equal(getProblemById('nonexistent-problem-id'), null);
  assert.equal(getProblemById('   '), null);
});

test('getEvidenceForProblem returns empty array for current demo records and nonexistent IDs', () => {
  assert.deepEqual(getEvidenceForProblem('wet-entrance-monsoons'), []);
  assert.deepEqual(getEvidenceForProblem('nonexistent-problem-id'), []);
});

test('filterProblems searches by title, filters by category, handles no matches, and clears cleanly', () => {
  const byTitle = filterProblems(PROBLEM_RECORDS, { query: 'monsoons' });
  assert.equal(byTitle.length, 1);
  assert.equal(byTitle[0]?.id, 'wet-entrance-monsoons');

  const byCategory = filterProblems(PROBLEM_RECORDS, { category: 'Education' });
  assert.equal(byCategory.length, 1);
  assert.equal(byCategory[0]?.id, 'student-nutrition-consistency');

  const byCategorySearch = filterProblems(PROBLEM_RECORDS, {
    query: 'packaging',
    category: 'Sustainability',
  });
  assert.equal(byCategorySearch.length, 1);
  assert.equal(byCategorySearch[0]?.id, 'excessive-small-delivery-packaging');

  const noMatches = filterProblems(PROBLEM_RECORDS, {
    query: 'quantum compiler',
    category: 'All',
  });
  assert.deepEqual(noMatches, []);

  const cleared = filterProblems(PROBLEM_RECORDS, { query: '', category: 'All' });
  assert.equal(cleared.length, 3);
});

test('validateProblemDatasetIntegrity rejects duplicate problem IDs and duplicate evidence IDs', () => {
  const base = PROBLEM_RECORDS[0];
  assert.ok(base);

  const duplicateProblems = validateProblemDatasetIntegrity([base, base]);
  assert.equal(duplicateProblems.valid, false);
  assert.ok(
    duplicateProblems.errors.some((err) => /Duplicate problem ID/i.test(err))
  );

  const duplicateEvidenceProblem: Problem = {
    ...base,
    evidence: [
      {
        id: 'ev-dup-1',
        problemId: base.id,
        sourceType: 'field_observation',
        sourceName: 'Demo note A',
        excerpt: 'Sample excerpt A',
        observedDate: null,
        externalUrl: null,
        verificationStatus: 'illustrative_demo',
      },
      {
        id: 'ev-dup-1',
        problemId: base.id,
        sourceType: 'field_observation',
        sourceName: 'Demo note B',
        excerpt: 'Sample excerpt B',
        observedDate: null,
        externalUrl: null,
        verificationStatus: 'illustrative_demo',
      },
    ],
  };

  const dupEvResult = validateEvidenceReferences(duplicateEvidenceProblem);
  assert.equal(dupEvResult.valid, false);
  assert.ok(dupEvResult.errors.some((err) => /duplicate evidence ID/i.test(err)));
});

test('validateEvidenceReferences rejects unsupported insights, foreign evidence IDs, and demo records marked verified', () => {
  const base = PROBLEM_RECORDS[0];
  assert.ok(base);

  const unsupportedInsightProblem: Problem = {
    ...base,
    insights: [
      {
        id: 'ins-empty',
        statement: 'Unsupported claim without evidence.',
        kind: 'evidence_backed',
        supportingEvidenceIds: [],
      },
      {
        id: 'ins-missing-ref',
        statement: 'References nonexistent evidence.',
        kind: 'evidence_backed',
        supportingEvidenceIds: ['ev-does-not-exist'],
      },
    ],
  };

  const insightResult = validateEvidenceReferences(unsupportedInsightProblem);
  assert.equal(insightResult.valid, false);
  assert.equal(insightResult.errors.length, 2);

  const mismatchedParentProblem: Problem = {
    ...base,
    evidence: [
      {
        id: 'ev-foreign',
        problemId: 'different-problem-id',
        sourceType: 'dataset_demo',
        sourceName: 'Sample',
        excerpt: 'Sample',
        observedDate: null,
        externalUrl: null,
        verificationStatus: 'illustrative_demo',
      },
    ],
  };

  const parentResult = validateEvidenceReferences(mismatchedParentProblem);
  assert.equal(parentResult.valid, false);
  assert.ok(parentResult.errors.some((err) => /mismatched problemId/i.test(err)));

  const forgedVerifiedDemo: Problem = {
    ...base,
    isIllustrativeDemo: true,
    evidenceCoverage: {
      ...base.evidenceCoverage,
      verifiedCount: 1,
    },
    evidence: [
      {
        id: 'ev-forged-verified',
        problemId: base.id,
        sourceType: 'dataset_demo',
        sourceName: 'Demo',
        excerpt: 'Demo',
        observedDate: null,
        externalUrl: null,
        verificationStatus: 'verified',
      },
    ],
  };

  const demoIntegrityResult = validateEvidenceReferences(forgedVerifiedDemo);
  assert.equal(demoIntegrityResult.valid, false);
  assert.ok(
    demoIntegrityResult.errors.some((err) =>
      /cannot mark evidence .* as verified/i.test(err)
    )
  );
  assert.ok(
    demoIntegrityResult.errors.some((err) => /verifiedCount === 0/i.test(err))
  );
});

test('sanitizeExternalUrl accepts valid HTTPS URLs and rejects unsafe schemes, relative paths, null, and malformed URLs', () => {
  assert.equal(
    sanitizeExternalUrl('https://example.com/research/report?id=42'),
    'https://example.com/research/report?id=42'
  );
  assert.equal(
    sanitizeExternalUrl('  https://docs.kopi.example/path  '),
    'https://docs.kopi.example/path'
  );

  // Unsafe schemes
  assert.equal(sanitizeExternalUrl('http://example.com/insecure'), null);
  assert.equal(sanitizeExternalUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeExternalUrl('JAVASCRIPT:alert(1)'), null);
  assert.equal(sanitizeExternalUrl('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(sanitizeExternalUrl('file:///etc/passwd'), null);
  assert.equal(sanitizeExternalUrl('vbscript:msgbox(1)'), null);

  // Relative paths, blanks, null/undefined, malformed
  assert.equal(sanitizeExternalUrl('/relative/path'), null);
  assert.equal(sanitizeExternalUrl('./local.html'), null);
  assert.equal(sanitizeExternalUrl('//protocol-relative.example.com'), null);
  assert.equal(sanitizeExternalUrl(''), null);
  assert.equal(sanitizeExternalUrl('   '), null);
  assert.equal(sanitizeExternalUrl(null), null);
  assert.equal(sanitizeExternalUrl(undefined), null);
  assert.equal(sanitizeExternalUrl('not a valid url'), null);
});
