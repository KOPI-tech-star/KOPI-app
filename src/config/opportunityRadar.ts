export const RADAR_ASSETS = {
  officialLogo: '/assets/kopi-logo.png',
  compactLandscape: '/assets/aistudio/image_de2a5ea1.png',
  foregroundTerrain: '/assets/aistudio/image_e87b8b81.png',
  officialCat: '/assets/kopi-cat-radar.png',
} as const;

export const RADAR_DASHBOARD_COPY = {
  greeting: 'Good evening!',
  headlineLine1: 'What opportunity are',
  headlineLine2Prefix: 'you ',
  headlineLine2Accent: 'curious',
  headlineLine2Suffix: ' about today?',
  searchPlaceholder: 'Search for a problem, trend or opportunity...',
  searchButton: 'Search',
  quickExploreTitle: 'Quick Explore',
  opportunitiesTitle: "Today's Opportunities",
  opportunitiesSubtitle: 'Real problems. Evidence-based opportunities.',
  opportunitiesNotice: 'Illustrative demonstration examples · Live evidence metrics not yet connected',
  viewAllLabel: 'View All',
  trendingTitle: 'Trending Topics',
  trendingNotice: 'Illustrative topic tags · Live trend volume not available',
  viewTrendsLabel: 'View Trends',
  promoTitle: 'Bring real problems to life.',
  promoBody: 'Submit a problem you keep seeing around you.',
  promoCta: 'Submit a Problem',
} as const;

export type QuickExploreCategory =
  | 'All'
  | 'Daily Life'
  | 'Education'
  | 'Health'
  | 'Sustainability'
  | 'AI & Tech'
  | 'More';

export const QUICK_EXPLORE_CATEGORIES: readonly QuickExploreCategory[] = [
  'All',
  'Daily Life',
  'Education',
  'Health',
  'Sustainability',
  'AI & Tech',
  'More',
] as const;

export type TrendingTopic =
  | '#studentproductivity'
  | '#monsoonessentials'
  | '#sustainableliving'
  | '#creatortools'
  | '#mentalwellness';

export const TRENDING_TOPICS: readonly TrendingTopic[] = [
  '#studentproductivity',
  '#monsoonessentials',
  '#sustainableliving',
  '#creatortools',
  '#mentalwellness',
] as const;

export type SidebarNavId =
  | 'home'
  | 'opportunity-radar'
  | 'problem-explorer'
  | 'compare'
  | 'saved'
  | 'methodology'
  | 'how-it-works';

export interface SidebarNavItem {
  id: SidebarNavId;
  label: string;
  section: 'primary' | 'secondary';
  placeholderTitle?: string;
  placeholderDescription?: string;
}

export const SIDEBAR_NAV_ITEMS: readonly SidebarNavItem[] = [
  {
    id: 'home',
    label: 'Home',
    section: 'primary',
  },
  {
    id: 'opportunity-radar',
    label: 'Opportunity Radar',
    section: 'primary',
  },
  {
    id: 'problem-explorer',
    label: 'Problem Explorer',
    section: 'primary',
    placeholderTitle: 'Problem Explorer',
    placeholderDescription:
      'Problem Explorer will provide deep-dive complaint clusters and source evidence once the research database is connected. No unverified findings are shown here.',
  },
  {
    id: 'compare',
    label: 'Compare',
    section: 'primary',
    placeholderTitle: 'Compare Opportunities',
    placeholderDescription:
      'Side-by-side opportunity comparison is scheduled for an upcoming screen once real evidence signals and scoring rubrics are available.',
  },
  {
    id: 'saved',
    label: 'Saved',
    section: 'primary',
  },
  {
    id: 'methodology',
    label: 'Methodology',
    section: 'secondary',
    placeholderTitle: 'Research Methodology',
    placeholderDescription:
      'KOPI’s full methodology documentation—detailing source sampling, deduplication, and evidence thresholds—is planned for a dedicated upcoming route.',
  },
  {
    id: 'how-it-works',
    label: 'How Kopi Works',
    section: 'secondary',
  },
] as const;

export type OpportunityIllustrationKey = 'monsoon' | 'nutrition' | 'packaging';

export interface OpportunityCardItem {
  id: string;
  categoryLabel: string;
  categories: readonly QuickExploreCategory[];
  title: string;
  description: string;
  illustration: OpportunityIllustrationKey;
  evidenceVolume: 'Not available';
  opportunityScore: 'Not available';
  isIllustrative: true;
  tags: readonly TrendingTopic[];
}

export const DEMO_OPPORTUNITIES: readonly OpportunityCardItem[] = [
  {
    id: 'wet-entrance-monsoons',
    categoryLabel: 'Daily Life',
    categories: ['Daily Life'],
    title: 'The wet entrance problem during monsoons',
    description:
      'Apartment lobbies, clinics, and neighborhood shops face slippery floors, dripping umbrellas, and muddy footprints during heavy rainy commutes.',
    illustration: 'monsoon',
    evidenceVolume: 'Not available',
    opportunityScore: 'Not available',
    isIllustrative: true,
    tags: ['#monsoonessentials'],
  },
  {
    id: 'student-nutrition-consistency',
    categoryLabel: 'Health · Education',
    categories: ['Health', 'Education'],
    title: 'Inconsistent nutrition for busy students',
    description:
      'University and exam-prep students skip balanced meals during packed study blocks due to erratic hours, delivery costs, and limited kitchen access.',
    illustration: 'nutrition',
    evidenceVolume: 'Not available',
    opportunityScore: 'Not available',
    isIllustrative: true,
    tags: ['#studentproductivity', '#mentalwellness'],
  },
  {
    id: 'excessive-small-delivery-packaging',
    categoryLabel: 'Sustainability',
    categories: ['Sustainability'],
    title: 'Excessive packaging in small deliveries',
    description:
      'Single-item pharmacy, grocery, and snack orders routinely arrive in oversized boxes with layered plastic wraps and void fill.',
    illustration: 'packaging',
    evidenceVolume: 'Not available',
    opportunityScore: 'Not available',
    isIllustrative: true,
    tags: ['#sustainableliving'],
  },
] as const;

export interface OpportunityFilterInput {
  query: string;
  category: QuickExploreCategory;
  topic?: TrendingTopic | null;
}

export function filterOpportunities(
  items: readonly OpportunityCardItem[],
  { query, category, topic = null }: OpportunityFilterInput
): OpportunityCardItem[] {
  const normalizedQuery = query.trim().toLowerCase();

  return items.filter((item) => {
    const matchesCategory =
      category === 'All' || item.categories.includes(category);
    if (!matchesCategory) return false;

    const matchesTopic = !topic || item.tags.includes(topic);
    if (!matchesTopic) return false;

    if (!normalizedQuery) return true;

    const searchableText = [
      item.title,
      item.description,
      item.categoryLabel,
      ...item.categories,
      ...item.tags,
    ]
      .join(' ')
      .toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
}

export function toggleBookmarkId(
  currentIds: readonly string[],
  targetId: string
): string[] {
  if (currentIds.includes(targetId)) {
    return currentIds.filter((id) => id !== targetId);
  }
  return [...currentIds, targetId];
}
