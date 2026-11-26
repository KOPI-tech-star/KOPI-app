import { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bookmark,
  LogIn,
  Menu,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { SidebarNavItem } from '../config/opportunityRadar';
import { useAuthAndSaved } from '../contexts/AuthAndSavedContext';
import { useDemoProblems } from '../hooks/useDemoProblems';
import { AccountControls } from './AccountControls';
import {
  DatabaseErrorState,
  DatabaseLoadingSkeleton,
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

interface SavedOpportunitiesScreenProps {
  onNavigateHome: () => void;
  onNavigateRadar: () => void;
  onNavigateToExplorer: () => void;
  onInvestigateProblem: (problemId: string) => void;
  onEvaluateProblem: (problemId: string) => void;
}

function formatSavedDate(isoString: string): string {
  const ms = Date.parse(isoString);
  if (!Number.isFinite(ms)) return 'Saved';
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function SavedOpportunitiesScreen({
  onNavigateHome,
  onNavigateRadar,
  onNavigateToExplorer,
  onInvestigateProblem,
  onEvaluateProblem,
}: SavedOpportunitiesScreenProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [placeholderRoute, setPlaceholderRoute] =
    useState<RoutePlaceholderState | null>(null);

  const {
    authStatus,
    profileStatus,
    profileError,
    savedStatus,
    savedItems,
    savedCount,
    savedError,
    savingProblemIds,
    guestBookmarks,
    pendingMigrations,
    migrationStatus,
    migrationMessage,
    openSignInModal,
    removeSaved,
    removeGuestDraft,
    retrySync,
    retryGuestMigration,
  } = useAuthAndSaved();

  const {
    status: problemsLoadStatus,
    problems,
    illustrationByProblemId,
    errorCode: problemsErrorCode,
    errorMessage: problemsErrorMessage,
    isDevOfflineFixture,
    retry: retryProblems,
  } = useDemoProblems();

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
      onNavigateToExplorer();
      return;
    }
    if (item.id === 'saved') {
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

  const problemsById = new Map(problems.map((p) => [p.id, p]));

  return (
    <div
      data-testid="saved-opportunities-screen"
      className="flex min-h-[100dvh] w-full bg-[#FFF2E5] text-[#402818]"
    >
      <RadarSidebar
        activeNavId="saved"
        savedCount={savedCount}
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
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[#402818]/10 bg-[#FFF2E5]/95 px-4 py-2.5 backdrop-blur-xs sm:px-6 lg:hidden">
          <button
            type="button"
            onClick={onNavigateHome}
            aria-label="KOPI — Return to Welcome screen"
            className="inline-flex cursor-pointer items-center rounded-md py-1 transition-opacity duration-150 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#402818]"
          >
            <KopiLogo className="!h-[24px]" />
          </button>

          <div className="flex items-center gap-2">
            <AccountControls variant="compact" />
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileNavOpen}
              className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-[#402818]/14 bg-[#FAE8D7] text-[#402818] transition-colors duration-150 hover:bg-[#F3DFCA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
            >
              <Menu size={20} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1040px] flex-1 px-4 pt-6 pb-14 sm:px-6 md:px-8 lg:px-10 lg:pt-10">
          <section
            aria-labelledby="saved-opportunities-heading"
            className="border-b border-[#402818]/10 pb-6"
          >
            <h1
              id="saved-opportunities-heading"
              className="font-newsreader text-[clamp(1.85rem,4.5vw,2.5rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-[#402818]"
            >
              Saved Opportunities
            </h1>

            <p className="font-newsreader mt-2 text-[clamp(1.1rem,2.3vw,1.35rem)] font-medium leading-[1.32] text-[#402818]">
              Revisit the{' '}
              <span className="font-cormorant-italic text-[1.12em] text-[#C65A1B]">
                problems
              </span>{' '}
              you want to investigate further.
            </p>

            <p className="font-dm-sans mt-2 max-w-[64ch] text-[0.9375rem] leading-[1.55] text-[#705848]">
              Bookmarks stored under your Google-authenticated account persist in Cloud
              Firestore across sessions. Demonstration records remain illustrative only.
            </p>
          </section>

          <div className="mt-6 space-y-5">
            {isDevOfflineFixture && <DevOfflineFixtureBanner />}

            {migrationStatus === 'success' && migrationMessage && (
              <div
                data-testid="guest-migration-success-banner"
                role="status"
                className="rounded-xl border border-[#402818]/14 bg-[#FAE8D7]/70 px-4 py-3 font-dm-sans text-[0.875rem] font-medium text-[#402818]"
              >
                {migrationMessage}
              </div>
            )}

            {migrationStatus === 'error' && migrationMessage && (
              <div
                data-testid="guest-migration-error-banner"
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#9E4310]/30 bg-[#FAE8D7] px-4 py-3 font-dm-sans text-[0.875rem] text-[#7B2D0C]"
              >
                <span>{migrationMessage}</span>
                <button
                  type="button"
                  onClick={() => void retryGuestMigration()}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[#402818] px-4 py-1.5 text-[0.8125rem] font-semibold text-white hover:bg-[#2F1B13]"
                >
                  <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
                  <span>Retry Sync</span>
                </button>
              </div>
            )}

            {/* Unauthenticated View */}
            {authStatus === 'signed_out' && (
              <section
                data-testid="saved-unauthenticated-state"
                className="rounded-2xl border border-[#402818]/12 bg-[#FAE8D7]/70 p-6 sm:p-7"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="max-w-xl">
                    <h2 className="font-newsreader text-[1.35rem] font-semibold text-[#402818]">
                      Sign in to persist your saved opportunities
                    </h2>
                    <p className="font-dm-sans mt-1.5 text-[0.9rem] leading-relaxed text-[#705848]">
                      You can explore all approved demonstration problems without an
                      account. Sign in with Google after confirming 18+ eligibility and
                      our pre-launch legal drafts to save opportunities permanently.
                    </p>
                  </div>

                  <button
                    type="button"
                    data-testid="saved-page-signin-cta"
                    onClick={() =>
                      openSignInModal({
                        reason: 'saved_route',
                        returnRoute: '/saved',
                      })
                    }
                    className="font-dm-sans inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#402818] px-6 py-3 text-[0.875rem] font-semibold text-white transition-colors duration-150 hover:bg-[#2F1B13] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
                  >
                    <LogIn size={16} strokeWidth={2} aria-hidden="true" />
                    <span>Sign in with Google</span>
                  </button>
                </div>

                {guestBookmarks.length > 0 && (
                  <div
                    data-testid="guest-draft-bookmarks-list"
                    className="mt-6 border-t border-[#402818]/12 pt-5"
                  >
                    <p className="font-dm-sans text-[0.8125rem] font-semibold tracking-[0.04em] uppercase text-[#705848]">
                      Held in this browser ({guestBookmarks.length}) · Will sync on sign-in
                    </p>
                    <div className="mt-3 space-y-3">
                      {guestBookmarks.map((draft) => {
                        const problem = problemsById.get(draft.problemId);
                        return (
                          <article
                            key={draft.problemId}
                            data-testid={`guest-saved-card-${draft.problemId}`}
                            className="flex flex-col justify-between gap-3 rounded-xl border border-[#402818]/12 bg-[#FFF9F3] p-4 sm:flex-row sm:items-center"
                          >
                            <div className="min-w-0">
                              <p className="font-dm-sans text-[0.75rem] font-semibold uppercase tracking-[0.05em] text-[#806957]">
                                {problem ? problem.categories.join(' · ') : 'Demo record'} · Browser draft
                              </p>
                              <h3 className="font-newsreader mt-1 text-[1.125rem] font-semibold text-[#402818]">
                                {problem ? problem.title : draft.problemId}
                              </h3>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onInvestigateProblem(draft.problemId)}
                                className="font-dm-sans inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[#402818] px-4 py-2 text-[0.8125rem] font-semibold text-white hover:bg-[#2F1B13]"
                              >
                                <span>Investigate</span>
                                <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeGuestDraft(draft.problemId)}
                                aria-label={`Remove ${problem?.title ?? draft.problemId} from browser bookmarks`}
                                className="font-dm-sans inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#402818]/16 bg-[#FFF2E5] px-3.5 py-2 text-[0.8125rem] font-medium text-[#402818] hover:bg-[#FAE8D7]"
                              >
                                <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                                <span>Remove</span>
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Signed-in user needing 18+ & consent onboarding */}
            {authStatus === 'signed_in' && profileStatus === 'needs_onboarding' && (
              <section
                data-testid="saved-onboarding-required-state"
                className="rounded-2xl border border-[#402818]/14 bg-[#FAE8D7]/70 p-6"
              >
                <h2 className="font-newsreader text-[1.3125rem] font-semibold text-[#402818]">
                  Finish account confirmation to access saved items
                </h2>
                <p className="font-dm-sans mt-1.5 text-[0.9rem] leading-relaxed text-[#705848]">
                  Confirm your 18+ eligibility and accept the pre-launch Draft Terms of
                  Service and Draft Privacy Policy before reading or writing saved
                  opportunities in Firestore.
                </p>
                <button
                  type="button"
                  onClick={() => openSignInModal({ reason: 'onboarding_required' })}
                  className="font-dm-sans mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#402818] px-5 py-2.5 text-[0.875rem] font-semibold text-white hover:bg-[#2F1B13]"
                >
                  <span>Complete Confirmation</span>
                </button>
              </section>
            )}

            {/* Loading State */}
            {(authStatus === 'initializing' ||
              (authStatus === 'signed_in' &&
                (profileStatus === 'loading' ||
                  savedStatus === 'loading' ||
                  problemsLoadStatus === 'loading'))) && (
              <DatabaseLoadingSkeleton variant="directory" />
            )}

            {/* Error State */}
            {authStatus === 'signed_in' &&
              (profileStatus === 'error' || savedStatus === 'error') && (
                <section
                  data-testid="saved-error-state"
                  role="alert"
                  className="rounded-2xl border border-[#9E4310]/25 bg-[#FAE8D7]/75 p-6 text-center"
                >
                  <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#402818]/14 bg-[#FFF2E5] text-[#C65A1B]">
                    <AlertCircle size={20} strokeWidth={1.9} aria-hidden="true" />
                  </div>
                  <h2 className="font-newsreader mt-3 text-[1.25rem] font-semibold text-[#402818]">
                    Unable to sync your saved opportunities
                  </h2>
                  <p className="font-dm-sans mx-auto mt-1.5 max-w-lg text-[0.875rem] leading-relaxed text-[#705848]">
                    {savedError ??
                      profileError ??
                      'Unable to retrieve your saved items from Cloud Firestore.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void retrySync()}
                    className="font-dm-sans mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#402818] px-5 py-2.5 text-[0.875rem] font-semibold text-white hover:bg-[#2F1B13]"
                  >
                    <RefreshCw size={15} strokeWidth={2} aria-hidden="true" />
                    <span>Retry Sync</span>
                  </button>
                </section>
              )}

            {problemsLoadStatus === 'error' && (
              <DatabaseErrorState
                errorCode={problemsErrorCode}
                errorMessage={problemsErrorMessage}
                onRetry={retryProblems}
              />
            )}

            {/* Signed-in Ready View */}
            {authStatus === 'signed_in' &&
              profileStatus === 'ready' &&
              savedStatus === 'ready' &&
              problemsLoadStatus !== 'loading' && (
                <>
                  {pendingMigrations.length > 0 && migrationStatus !== 'migrating' && (
                    <div
                      data-testid="pending-migration-prompt"
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#402818]/14 bg-[#FFF9F3] px-4 py-3 font-dm-sans text-[0.875rem] text-[#402818]"
                    >
                      <span>
                        {pendingMigrations.length} browser bookmark
                        {pendingMigrations.length === 1 ? '' : 's'} awaiting account sync.
                      </span>
                      <button
                        type="button"
                        onClick={() => void retryGuestMigration()}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[#402818] px-4 py-1.5 text-[0.8125rem] font-semibold text-white hover:bg-[#2F1B13]"
                      >
                        <span>Save to Account</span>
                      </button>
                    </div>
                  )}

                  {savedItems.length === 0 ? (
                    <section
                      data-testid="saved-empty-state"
                      className="rounded-2xl border border-[#402818]/12 bg-[#FAE8D7]/60 px-6 py-10 text-center"
                    >
                      <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#402818]/12 bg-[#FFF2E5] text-[#C65A1B]">
                        <Bookmark size={20} strokeWidth={1.9} aria-hidden="true" />
                      </div>
                      <h2 className="font-newsreader mt-3 text-[1.35rem] font-semibold text-[#402818]">
                        No saved opportunities yet
                      </h2>
                      <p className="font-dm-sans mx-auto mt-1.5 max-w-md text-[0.9rem] leading-relaxed text-[#705848]">
                        Bookmark problems from Opportunity Radar, Problem Explorer, or
                        any Problem Investigation view to collect them here.
                      </p>
                      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={onNavigateRadar}
                          className="font-dm-sans inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#402818] px-5 py-2.5 text-[0.875rem] font-semibold text-white hover:bg-[#2F1B13]"
                        >
                          <span>Explore Opportunity Radar</span>
                        </button>
                        <button
                          type="button"
                          onClick={onNavigateToExplorer}
                          className="font-dm-sans inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#402818]/18 bg-[#FFF9F3] px-5 py-2.5 text-[0.875rem] font-medium text-[#402818] hover:bg-[#FAE8D7]"
                        >
                          <span>Open Problem Explorer</span>
                        </button>
                      </div>
                    </section>
                  ) : (
                    <section aria-label="Saved opportunities list">
                      <p
                        data-testid="saved-results-count"
                        className="font-dm-sans mb-3 text-[0.8125rem] text-[#705848] tabular-nums"
                      >
                        Showing {savedItems.length} saved opportunit
                        {savedItems.length === 1 ? 'y' : 'ies'}
                      </p>

                      <div
                        data-testid="saved-opportunities-list"
                        className="flex flex-col gap-4"
                      >
                        {savedItems.map((saved) => {
                          const problem = problemsById.get(saved.problemId);
                          const illustration = illustrationByProblemId[saved.problemId];
                          const isBusy = savingProblemIds.includes(saved.problemId);

                          return (
                            <article
                              key={saved.problemId}
                              data-testid={`saved-opportunity-card-${saved.problemId}`}
                              className="flex flex-col gap-4 rounded-2xl border border-[#402818]/12 bg-[#FAE8D7]/70 p-4 transition-colors duration-150 hover:border-[#402818]/24 hover:bg-[#FAE8D7] md:flex-row md:items-stretch md:gap-5 md:p-5"
                            >
                              {illustration && (
                                <div className="h-[112px] w-full shrink-0 overflow-hidden rounded-xl border border-[#402818]/10 md:h-auto md:w-[200px]">
                                  <OpportunityCardIllustration variant={illustration} />
                                </div>
                              )}

                              <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                                <div>
                                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-dm-sans text-[0.75rem] text-[#705848]">
                                    <span className="font-semibold tracking-[0.06em] uppercase">
                                      {problem
                                        ? problem.categories.join(' · ')
                                        : 'Approved Problem'}
                                    </span>
                                    <span aria-hidden="true">·</span>
                                    <span className="tabular-nums text-[#806957]">
                                      Saved {formatSavedDate(saved.savedAt)}
                                    </span>
                                    <span aria-hidden="true">·</span>
                                    <span className="text-[#806957]">
                                      Illustrative example
                                    </span>
                                  </div>

                                  <h2 className="font-newsreader mt-1.5 text-[1.25rem] font-semibold leading-[1.25] text-[#402818] md:text-[1.35rem]">
                                    {problem ? problem.title : saved.problemId}
                                  </h2>

                                  <p className="font-dm-sans mt-2 text-[0.9rem] leading-[1.55] text-[#705848]">
                                    {problem
                                      ? problem.summary
                                      : 'Saved problem record. Open investigation to view details.'}
                                  </p>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#402818]/10 pt-3">
                                  <div className="flex flex-wrap items-center gap-2.5">
                                    <button
                                      type="button"
                                      onClick={() => onInvestigateProblem(saved.problemId)}
                                      className="font-dm-sans group inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[#402818] px-4 py-2 text-[0.8125rem] font-semibold text-white transition-colors duration-150 hover:bg-[#2F1B13] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
                                    >
                                      <span>Investigate Problem</span>
                                      <ArrowRight
                                        size={14}
                                        strokeWidth={2.2}
                                        aria-hidden="true"
                                        className="shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
                                      />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => onEvaluateProblem(saved.problemId)}
                                      className="font-dm-sans inline-flex cursor-pointer items-center rounded-full border border-[#402818]/18 bg-[#FFF9F3] px-4 py-2 text-[0.8125rem] font-medium text-[#402818] transition-colors duration-150 hover:bg-[#FFF2E5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
                                    >
                                      <span>Evaluate Opportunity</span>
                                    </button>
                                  </div>

                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void removeSaved(saved.problemId)}
                                    aria-label={`Remove ${problem?.title ?? saved.problemId} from Saved`}
                                    className="font-dm-sans inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#402818]/16 bg-[#FFF2E5] px-3.5 py-2 text-[0.8125rem] font-medium text-[#402818] transition-colors duration-150 hover:bg-[#F3DFCA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818] disabled:opacity-50"
                                  >
                                    <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                                    <span>{isBusy ? 'Removing...' : 'Remove'}</span>
                                  </button>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </>
              )}
          </div>
        </main>
      </div>

      <HowItWorksModal
        open={howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
      />

      <RoutePlaceholderModal
        activeRoute={placeholderRoute}
        onClose={() => setPlaceholderRoute(null)}
        closeLabel="Back to Saved"
      />
    </div>
  );
}
