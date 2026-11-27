import { useState } from 'react';
import { ArrowLeft, Bookmark, Info, Menu } from 'lucide-react';
import type { SidebarNavItem } from '../config/opportunityRadar';
import type { Problem } from '../config/problemExplorer';
import {
  createEmptyEvaluation,
  getEvaluationReadiness,
  validateEvaluationClaims,
} from '../config/opportunityEvaluation';
import { useAuthAndSaved } from '../contexts/AuthAndSavedContext';
import { useDemoProblem } from '../hooks/useDemoProblems';
import { AccountControls } from './AccountControls';
import {
  DatabaseErrorState,
  DatabaseLoadingSkeleton,
  DevOfflineFixtureBanner,
} from './DatabaseStateCard';
import { EvaluationDimensionList } from './EvaluationDimensionList';
import { EvaluationLimitationsSection } from './EvaluationLimitationsSection';
import { EvaluationMissingState } from './EvaluationMissingState';
import { EvaluationReadinessPanel } from './EvaluationReadinessPanel';
import { HowItWorksModal } from './HowItWorksModal';
import { KopiLogo } from './KopiLogo';
import { RadarSidebar } from './RadarSidebar';
import {
  RoutePlaceholderModal,
  type RoutePlaceholderState,
} from './RoutePlaceholderModal';

interface OpportunityEvaluationScreenProps {
  problemId: string;
  onNavigateHome: () => void;
  onNavigateRadar: () => void;
  onNavigateToExplorer: () => void;
  onNavigateToSaved?: () => void;
  onBackToInvestigation: (problemId: string) => void;
}

const GENERAL_RESEARCH_CHECKLIST: readonly string[] = [
  'Collect permitted primary observations.',
  'Establish recurrence and source coverage.',
  'Research current alternatives.',
  'Investigate affected customers.',
  'Test willingness to pay.',
] as const;

