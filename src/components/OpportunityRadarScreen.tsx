import { useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Bookmark,
  Menu,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  QUICK_EXPLORE_CATEGORIES,
  RADAR_ASSETS,
  RADAR_DASHBOARD_COPY,
  TRENDING_TOPICS,
  filterOpportunities,
  toggleBookmarkId,
  type OpportunityCardItem,
  type QuickExploreCategory,
  type SidebarNavItem,
  type TrendingTopic,
} from '../config/opportunityRadar';
import { useDemoProblems } from '../hooks/useDemoProblems';
import {
  DatabaseErrorState,
  DatabaseLoadingSkeleton,
  DatabaseMissingCollectionState,
  DevOfflineFixtureBanner,
} from './DatabaseStateCard';
import { HowItWorksModal } from './HowItWorksModal';
import { KopiLogo } from './KopiLogo';
import { OpportunityCardIllustration } from './OpportunityCardIllustration';
import { RadarSidebar } from './RadarSidebar';
import {
  RoutePlaceholderModal,
  type RoutePlaceholderState,
} from './RoutePlaceholderModal';

export interface RadarSessionState {
  draftQuery: string;
  activeQuery: string;
  activeCategory: QuickExploreCategory;
  activeTopic: TrendingTopic | null;
  bookmarkedIds: string[];
}

export const INITIAL_RADAR_SESSION_STATE: RadarSessionState = {
  draftQuery: '',
  activeQuery: '',
  activeCategory: 'All',
  activeTopic: null,
  bookmarkedIds: [],
};

interface OpportunityRadarScreenProps {
  onNavigateHome: () => void;
  onNavigateToExplorer?: () => void;
  onInvestigateOpportunity?: (problemId: string) => void;
  sessionState?: RadarSessionState;
  onSessionStateChange?: (nextState: RadarSessionState) => void;
}

