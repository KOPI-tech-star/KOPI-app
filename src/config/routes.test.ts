import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_OPPORTUNITIES, toggleBookmarkId } from './opportunityRadar';
import {
  createEmptyEvaluation,
  getEvaluationReadiness,
} from './opportunityEvaluation';
import { getProblemById } from './problemExplorer';
import {
  buildOpportunityEvaluationRoute,
  buildProblemDetailRoute,
  normalizeRoute,
  parseOpportunityEvaluationId,
  parseProblemDetailId,
} from './routes';

test('normalizeRoute resolves Welcome, Opportunity Radar, Problem Explorer directory, and detail routes accurately', () => {
  assert.equal(normalizeRoute('/'), '/');
  assert.equal(normalizeRoute(''), '/');
  assert.equal(normalizeRoute('/unknown'), '/');

  assert.equal(normalizeRoute('/opportunity-radar'), '/opportunity-radar');
  assert.equal(normalizeRoute('/opportunity-radar/'), '/opportunity-radar');
  assert.equal(normalizeRoute('/explore'), '/opportunity-radar');
  assert.equal(normalizeRoute('/radar'), '/opportunity-radar');

  assert.equal(normalizeRoute('/problem-explorer'), '/problem-explorer');
  assert.equal(normalizeRoute('/problem-explorer/'), '/problem-explorer');

  assert.equal(
    normalizeRoute('/problem-explorer/wet-entrance-monsoons'),
    '/problem-explorer/wet-entrance-monsoons'
  );
  assert.equal(
    normalizeRoute('/problem-explorer/wet-entrance-monsoons/'),
    '/problem-explorer/wet-entrance-monsoons'
  );
  assert.equal(
    normalizeRoute('/problem-explorer/nonexistent-id'),
    '/problem-explorer/nonexistent-id'
  );

  assert.equal(
    normalizeRoute('/opportunity-evaluation'),
    '/opportunity-evaluation'
  );
  assert.equal(
    normalizeRoute('/opportunity-evaluation/'),
    '/opportunity-evaluation'
  );
  assert.equal(
    normalizeRoute('/opportunity-evaluation/wet-entrance-monsoons'),
    '/opportunity-evaluation/wet-entrance-monsoons'
  );
  assert.equal(
    normalizeRoute('/opportunity-evaluation/wet-entrance-monsoons/'),
    '/opportunity-evaluation/wet-entrance-monsoons'
  );

  assert.equal(normalizeRoute('/saved'), '/saved');
  assert.equal(normalizeRoute('/saved/'), '/saved');
  assert.equal(normalizeRoute('/saved-opportunities'), '/saved');
});

test('parseProblemDetailId decodes valid IDs and safely handles malformed or nested paths without throwing', () => {
  assert.equal(parseProblemDetailId('/problem-explorer'), null);
  assert.equal(parseProblemDetailId('/opportunity-radar'), null);

  assert.equal(
    parseProblemDetailId('/problem-explorer/wet-entrance-monsoons'),
    'wet-entrance-monsoons'
  );
  assert.equal(
    parseProblemDetailId(buildProblemDetailRoute('student-nutrition-consistency')),
    'student-nutrition-consistency'
  );
  assert.equal(
    parseProblemDetailId('/problem-explorer/foo%20bar'),
    'foo bar'
  );

  // Malformed percent encoding and nested segments must never throw
  assert.equal(parseProblemDetailId('/problem-explorer/%E0%A4%A'), '');
  assert.equal(parseProblemDetailId('/problem-explorer/a/b/c'), '');

  // Lookup integration check
  const parsed = parseProblemDetailId('/problem-explorer/excessive-small-delivery-packaging');
  assert.ok(parsed);
  assert.equal(getProblemById(parsed)?.id, 'excessive-small-delivery-packaging');
  assert.equal(getProblemById(parseProblemDetailId('/problem-explorer/%E0%A4%A') ?? ''), null);
});

test('Radar opportunity IDs map deterministically to their corresponding Problem Investigation routes and records', () => {
  const expectedRoutes: Record<string, string> = {
    'wet-entrance-monsoons': '/problem-explorer/wet-entrance-monsoons',
    'student-nutrition-consistency': '/problem-explorer/student-nutrition-consistency',
    'excessive-small-delivery-packaging': '/problem-explorer/excessive-small-delivery-packaging',
  };

  assert.equal(DEMO_OPPORTUNITIES.length, 3);

  for (const item of DEMO_OPPORTUNITIES) {
    const route = buildProblemDetailRoute(item.id);
    assert.equal(route, expectedRoutes[item.id]);

    const normalized = normalizeRoute(route);
    assert.equal(normalized, route);

    const parsedId = parseProblemDetailId(normalized);
    assert.equal(parsedId, item.id);

    const resolvedProblem = getProblemById(parsedId ?? '');
    assert.ok(resolvedProblem, `Missing problem record for Radar item ${item.id}`);
    assert.equal(resolvedProblem.id, item.id);
    assert.equal(resolvedProblem.title, item.title);
    assert.equal(resolvedProblem.isIllustrativeDemo, true);
    assert.equal(resolvedProblem.evidence.length, 0);
  }

  // Missing Radar ID resolves safely to null so NotFound renders instead of fallback content
  const missingRoute = buildProblemDetailRoute('missing-radar-opportunity');
  assert.equal(getProblemById(parseProblemDetailId(missingRoute) ?? ''), null);

  // Bookmark toggling remains independent of investigation route generation
  const bookmarksAfterToggle = toggleBookmarkId([], 'wet-entrance-monsoons');
  assert.deepEqual(bookmarksAfterToggle, ['wet-entrance-monsoons']);
  assert.equal(
    buildProblemDetailRoute('student-nutrition-consistency'),
    '/problem-explorer/student-nutrition-consistency'
  );
});

test('Opportunity Evaluation routes resolve valid IDs safely and handle empty, nested, trailing-slash, and malformed IDs', () => {
  assert.equal(parseOpportunityEvaluationId('/problem-explorer/wet-entrance-monsoons'), null);
  assert.equal(parseOpportunityEvaluationId('/opportunity-evaluation'), '');
  assert.equal(parseOpportunityEvaluationId('/opportunity-evaluation/'), '');
  assert.equal(parseOpportunityEvaluationId('/opportunity-evaluation/a/b'), '');
  assert.equal(parseOpportunityEvaluationId('/opportunity-evaluation/%E0%A4%A'), '');

  for (const item of DEMO_OPPORTUNITIES) {
    const evalRoute = buildOpportunityEvaluationRoute(item.id);
    assert.equal(evalRoute, `/opportunity-evaluation/${item.id}`);
    assert.equal(normalizeRoute(evalRoute), evalRoute);
    assert.equal(parseOpportunityEvaluationId(evalRoute), item.id);
    assert.equal(parseOpportunityEvaluationId(`${evalRoute}/`), item.id);

    const problem = getProblemById(item.id);
    assert.ok(problem);
    const readiness = getEvaluationReadiness(problem);
    const emptyEval = createEmptyEvaluation(problem);

    assert.equal(readiness.status, 'insufficient_evidence');
    assert.equal(readiness.scoreEligible, false);
    assert.equal(emptyEval.overallScore, null);
    assert.equal(emptyEval.dimensions.length, 6);
  }

  assert.equal(getProblemById(parseOpportunityEvaluationId('/opportunity-evaluation/invalid-id') ?? ''), null);
});