function renderEvaluationContent(
  problem: Problem,
  onBackToInvestigation: (id: string) => void,
  bookmarkState: {
    isSaved: boolean;
    isSaving: boolean;
    onToggle: (p: Problem) => void;
  }
) {
  const readiness = getEvaluationReadiness(problem);
  const evaluation = createEmptyEvaluation(problem);
  const validation = validateEvaluationClaims(evaluation, problem);

  const recurrenceUnavailable =
    !problem.recurrenceNote ||
    problem.recurrenceNote.toLowerCase().startsWith('not available');

  const recurrenceLabel = recurrenceUnavailable
    ? 'Recurrence is unknown (not yet established).'
    : problem.recurrenceNote;

  return (
    <div
      data-testid="opportunity-evaluation-dossier"
      data-problem-id={problem.id}
      data-evaluation-status={evaluation.status}
      data-validation-passed={validation.valid ? 'true' : 'false'}
      className="space-y-8"
    >
      {/* 2. Page Header */}
      <header className="border-b border-[#402818]/12 pb-6">
        <div className="flex flex-wrap items-center gap-2 text-[0.75rem] font-semibold tracking-[0.06em] uppercase text-[#705848]">
          <span>{problem.categories.join(' · ')}</span>
          <span aria-hidden="true">·</span>
          <span className="font-dm-sans normal-case tracking-normal font-medium text-[#806957]">
            ID: {problem.id}
          </span>
        </div>

        <h1 className="font-newsreader mt-2 text-[clamp(1.85rem,4.5vw,2.5rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-[#402818]">
          Opportunity Evaluation
        </h1>

        <p className="font-newsreader mt-2 text-[clamp(1.0625rem,2.2vw,1.3125rem)] font-medium leading-[1.35] text-[#402818]">
          A deeper look at the potential{' '}
          <span className="font-cormorant-italic text-[1.12em] text-[#C65A1B]">
            business opportunity
          </span>{' '}
          behind this problem.
        </p>

        <p className="font-dm-sans mt-3 text-[0.95rem] font-semibold text-[#402818]">
          Evaluating problem:{' '}
          <span className="font-newsreader font-semibold">{problem.title}</span>
        </p>

        <div className="mt-3.5 flex flex-wrap items-center gap-3">
          {problem.isIllustrativeDemo ? (
            <div
              data-testid="evaluation-demo-notice"
              className="inline-flex items-center gap-2 rounded-xl border border-[#402818]/14 bg-[#FAE8D7]/80 px-3.5 py-2 text-[0.8125rem] font-medium text-[#402818]"
            >
              <Info
                size={15}
                strokeWidth={2}
                aria-hidden="true"
                className="shrink-0 text-[#C65A1B]"
              />
              <span>Illustrative demonstration problem — not verified research.</span>
            </div>
          ) : (
            <div
              data-testid="evaluation-verified-notice"
              className="inline-flex items-center gap-2 rounded-xl border border-[#7A8463]/35 bg-[#7A8463]/14 px-3.5 py-2 text-[0.8125rem] font-medium text-[#3F4A2D]"
            >
              <Info
                size={15}
                strokeWidth={2}
                aria-hidden="true"
                className="shrink-0 text-[#4D573B]"
              />
              <span>Verified research — qualitative review without numeric scores.</span>
            </div>
          )}

          <button
            type="button"
            disabled={bookmarkState.isSaving}
            aria-pressed={bookmarkState.isSaved}
            data-testid="evaluation-bookmark-button"
            aria-label={
              bookmarkState.isSaved
                ? `Remove bookmark for ${problem.title}`
                : `Save ${problem.title}`
            }
            onClick={() => bookmarkState.onToggle(problem)}
            className={`font-dm-sans inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 text-[0.8125rem] font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818] disabled:opacity-50 ${
              bookmarkState.isSaved
                ? 'border-[#C65A1B]/45 bg-[#C65A1B]/12 text-[#C65A1B]'
                : 'border-[#402818]/16 bg-[#FFF9F3] text-[#402818] hover:bg-[#FAE8D7]'
            }`}
          >
            <Bookmark
              size={15}
              strokeWidth={2}
              fill={bookmarkState.isSaved ? 'currentColor' : 'none'}
              aria-hidden="true"
            />
            <span>{bookmarkState.isSaved ? 'Saved' : 'Save'}</span>
          </button>
        </div>
      </header>

      {/* 3. Selected Problem Summary */}
      <section
        aria-labelledby="evaluation-problem-summary-heading"
        data-testid="evaluation-problem-summary"
        className="border-b border-[#402818]/10 pb-7"
      >
        <h2
          id="evaluation-problem-summary-heading"
          className="font-newsreader text-[1.3125rem] font-semibold text-[#402818]"
        >
          Selected Problem Summary
        </h2>

        <div className="mt-3 rounded-2xl border border-[#402818]/12 bg-[#FFF9F3] p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-newsreader text-[1.125rem] font-semibold text-[#402818]">
              {problem.title}
            </h3>
            <span className="font-dm-sans text-[0.75rem] font-semibold tracking-[0.05em] uppercase text-[#705848]">
              {problem.categories.join(' · ')}
            </span>
          </div>

          <p className="font-dm-sans mt-2 text-[0.9rem] leading-relaxed text-[#402818]/88">
            {problem.summary}
          </p>

          <dl className="mt-4 grid grid-cols-1 gap-4 border-t border-[#402818]/10 pt-4 text-[0.84375rem] md:grid-cols-2">
            <div>
              <dt className="font-dm-sans text-[0.75rem] font-semibold tracking-[0.06em] uppercase text-[#806957]">
                Available Audience Context
              </dt>
              <dd className="mt-1 text-[#402818]">
                {problem.affectedAudience.length > 0 ? (
                  <ul className="space-y-1">
                    {problem.affectedAudience.map((group) => (
                      <li key={group}>{group}</li>
                    ))}
                  </ul>
                ) : (
                  'Audience scope has not yet been established.'
                )}
              </dd>
            </div>

            <div>
              <dt className="font-dm-sans text-[0.75rem] font-semibold tracking-[0.06em] uppercase text-[#806957]">
                Recurrence Information
              </dt>
              <dd className="mt-1 text-[#402818]">{recurrenceLabel}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* 4. Evaluation Readiness Overview */}
      <EvaluationReadinessPanel
        readiness={readiness}
        evaluation={evaluation}
        problem={problem}
      />

      {/* 5. Evaluation Dimensions */}
      <EvaluationDimensionList
        dimensions={evaluation.dimensions}
        qualitativeDimensions={problem.commercialRelevanceDimensions}
      />

      {/* 6. Risks and Unknowns */}
      <section
        aria-labelledby="evaluation-unknowns-heading"
        data-testid="evaluation-unknowns-section"
        className="border-b border-[#402818]/10 pb-7"
      >
        <h2
          id="evaluation-unknowns-heading"
          className="font-newsreader text-[1.3125rem] font-semibold text-[#402818]"
        >
          What Still Needs Validation
        </h2>

        <div className="mt-3 space-y-4">
          <div className="rounded-2xl border border-[#402818]/12 bg-[#FFF9F3] p-5">
            <h3 className="font-dm-sans text-[0.75rem] font-semibold tracking-[0.06em] uppercase text-[#705848]">
              Unknowns &amp; Research Gaps (Unverified)
            </h3>
            {evaluation.unknowns.length > 0 ? (
              <ul
                data-testid="evaluation-unknowns-list"
                className="mt-2.5 space-y-2"
              >
                {evaluation.unknowns.map((gap) => (
                  <li
                    key={gap}
                    className="font-dm-sans flex items-start gap-2.5 text-[0.9rem] leading-relaxed text-[#402818]/90"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C65A1B]"
                    />
                    <span>{gap}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-dm-sans mt-2 text-[0.875rem] text-[#705848]">
                No documented research gaps recorded.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-[#402818]/12 bg-[#FAE8D7]/45 p-5">
            <h3 className="font-dm-sans text-[0.75rem] font-semibold tracking-[0.06em] uppercase text-[#705848]">
              Assessed Risks
            </h3>
            {evaluation.risks.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {evaluation.risks.map((risk) => (
                  <li
                    key={risk.id}
                    className="font-dm-sans text-[0.875rem] leading-relaxed text-[#402818]"
                  >
                    {risk.description}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-dm-sans mt-2 text-[0.875rem] leading-relaxed text-[#705848]">
                No verified commercial or operational risks have been recorded yet
                because primary evidence is unavailable.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 7. Evidence Limitations */}
      <EvaluationLimitationsSection
        problem={problem}
        verifiedEvidenceCount={readiness.verifiedEvidenceCount}
        recurrenceUnavailable={recurrenceUnavailable}
      />

      {/* 8. Recommended Next Research Actions */}
      <section
        aria-labelledby="evaluation-next-steps-heading"
        data-testid="evaluation-next-steps-section"
        className="border-b border-[#402818]/10 pb-7"
      >
        <h2
          id="evaluation-next-steps-heading"
          className="font-newsreader text-[1.3125rem] font-semibold text-[#402818]"
        >
          Recommended Next Steps
        </h2>

        {evaluation.recommendedNextSteps.length > 0 ? (
          <ul className="mt-3 space-y-2.5 rounded-2xl border border-[#402818]/12 bg-[#FFF9F3] p-5">
            {evaluation.recommendedNextSteps.map((step) => (
              <li
                key={step.id}
                className="font-dm-sans text-[0.9rem] leading-relaxed text-[#402818]"
              >
                <span className="font-semibold">{step.action}</span>{' '}
                <span className="text-[#705848]">({step.targetUnknownOrGap})</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-[#402818]/18 bg-[#FFF9F3] p-5">
            <p className="font-dm-sans text-[0.8125rem] font-medium text-[#806957]">
              Suggested general research checklist — not completed analysis or
              AI-generated findings.
            </p>
            <ul
              data-testid="evaluation-checklist"
              className="mt-3 space-y-2"
            >
              {GENERAL_RESEARCH_CHECKLIST.map((activity) => (
                <li
                  key={activity}
                  className="font-dm-sans flex items-start gap-2.5 text-[0.9rem] leading-relaxed text-[#402818]/90"
                >
                  <span
                    aria-hidden="true"
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#7A8463]"
                  />
                  <span>{activity}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 9. Return to Investigation Action */}
      <section
        aria-label="Return to Problem Investigation"
        className="flex flex-col justify-between gap-4 rounded-2xl border border-[#402818]/12 bg-[#FAE8D7]/70 p-6 sm:flex-row sm:items-center"
      >
        <div>
          <p className="font-newsreader text-[1.1875rem] font-semibold text-[#402818]">
            Review the source record first
          </p>
          <p className="font-dm-sans mt-1 text-[0.875rem] text-[#705848]">
            Return to this problem&apos;s investigation dossier to inspect stored
            context and remaining unknowns.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onBackToInvestigation(problem.id)}
          className="font-dm-sans group inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#402818] px-6 py-3 text-[0.9rem] font-semibold text-white transition-colors duration-150 hover:bg-[#2F1B13] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
        >
          <ArrowLeft
            size={16}
            strokeWidth={2.2}
            aria-hidden="true"
            className="shrink-0 transition-transform duration-150 group-hover:-translate-x-0.5"
          />
          <span>Return to Investigation</span>
        </button>
      </section>
    </div>
  );
}

export function OpportunityEvaluationScreen({
  problemId,
  onNavigateHome,
  onNavigateRadar,
  onNavigateToExplorer,
  onNavigateToSaved,
  onBackToInvestigation,
}: OpportunityEvaluationScreenProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [placeholderRoute, setPlaceholderRoute] =
    useState<RoutePlaceholderState | null>(null);

  const {
    savedCount,
    savedError,
    savingProblemIds,
    isProblemSaved,
    toggleBookmark,
  } = useAuthAndSaved();

  const {
    status: loadStatus,
    problem,
    errorCode,
    errorMessage,
    isDevOfflineFixture,
    retry,
  } = useDemoProblem(problemId);

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

    if (item.id === 'saved' && onNavigateToSaved) {
      onNavigateToSaved();
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
      data-testid="opportunity-evaluation-screen"
      data-problem-id={problem?.id ?? ''}
      className="flex min-h-[100dvh] w-full bg-[#FFF2E5] text-[#402818]"
    >
      <RadarSidebar
        activeNavId="problem-explorer"
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
        {/* Compact Mobile & Tablet Top Bar (< 1024px) */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-[#402818]/10 bg-[#FFF2E5]/95 px-4 py-2.5 backdrop-blur-xs sm:px-6 lg:hidden">
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

        <main className="mx-auto w-full max-w-[900px] flex-1 px-4 pt-6 pb-14 sm:px-6 md:px-8 lg:px-10 lg:pt-9">
          {/* 1. Back Navigation */}
          <nav
            aria-label="Evaluation breadcrumb"
            className="mb-6 flex flex-wrap items-center justify-between gap-2"
          >
            {problem ? (
              <button
                type="button"
                onClick={() => onBackToInvestigation(problem.id)}
                className="font-dm-sans group inline-flex cursor-pointer items-center gap-1.5 rounded-full py-1 pr-2 text-[0.875rem] font-semibold text-[#402818] transition-colors duration-150 hover:text-[#C65A1B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
              >
                <ArrowLeft
                  size={15}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  className="shrink-0 transition-transform duration-150 group-hover:-translate-x-0.5"
                />
                <span>Back to Investigation</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onNavigateToExplorer}
                className="font-dm-sans group inline-flex cursor-pointer items-center gap-1.5 rounded-full py-1 pr-2 text-[0.875rem] font-semibold text-[#402818] transition-colors duration-150 hover:text-[#C65A1B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
              >
                <ArrowLeft
                  size={15}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  className="shrink-0 transition-transform duration-150 group-hover:-translate-x-0.5"
                />
                <span>Return to Problem Explorer</span>
              </button>
            )}

            <button
              type="button"
              onClick={onNavigateToExplorer}
              className="font-dm-sans cursor-pointer rounded-full py-1 text-[0.8125rem] font-medium text-[#705848] transition-colors duration-150 hover:text-[#402818] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
            >
              Problem Explorer Directory
            </button>
          </nav>

          {isDevOfflineFixture && <DevOfflineFixtureBanner />}

          {savedError && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-[#9E4310]/30 bg-[#FAE8D7] px-4 py-2.5 font-dm-sans text-[0.84375rem] text-[#7B2D0C]"
            >
              {savedError}
            </div>
          )}

          {loadStatus === 'loading' ? (
            <DatabaseLoadingSkeleton variant="dossier" />
          ) : loadStatus === 'error' ? (
            <DatabaseErrorState
              errorCode={errorCode}
              errorMessage={errorMessage}
              onRetry={retry}
              secondaryActionLabel="Return to Problem Explorer"
              onSecondaryAction={onNavigateToExplorer}
            />
          ) : problem ? (
            renderEvaluationContent(problem, onBackToInvestigation, {
              isSaved: isProblemSaved(problem.id),
              isSaving: savingProblemIds.includes(problem.id),
              onToggle: (target) =>
                void toggleBookmark({
                  problemId: target.id,
                  problemTitle: target.title,
                  sourceScreen: 'opportunity-evaluation',
                }),
            })
          ) : (
            <EvaluationMissingState
              attemptedId={problemId}
              onReturnToExplorer={onNavigateToExplorer}
              onReturnToRadar={onNavigateRadar}
            />
          )}
        </main>
      </div>

      <HowItWorksModal
        open={howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
      />

      <RoutePlaceholderModal
        activeRoute={placeholderRoute}
        onClose={() => setPlaceholderRoute(null)}
        closeLabel="Back to Evaluation"
      />
    </div>
  );
}
