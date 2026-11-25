import { useState } from 'react';
import { Menu, Sparkles } from 'lucide-react';
import type {
  QuickExploreCategory,
  SidebarNavItem,
} from '../config/opportunityRadar';
import {
  filterProblems,
  type Problem,
} from '../config/problemExplorer';
import { useDemoProblems } from '../hooks/useDemoProblems';
import {
  DatabaseErrorState,
  DatabaseLoadingSkeleton,
  DatabaseMissingCollectionState,
  DevOfflineFixtureBanner,
} from './DatabaseStateCard';
import { ExplorerEmptyState } from './ExplorerEmptyState';
import { ExplorerFilterChips } from './ExplorerFilterChips';
import { ExplorerProblemCard } from './ExplorerProblemCard';
import { ExplorerSearchBar } from './ExplorerSearchBar';
import { HowItWorksModal } from './HowItWorksModal';
import { KopiLogo } from './KopiLogo';
import { RadarSidebar } from './RadarSidebar';
import {
  RoutePlaceholderModal,
  type RoutePlaceholderState,
} from './RoutePlaceholderModal';

interface ProblemExplorerDirectoryProps {
  onNavigateHome: () => void;
  onNavigateRadar: () => void;
  onSelectProblem: (problemId: string) => void;
}

export function ProblemExplorerDirectory({
  onNavigateHome,
  onNavigateRadar,
  onSelectProblem,
}: ProblemExplorerDirectoryProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [draftQuery, setDraftQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [activeCategory, setActiveCategory] =
    useState<QuickExploreCategory>('All');
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [placeholderRoute, setPlaceholderRoute] =
    useState<RoutePlaceholderState | null>(null);

  const {
    status: loadStatus,
    problems,
    missingIds,
    errorCode,
    errorMessage,
    isDevOfflineFixture,
    retry,
  } = useDemoProblems();

  const visibleProblems = filterProblems(problems, {
    query: activeQuery,
    category: activeCategory,
  });

  const handleSearchChange = (value: string) => {
    setDraftQuery(value);
    if (value.trim() === '' && activeQuery !== '') {
      setActiveQuery('');
    }
  };

  const handleSearchSubmit = () => {
    setActiveQuery(draftQuery.trim());
  };

  const handleClearSearch = () => {
    setDraftQuery('');
    setActiveQuery('');
  };

  const handleClearFilters = () => {
    setDraftQuery('');
    setActiveQuery('');
    setActiveCategory('All');
  };

  const handleInvestigateProblem = (problem: Problem) => {
    onSelectProblem(problem.id);
  };

  const handleSelectNavItem = (item: SidebarNavItem) => {
    if (item.id === 'home') {
      onNavigateHome();
      return;
    }

    if (item.id === 'opportunity-radar') {
      onNavigateRadar();
      return;
    }

    if (item.id === 'problem-explorer') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (item.id === 'how-it-works') {
      setHowItWorksOpen(true);
      return;
    }

    setPlaceholderRoute({
      title: item.placeholderTitle ?? item.label,
      description:
        item.placeholderDescription ??
        'This section is scheduled for an upcoming screen.',
    });
  };

  return (
    <div
      data-testid="problem-explorer-directory"
      className="flex min-h-[100dvh] w-full bg-[#FFF2E5] text-[#402818]"
    >
      {/* Shared responsive left sidebar with Problem Explorer active */}
      <RadarSidebar
        activeNavId="problem-explorer"
        savedCount={0}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        onSelectNavItem={handleSelectNavItem}
        onSubmitProblem={() =>
          setPlaceholderRoute({
            title: 'Submit a Problem',
            description:
              'Community problem submissions will be enabled once backend storage and moderation workflows are connected.',
          })
        }
      />

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

        <main className="mx-auto w-full max-w-[1040px] flex-1 px-4 pt-6 pb-14 sm:px-6 md:px-8 lg:px-10 lg:pt-10">
          {/* Editorial Heading */}
          <section
            aria-labelledby="problem-explorer-heading"
            className="border-b border-[#402818]/10 pb-6"
          >
            <h1
              id="problem-explorer-heading"
              className="font-newsreader text-[clamp(1.85rem,4.5vw,2.5rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-[#402818]"
            >
              Problem Explorer
            </h1>

            <p className="font-newsreader mt-2 text-[clamp(1.125rem,2.4vw,1.375rem)] font-medium leading-[1.32] text-[#402818]">
              Look closer at the{' '}
              <span className="font-cormorant-italic text-[1.12em] text-[#C65A1B]">
                problems
              </span>{' '}
              worth solving.
            </p>

            <p className="font-dm-sans mt-2 max-w-[640px] text-[0.9375rem] leading-[1.55] text-[#705848]">
              Investigate real-world challenges, explore available evidence, and
              uncover what still needs to be understood.
            </p>

            <p
              data-testid="explorer-demo-notice"
              className="font-dm-sans mt-3 flex items-center gap-1.5 text-[0.8125rem] font-medium text-[#806957]"
            >
              <Sparkles
                size={14}
                strokeWidth={2}
                aria-hidden="true"
                className="shrink-0 text-[#C65A1B]"
              />
              <span>
                Illustrative examples — live evidence collection is not connected
                yet.
              </span>
            </p>
          </section>

          {/* Search & Category Filters */}
          <section
            aria-label="Search and filter problems"
            className="mt-6 space-y-4"
          >
            <ExplorerSearchBar
              query={draftQuery}
              onQueryChange={handleSearchChange}
              onSubmit={handleSearchSubmit}
              onClear={handleClearSearch}
            />

            <ExplorerFilterChips
              activeCategory={activeCategory}
              onSelectCategory={setActiveCategory}
            />
          </section>

          {/* Directory Listing */}
          <section aria-label="Problem listing" className="mt-7">
            {isDevOfflineFixture && <DevOfflineFixtureBanner />}

            {loadStatus === 'success' && missingIds.length > 0 && (
              <p
                data-testid="partial-missing-docs-notice"
                className="font-dm-sans mb-3 rounded-xl border border-[#402818]/12 bg-[#FFF9F3] px-3.5 py-2 text-[0.8125rem] text-[#705848]"
              >
                Some approved demonstration documents are not yet present in
                Firestore ({missingIds.join(', ')}).
              </p>
            )}

            <div className="mb-3 flex items-center justify-between text-[0.8125rem] text-[#705848]">
              <span data-testid="explorer-results-count" className="font-dm-sans">
                {loadStatus === 'loading'
                  ? 'Loading demonstration problems...'
                  : loadStatus === 'success'
                    ? `Showing ${visibleProblems.length} of ${problems.length} illustrative problem${problems.length === 1 ? '' : 's'}`
                    : '0 illustrative problems loaded'}
              </span>
            </div>

            {loadStatus === 'loading' ? (
              <DatabaseLoadingSkeleton variant="directory" />
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
            ) : visibleProblems.length > 0 ? (
              <div
                data-testid="explorer-problem-list"
                className="flex flex-col gap-4"
              >
                {visibleProblems.map((problem) => (
                  <ExplorerProblemCard
                    key={problem.id}
                    problem={problem}
                    onInvestigate={handleInvestigateProblem}
                  />
                ))}
              </div>
            ) : (
              <ExplorerEmptyState onClearFilters={handleClearFilters} />
            )}
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
        closeLabel="Back to Explorer"
      />
    </div>
  );
}