export function OpportunityRadarScreen({
  onNavigateHome,
  onNavigateToExplorer,
  onInvestigateOpportunity,
  sessionState,
  onSessionStateChange,
}: OpportunityRadarScreenProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [localState, setLocalState] = useState<RadarSessionState>(
    INITIAL_RADAR_SESSION_STATE
  );
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [placeholderRoute, setPlaceholderRoute] =
    useState<RoutePlaceholderState | null>(null);

  const currentState = sessionState ?? localState;
  const { draftQuery, activeQuery, activeCategory, activeTopic, bookmarkedIds } =
    currentState;

  const {
    status: loadStatus,
    opportunities,
    missingIds,
    errorCode,
    errorMessage,
    isDevOfflineFixture,
    retry,
  } = useDemoProblems();

  const updateRadarState = (
    updater: (prev: RadarSessionState) => RadarSessionState
  ) => {
    if (onSessionStateChange) {
      onSessionStateChange(updater(currentState));
    } else {
      setLocalState(updater);
    }
  };

  const visibleOpportunities = filterOpportunities(opportunities, {
    query: activeQuery,
    category: activeCategory,
    topic: activeTopic,
  });

  const hasActiveFilters =
    activeQuery.trim().length > 0 ||
    activeCategory !== 'All' ||
    activeTopic !== null;

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateRadarState((prev) => ({
      ...prev,
      activeQuery: prev.draftQuery.trim(),
    }));
  };

  const handleSearchInputChange = (value: string) => {
    updateRadarState((prev) => ({
      ...prev,
      draftQuery: value,
      activeQuery: value.trim() === '' && prev.activeQuery !== '' ? '' : prev.activeQuery,
    }));
  };

  const handleClearSearchAndFilters = () => {
    updateRadarState((prev) => ({
      ...prev,
      draftQuery: '',
      activeQuery: '',
      activeCategory: 'All',
      activeTopic: null,
    }));
  };

  const handleToggleBookmark = (item: OpportunityCardItem) => {
    updateRadarState((prev) => ({
      ...prev,
      bookmarkedIds: toggleBookmarkId(prev.bookmarkedIds, item.id),
    }));
  };

  const handleToggleTopic = (topic: TrendingTopic) => {
    updateRadarState((prev) => ({
      ...prev,
      activeTopic: prev.activeTopic === topic ? null : topic,
    }));
  };

  const handleSelectNavItem = (item: SidebarNavItem) => {
    if (item.id === 'home') {
      onNavigateHome();
      return;
    }

    if (item.id === 'opportunity-radar') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (item.id === 'problem-explorer' && onNavigateToExplorer) {
      onNavigateToExplorer();
      return;
    }

    if (item.id === 'how-it-works') {
      setHowItWorksOpen(true);
      return;
    }

    if (item.id === 'saved') {
      const savedTitles = opportunities.filter((o) =>
        bookmarkedIds.includes(o.id)
      ).map((o) => o.title);

      const savedNote =
        savedTitles.length > 0
          ? ` Persistent saved collections are not yet connected. In this session you bookmarked (${savedTitles.length}): ${savedTitles.join('; ')}.`
          : '';

      setPlaceholderRoute({
        title: item.placeholderTitle ?? item.label,
        description: `${item.placeholderDescription ?? ''}${savedNote}`,
      });
      return;
    }

    setPlaceholderRoute({
      title: item.placeholderTitle ?? item.label,
      description:
        item.placeholderDescription ??
        'This section is scheduled for an upcoming screen.',
    });
  };

  const handleOpenPlaceholder = (title: string, description: string) => {
    setPlaceholderRoute({ title, description });
  };

  return (
    <div
      data-testid="opportunity-radar-screen"
      className="flex min-h-[100dvh] w-full bg-[#FFF2E5] text-[#402818]"
    >
      {/* Left Navigation Sidebar (Persistent Desktop + Drawer Mobile/Tablet) */}
      <RadarSidebar
        activeNavId="opportunity-radar"
        savedCount={bookmarkedIds.length}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        onSelectNavItem={handleSelectNavItem}
        onSubmitProblem={() =>
          handleOpenPlaceholder(
            'Submit a Problem',
            'Community problem submissions will be enabled once backend storage and moderation workflows are connected.'
          )
        }
      />

      {/* Main Dashboard Workspace Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact Mobile & Tablet Top Bar (< 1024px) */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#402818]/10 bg-[#FFF2E5]/95 px-4 py-3 backdrop-blur-xs sm:px-6 lg:hidden">
          <button
            type="button"
            onClick={onNavigateHome}
            aria-label="KOPI — Return to Welcome screen"
            className="inline-flex cursor-pointer items-center rounded-md py-1 transition-opacity duration-150 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#402818]"
          >
            <KopiLogo className="!h-[24px]" />
          </button>

          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileNavOpen}
            className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-[#402818]/14 bg-[#FAE8D7] text-[#402818] transition-colors duration-150 hover:bg-[#F3DFCA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
          >
            <Menu size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </header>

        <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 pt-5 pb-12 sm:px-6 md:px-8 lg:px-10 lg:pt-8">
          {/* Compact Dashboard Hero Band */}
          <section
            aria-labelledby="radar-dashboard-heading"
            data-testid="radar-dashboard-hero"
            className="relative overflow-hidden rounded-2xl border border-[#402818]/12 bg-gradient-to-br from-[#FAE8D7] via-[#F7E3CE] to-[#F1D5B9]"
          >
            {/* Right-side Compact Japanese Landscape + Grounded KOPI Cat */}
            <div
              aria-hidden="true"
              className="pointer-events-none relative h-[126px] w-full overflow-hidden border-b border-[#402818]/8 sm:h-[138px] md:absolute md:inset-y-0 md:right-0 md:h-auto md:w-[46%] md:border-b-0 md:[mask-image:linear-gradient(to_right,transparent_0%,black_28%,black_100%)] md:[-webkit-mask-image:linear-gradient(to_right,transparent_0%,black_28%,black_100%)]"
            >
              <img
                src={RADAR_ASSETS.compactLandscape}
                alt=""
                className="h-full w-full object-cover object-[72%_32%] opacity-90"
                decoding="async"
              />
              <img
                src={RADAR_ASSETS.foregroundTerrain}
                alt=""
                className="absolute inset-x-0 bottom-0 h-[56%] w-full object-cover object-bottom opacity-88"
                decoding="async"
              />
              <img
                data-testid="radar-dashboard-cat"
                src={RADAR_ASSETS.officialCat}
                alt="KOPI cat sitting with a laptop and steaming cup of coffee"
                width={880}
                height={807}
                className="absolute right-5 bottom-[4px] z-10 h-auto w-[98px] select-none sm:right-7 sm:w-[114px] md:right-7 md:bottom-[10px] md:w-[144px] lg:right-9 lg:w-[158px]"
                decoding="async"
              />
            </div>

            {/* Editorial Greeting & Headline */}
            <div className="relative z-10 px-5 py-5 sm:px-7 sm:py-6 md:max-w-[60%] md:py-7 lg:px-8 lg:py-8">
              <p
                data-testid="radar-greeting"
                className="font-dm-sans text-[0.9375rem] font-medium text-[#705848]"
              >
                {RADAR_DASHBOARD_COPY.greeting}
              </p>
              <h1
                id="radar-dashboard-heading"
                className="font-newsreader mt-1.5 text-[clamp(1.65rem,5.2vw,2.25rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-[#402818]"
              >
                <span className="block">{RADAR_DASHBOARD_COPY.headlineLine1}</span>
                <span className="block">
                  {RADAR_DASHBOARD_COPY.headlineLine2Prefix}
                  <span className="font-cormorant-italic text-[1.14em] leading-none text-[#C65A1B]">
                    {RADAR_DASHBOARD_COPY.headlineLine2Accent}
                  </span>
                  {RADAR_DASHBOARD_COPY.headlineLine2Suffix}
                </span>
              </h1>
            </div>
          </section>

          {/* Search Bar */}
          <section aria-label="Search opportunities" className="mt-5">
            <form
              onSubmit={handleSearchSubmit}
              role="search"
              className="flex flex-col gap-2.5 sm:flex-row sm:items-center"
            >
              <div className="relative flex flex-1 items-center">
                <Search
                  size={17}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 text-[#705848] sm:left-4"
                />
                <input
                  id="radar-search-input"
                  type="search"
                  value={draftQuery}
                  onChange={(e) => handleSearchInputChange(e.target.value)}
                  placeholder={RADAR_DASHBOARD_COPY.searchPlaceholder}
                  aria-label="Search for a problem, trend or opportunity"
                  className="font-dm-sans h-12 w-full rounded-full border border-[#402818]/15 bg-[#FFF9F3] pr-9 pl-10 text-[0.84375rem] text-[#402818] placeholder:text-[#705848]/75 focus:border-[#402818]/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C65A1B]/30 sm:pr-10 sm:pl-11 sm:text-[0.9375rem]"
                />
                {draftQuery.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      updateRadarState((prev) => ({
                        ...prev,
                        draftQuery: '',
                        activeQuery: '',
                      }))
                    }
                    aria-label="Clear search text"
                    className="absolute right-3 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-[#705848] transition-colors duration-150 hover:bg-[#402818]/8 hover:text-[#402818]"
                  >
                    <X size={15} strokeWidth={2} aria-hidden="true" />
                  </button>
                )}
              </div>

              <button
                type="submit"
                className="font-dm-sans inline-flex h-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#402818] px-7 text-[0.9375rem] font-semibold text-white transition-colors duration-150 hover:bg-[#2F1B13] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
              >
                {RADAR_DASHBOARD_COPY.searchButton}
              </button>
            </form>
          </section>

          {/* Quick Explore */}
          <section aria-labelledby="quick-explore-heading" className="mt-7">
            <h2
              id="quick-explore-heading"
              className="font-newsreader text-[1.1875rem] font-semibold text-[#402818]"
            >
              {RADAR_DASHBOARD_COPY.quickExploreTitle}
            </h2>

            <div
              role="group"
              aria-label="Filter opportunities by category"
              className="no-scrollbar mt-3 flex items-center gap-2 overflow-x-auto pb-1 md:flex-wrap"
            >
              {QUICK_EXPLORE_CATEGORIES.map((category) => {
                const isSelected = activeCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() =>
                      updateRadarState((prev) => ({
                        ...prev,
                        activeCategory: category,
                      }))
                    }
                    className={`font-dm-sans shrink-0 cursor-pointer rounded-full border px-4 py-2 text-[0.84375rem] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818] ${
                      isSelected
                        ? 'border-[#402818] bg-[#402818] text-white'
                        : 'border-[#402818]/14 bg-[#FAE8D7]/80 text-[#402818] hover:bg-[#F3DFCA]'
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Today's Opportunities */}
          <section aria-labelledby="todays-opportunities-heading" className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2
                  id="todays-opportunities-heading"
                  className="font-newsreader text-[1.4375rem] font-semibold leading-tight text-[#402818]"
                >
                  {RADAR_DASHBOARD_COPY.opportunitiesTitle}
                </h2>
                <p className="font-dm-sans mt-1 text-[0.9rem] text-[#705848]">
                  {RADAR_DASHBOARD_COPY.opportunitiesSubtitle}
                </p>
                <p
                  data-testid="illustrative-disclaimer"
                  className="font-dm-sans mt-1 flex items-center gap-1.5 text-[0.78rem] font-medium text-[#806957]"
                >
                  <Sparkles size={13} strokeWidth={2} aria-hidden="true" className="text-[#C65A1B]" />
                  <span>{RADAR_DASHBOARD_COPY.opportunitiesNotice}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  handleOpenPlaceholder(
                    'All Opportunities',
                    'The full Problem Explorer directory will display verified opportunities once backend research pipelines are connected. Currently showing illustrative demonstration examples.'
                  )
                }
                className="font-dm-sans group inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-[0.875rem] font-semibold text-[#C65A1B] transition-colors duration-150 hover:text-[#9E4310] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
              >
                <span>{RADAR_DASHBOARD_COPY.viewAllLabel}</span>
                <ArrowRight
                  size={15}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  className="transition-transform duration-150 group-hover:translate-x-0.5"
                />
              </button>
            </div>

            {isDevOfflineFixture && <DevOfflineFixtureBanner />}

            {activeTopic && (
              <div className="mt-3 flex items-center gap-2 text-[0.8125rem] text-[#705848]">
                <span>
                  Filtering by topic{' '}
                  <strong className="font-semibold text-[#402818]">
                    {activeTopic}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateRadarState((prev) => ({ ...prev, activeTopic: null }))
                  }
                  className="cursor-pointer font-medium text-[#C65A1B] underline-offset-2 hover:underline"
                >
                  Clear topic
                </button>
              </div>
            )}

            {loadStatus === 'success' && missingIds.length > 0 && (
              <p
                data-testid="partial-missing-docs-notice"
                className="font-dm-sans mt-3 rounded-xl border border-[#402818]/12 bg-[#FFF9F3] px-3.5 py-2 text-[0.8125rem] text-[#705848]"
              >
                Some approved demonstration documents are not yet present in
                Firestore ({missingIds.join(', ')}).
              </p>
            )}

            {loadStatus === 'loading' ? (
              <DatabaseLoadingSkeleton variant="radar" />
            ) : loadStatus === 'error' ? (
              <DatabaseErrorState
                errorCode={errorCode}
                errorMessage={errorMessage}
                onRetry={retry}
              />
            ) : loadStatus === 'empty' ? (
              <DatabaseMissingCollectionState
                missingIds={missingIds}
                onRetry={retry}
              />
            ) : visibleOpportunities.length > 0 ? (
              <div
                data-testid="opportunities-grid"
                className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
              >
                {visibleOpportunities.map((item) => {
                  const isBookmarked = bookmarkedIds.includes(item.id);
                  return (
                    <article
                      key={item.id}
                      data-testid={`opportunity-card-${item.id}`}
                      className="flex flex-col justify-between rounded-2xl border border-[#402818]/12 bg-[#FAE8D7]/70 p-4 transition-colors duration-150 hover:border-[#402818]/24 hover:bg-[#FAE8D7]"
                    >
                      <div>
                        {/* Card Top Row: Category + Bookmark */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-dm-sans text-[0.75rem] font-semibold tracking-[0.06em] uppercase text-[#705848]">
                            {item.categoryLabel}
                          </span>

                          <button
                            type="button"
                            aria-pressed={isBookmarked}
                            aria-label={
                              isBookmarked
                                ? `Remove bookmark for ${item.title}`
                                : `Bookmark ${item.title}`
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              handleToggleBookmark(item);
                            }}
                            className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818] ${
                              isBookmarked
                                ? 'border-[#C65A1B]/40 bg-[#C65A1B]/12 text-[#C65A1B]'
                                : 'border-[#402818]/12 bg-[#FFF2E5] text-[#705848] hover:text-[#402818]'
                            }`}
                          >
                            <Bookmark
                              size={16}
                              strokeWidth={2}
                              fill={isBookmarked ? 'currentColor' : 'none'}
                              aria-hidden="true"
                            />
                          </button>
                        </div>

                        {/* Compact Custom Editorial Illustration */}
                        <div className="mt-3 h-[112px] w-full overflow-hidden rounded-xl border border-[#402818]/10">
                          <OpportunityCardIllustration variant={item.illustration} />
                        </div>

                        {/* Problem Title & Short Description */}
                        <h3 className="font-newsreader mt-3.5 text-[1.1875rem] font-semibold leading-[1.25] text-[#402818]">
                          {item.title}
                        </h3>
                        <p className="font-dm-sans mt-2 text-[0.875rem] leading-[1.52] text-[#705848]">
                          {item.description}
                        </p>
                      </div>

                      {/* Honest Unverified Evidence Metadata + Inspect Action */}
                      <div className="mt-4 border-t border-[#402818]/10 pt-3">
                        <dl className="grid grid-cols-2 gap-2 text-[0.75rem]">
                          <div>
                            <dt className="font-dm-sans text-[#806957]">
                              Evidence signals
                            </dt>
                            <dd className="font-dm-sans mt-0.5 font-medium text-[#402818]/80">
                              {item.evidenceVolume}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-dm-sans text-[#806957]">
                              Opportunity score
                            </dt>
                            <dd className="font-dm-sans mt-0.5 font-medium text-[#402818]/80">
                              {item.opportunityScore}
                            </dd>
                          </div>
                        </dl>

                        <button
                          type="button"
                          aria-label={`Investigate Problem: ${item.title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (onInvestigateOpportunity) {
                              onInvestigateOpportunity(item.id);
                            } else {
                              handleOpenPlaceholder(
                                item.title,
                                'Detailed source citations, recurring complaint threads, and market sizing for this illustrative example will open in Problem Explorer once the research database is connected.'
                              );
                            }
                          }}
                          className="font-dm-sans mt-3 inline-flex cursor-pointer items-center gap-1.5 text-[0.8125rem] font-semibold text-[#402818] underline-offset-3 hover:text-[#C65A1B] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
                        >
                          <span>Investigate Problem</span>
                          <ArrowRight size={13} strokeWidth={2.2} aria-hidden="true" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div
                data-testid="opportunities-empty-state"
                className="mt-4 rounded-2xl border border-[#402818]/12 bg-[#FAE8D7]/60 px-6 py-8 text-center"
              >
                <p className="font-newsreader text-[1.25rem] font-semibold text-[#402818]">
                  No illustrative examples match this view
                </p>
                <p className="font-dm-sans mx-auto mt-1.5 max-w-md text-[0.875rem] leading-relaxed text-[#705848]">
                  {activeQuery
                    ? `No demonstration opportunities matched "${activeQuery}"`
                    : `No demonstration opportunities are currently tagged under "${activeTopic ?? activeCategory}".`}{' '}
                  Reset filters to return to the 3 current illustrative examples.
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleClearSearchAndFilters}
                    className="font-dm-sans mt-4 inline-flex cursor-pointer items-center justify-center rounded-full bg-[#402818] px-5 py-2.5 text-[0.84375rem] font-semibold text-white transition-colors duration-150 hover:bg-[#2F1B13] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
                  >
                    Clear search &amp; filters
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Trending Topics */}
          <section aria-labelledby="trending-topics-heading" className="mt-9">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2
                  id="trending-topics-heading"
                  className="font-newsreader text-[1.25rem] font-semibold text-[#402818]"
                >
                  {RADAR_DASHBOARD_COPY.trendingTitle}
                </h2>
                <p className="font-dm-sans mt-0.5 text-[0.78rem] text-[#806957]">
                  {RADAR_DASHBOARD_COPY.trendingNotice}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  handleOpenPlaceholder(
                    'Trending Topics',
                    'Live trend velocity and historical complaint volume across categories are not yet connected. Current topic tags are illustrative only.'
                  )
                }
                className="font-dm-sans group inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-[0.875rem] font-semibold text-[#C65A1B] transition-colors duration-150 hover:text-[#9E4310] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
              >
                <span>{RADAR_DASHBOARD_COPY.viewTrendsLabel}</span>
                <ArrowRight
                  size={15}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  className="transition-transform duration-150 group-hover:translate-x-0.5"
                />
              </button>
            </div>

            <div
              role="group"
              aria-label="Illustrative trending topics"
              className="no-scrollbar mt-3 flex items-center gap-2.5 overflow-x-auto pb-1 md:flex-wrap"
            >
              {TRENDING_TOPICS.map((topic) => {
                const isSelected = activeTopic === topic;
                return (
                  <button
                    key={topic}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleToggleTopic(topic)}
                    className={`font-dm-sans shrink-0 cursor-pointer rounded-full border px-4 py-2 text-[0.84375rem] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818] ${
                      isSelected
                        ? 'border-[#C65A1B] bg-[#C65A1B] text-white'
                        : 'border-[#402818]/14 bg-[#FFF9F3] text-[#402818] hover:border-[#402818]/30 hover:bg-[#FAE8D7]'
                    }`}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>
          </section>
        </main>
      </div>

      <HowItWorksModal
        open={howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
      />

      <RoutePlaceholderModal
        activeRoute={placeholderRoute}
        onClose={() => setPlaceholderRoute(null)}
        closeLabel="Back to Radar"
      />
    </div>
  );
}
