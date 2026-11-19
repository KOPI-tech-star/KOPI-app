import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_OPPORTUNITIES,
  QUICK_EXPLORE_CATEGORIES,
  RADAR_ASSETS,
  RADAR_DASHBOARD_COPY,
  SIDEBAR_NAV_ITEMS,
  TRENDING_TOPICS,
  filterOpportunities,
  toggleBookmarkId,
} from './opportunityRadar';

test('Opportunity Radar dashboard copy, categories, and trending topics match specification', () => {
  assert.equal(RADAR_DASHBOARD_COPY.greeting, 'Good evening!');
  assert.equal(RADAR_DASHBOARD_COPY.headlineLine1, 'What opportunity are');
  assert.equal(RADAR_DASHBOARD_COPY.headlineLine2Accent, 'curious');
  assert.equal(
    RADAR_DASHBOARD_COPY.searchPlaceholder,
    'Search for a problem, trend or opportunity...'
  );
  assert.equal(RADAR_DASHBOARD_COPY.opportunitiesTitle, "Today's Opportunities");
  assert.equal(
    RADAR_DASHBOARD_COPY.opportunitiesSubtitle,
    'Real problems. Evidence-based opportunities.'
  );
  assert.equal(RADAR_DASHBOARD_COPY.promoTitle, 'Bring real problems to life.');
  assert.equal(
    RADAR_DASHBOARD_COPY.promoBody,
    'Submit a problem you keep seeing around you.'
  );
  assert.equal(RADAR_DASHBOARD_COPY.promoCta, 'Submit a Problem');

  assert.deepEqual(QUICK_EXPLORE_CATEGORIES, [
    'All',
    'Daily Life',
    'Education',
    'Health',
    'Sustainability',
    'AI & Tech',
    'More',
  ]);

  assert.deepEqual(TRENDING_TOPICS, [
    '#studentproductivity',
    '#monsoonessentials',
    '#sustainableliving',
    '#creatortools',
    '#mentalwellness',
  ]);

  assert.equal(RADAR_ASSETS.officialLogo, '/assets/kopi-logo.png');
  assert.equal(RADAR_ASSETS.officialCat, '/assets/kopi-cat-radar.png');
  assert.equal(SIDEBAR_NAV_ITEMS.length, 7);
});

test('Demonstration opportunities are explicitly marked illustrative with no fabricated metrics', () => {
  assert.equal(DEMO_OPPORTUNITIES.length, 3);
  for (const item of DEMO_OPPORTUNITIES) {
    assert.equal(item.isIllustrative, true);
    assert.equal(item.evidenceVolume, 'Not available');
    assert.equal(item.opportunityScore, 'Not available');
  }
});

test('filterOpportunities filters accurately by search query, category, and topic', () => {
  // Default All returns all 3
  assert.equal(
    filterOpportunities(DEMO_OPPORTUNITIES, { query: '', category: 'All' }).length,
    3
  );

  // Search query matching title/description/tags
  const monsoonResults = filterOpportunities(DEMO_OPPORTUNITIES, {
    query: 'monsoon',
    category: 'All',
  });
  assert.equal(monsoonResults.length, 1);
  assert.equal(monsoonResults[0]?.id, 'wet-entrance-monsoons');

  // Case-insensitive search
  const nutritionResults = filterOpportunities(DEMO_OPPORTUNITIES, {
    query: '  STUDENTS ',
    category: 'All',
  });
  assert.equal(nutritionResults.length, 1);
  assert.equal(nutritionResults[0]?.id, 'student-nutrition-consistency');

  // Category filter
  assert.equal(
    filterOpportunities(DEMO_OPPORTUNITIES, { query: '', category: 'Sustainability' })
      .length,
    1
  );
  assert.equal(
    filterOpportunities(DEMO_OPPORTUNITIES, { query: '', category: 'Education' }).length,
    1
  );
  assert.equal(
    filterOpportunities(DEMO_OPPORTUNITIES, { query: '', category: 'Health' }).length,
    1
  );

  // Empty search / unmatched category returns empty list cleanly
  assert.equal(
    filterOpportunities(DEMO_OPPORTUNITIES, {
      query: 'cryptocurrency arbitrage',
      category: 'All',
    }).length,
    0
  );
  assert.equal(
    filterOpportunities(DEMO_OPPORTUNITIES, { query: '', category: 'AI & Tech' }).length,
    0
  );

  // Combined category + search mismatch returns empty
  assert.equal(
    filterOpportunities(DEMO_OPPORTUNITIES, {
      query: 'monsoon',
      category: 'Sustainability',
    }).length,
    0
  );

  // Trending topic filter
  const sustainableTag = filterOpportunities(DEMO_OPPORTUNITIES, {
    query: '',
    category: 'All',
    topic: '#sustainableliving',
  });
  assert.equal(sustainableTag.length, 1);
  assert.equal(sustainableTag[0]?.id, 'excessive-small-delivery-packaging');
});

test('toggleBookmarkId adds and removes IDs deterministically without duplicates', () => {
  const step1 = toggleBookmarkId([], 'wet-entrance-monsoons');
  assert.deepEqual(step1, ['wet-entrance-monsoons']);

  const step2 = toggleBookmarkId(step1, 'student-nutrition-consistency');
  assert.deepEqual(step2, ['wet-entrance-monsoons', 'student-nutrition-consistency']);

  const step3 = toggleBookmarkId(step2, 'wet-entrance-monsoons');
  assert.deepEqual(step3, ['student-nutrition-consistency']);
});
