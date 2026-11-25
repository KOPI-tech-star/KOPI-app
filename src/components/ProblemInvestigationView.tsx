import { useState } from 'react';
import { ArrowLeft, ArrowRight, Info, Menu } from 'lucide-react';
import type {
  OpportunityIllustrationKey,
  SidebarNavItem,
} from '../config/opportunityRadar';
import type { Problem } from '../config/problemExplorer';
import { useDemoProblem } from '../hooks/useDemoProblems';
import {
  DatabaseErrorState,
  DatabaseLoadingSkeleton,
  DevOfflineFixtureBanner,
} from './DatabaseStateCard';
import { EvidenceSourcesList } from './EvidenceSourcesList';
import { HowItWorksModal } from './HowItWorksModal';
import { KopiLogo } from './KopiLogo';
import { OpportunityCardIllustration } from './OpportunityCardIllustration';
import { ProblemNotFoundState } from './ProblemNotFoundState';
import { RadarSidebar } from './RadarSidebar';
import {
  RoutePlaceholderModal,
  type RoutePlaceholderState,
} from './RoutePlaceholderModal';

interface ProblemInvestigationViewProps {
  problemId: string;
  onNavigateHome: () => void;
  onNavigateRadar: () => void;
  onBackToExplorer: () => void;
  onEvaluateProblem?: (problemId: string) => void;
}

const PROBLEM_ILLUSTRATION_MAP: Record<string, OpportunityIllustrationKey> = {
  'wet-entrance-monsoons': 'monsoon',
  'student-nutrition-consistency': 'nutrition',
  'excessive-small-delivery-packaging': 'packaging',
};

function renderInvestigationBody(
  problem: Problem,
  onEvaluateOpportunity: (p: Problem) => void
) {
  const illustrationKey = PROBLEM_ILLUSTRATION_MAP[problem.id];
  const validEvidenceIds = new Set(problem.evidence.map((e) => e.id));

  // Enforce evidence-attribution rule in UI: evidence_backed insights require valid local evidence IDs
  const evidenceBackedInsights = problem.insights.filter(
    (insight) =>
      insight.kind === 'evidence_backed' &&
      insight.supportingEvidenceIds.length > 0 &&
      insight.supportingEvidenceIds.every((id) => validEvidenceIds.has(id))
  );
  const workingHypotheses = problem.insights.filter(
    (insight) => insight.kind === 'hypothesis'
  );
  const hasAnyRenderableInsights =
    evidenceBackedInsights.length > 0 || workingHypotheses.length > 0;

  const hasUnavailableRecurrence =
    !problem.recurrenceNote ||
    problem.recurrenceNote.toLowerCase().startsWith('not available');

  const recurrenceText = hasUnavailableRecurrence
    ? 'Recurrence has not yet been verified.'
    : problem.recurrenceNote;

  const hasEvidence = problem.evidence.length > 0;
  const isSourceCountUnknown = problem.evidenceCoverage.sourceCount === null;

  return (
    <div
      data-testid="problem-investigation-dossier"
      data-problem-id={problem.id}
      className="space-y-8"
    >
      {/* 2. Problem Header */}
      <section
        aria-labelledby="investigation-problem-title"
        className="border-b border-[#402818]/12 pb-7"
      >
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[0.75rem] font-semibold tracking-[0.06em] uppercase text-[#705848]">
              <span>{problem.categories.join(' · ')}</span>
              <span aria-hidden="true">·</span>
              <span className="font-dm-sans normal-case tracking-normal font-medium text-[#806957]">
                ID: {problem.id}
              </span>
            </div>

            <h1
              id="investigation-problem-title"
              className="font-newsreader mt-2 text-[clamp(1.75rem,4.4vw,2.45rem)] font-semibold leading-[1.14] tracking-[-0.02em] text-[#402818]"
            >
              {problem.title}
            </h1>

            <p className="font-dm-sans mt-3 max-w-[66ch] text-[1rem] leading-[1.6] text-[#402818]/88">
              {problem.summary}
            </p>

            {problem.isIllustrativeDemo && (
              <div
                data-testid="investigation-demo-notice"
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#402818]/14 bg-[#FAE8D7]/80 px-3.5 py-2 text-[0.8125rem] font-medium text-[#402818]"
              >
                <Info
                  size={15}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="shrink-0 text-[#C65A1B]"
                />
                <span>Illustrative problem — not verified research.</span>
              </div>
            )}
          </div>

          {illustrationKey && (
            <div className="h-[120px] w-full shrink-0 overflow-hidden rounded-2xl border border-[#402818]/12 bg-[#FAE8D7] md:h-[132px] md:w-[236px]">
              <OpportunityCardIllustration variant={illustrationKey} />
            </div>
          )}
        </div>
      </section>

      {/* 3. Problem Summary */}
      <section
        aria-labelledby="investigation-summary-heading"
        className="border-b border-[#402818]/10 pb-7"
      >
        <h2
          id="investigation-summary-heading"
          className="font-newsreader text-[1.3125rem] font-semibold text-[#402818]"
        >
          Problem Summary
        </h2>

        <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="rounded-xl border border-[#402818]/10 bg-[#FFF9F3] p-4">
            <h3 className="font-dm-sans text-[0.75rem] font-semibold tracking-[0.06em] uppercase text-[#705848]">
              Potentially Affected Groups
            </h3>
            {problem.affectedAudience.length > 0 ? (
              <ul className="font-dm-sans mt-2 space-y-1.5 text-[0.875rem] leading-relaxed text-[#402818]">
                {problem.affectedAudience.map((group) => (
                  <li key={group}>{group}</li>
                ))}
              </ul>
            ) : (
              <p className="font-dm-sans mt-2 text-[0.875rem] text-[#705848]">
                Not established.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-[#402818]/10 bg-[#FFF9F3] p-4">
            <h3 className="font-dm-sans text-[0.75rem] font-semibold tracking-[0.06em] uppercase text-[#705848]">
              Recurrence &amp; Categories
            </h3>
            <p className="font-dm-sans mt-2 text-[0.875rem] leading-relaxed text-[#402818]">
              {recurrenceText}
            </p>
            <p className="font-dm-sans mt-2 text-[0.8125rem] text-[#705848]">
              Categories: {problem.categories.join(', ')}
            </p>
          </div>
        </div>
      </section>

      {/* 4. Evidence Overview */}
      <section
        aria-labelledby="investigation-coverage-heading"
        className="border-b border-[#402818]/10 pb-7"
      >
        <h2
          id="investigation-coverage-heading"
          className="font-newsreader text-[1.3125rem] font-semibold text-[#402818]"
        >
          Evidence Overview
        </h2>

        {!hasEvidence && isSourceCountUnknown ? (
          <div
            data-testid="evidence-coverage-unconnected"
            className="mt-3 rounded-xl border border-[#402818]/12 bg-[#FAE8D7]/60 p-5"
          >
            <p className="font-dm-sans text-[0.9375rem] font-semibold text-[#402818]">
              No verified evidence connected yet.
            </p>
            <p className="font-dm-sans mt-1 text-[0.875rem] leading-relaxed text-[#705848]">
              This illustrative problem has not yet been linked to verified source
              observations. Unknown coverage metrics are intentionally left
              unassigned rather than estimated.
            </p>

            <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-[#402818]/10 pt-3.5 text-[0.8125rem] sm:grid-cols-3">
              <div>
                <dt className="font-dm-sans text-[#806957]">Source coverage</dt>
                <dd className="font-dm-sans mt-0.5 font-semibold text-[#402818]">
                  Unknown (not connected)
                </dd>
              </div>
              <div>
                <dt className="font-dm-sans text-[#806957]">
                  Verified observations
                </dt>
                <dd className="font-dm-sans mt-0.5 font-semibold text-[#402818]">
                  Not available
                </dd>
              </div>
              <div>
                <dt className="font-dm-sans text-[#806957]">
                  Observation period
                </dt>
                <dd className="font-dm-sans mt-0.5 font-semibold text-[#402818]">
                  {problem.evidenceCoverage.lastUpdated ?? 'Not established'}
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-[#402818]/12 bg-[#FFF9F3] p-5">
            <p className="font-dm-sans text-[0.875rem] leading-relaxed text-[#402818]">
              {problem.evidenceCoverage.coverageNote}
            </p>
            <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-[#402818]/10 pt-3.5 text-[0.8125rem] sm:grid-cols-3">
              <div>
                <dt className="font-dm-sans text-[#806957]">Sources</dt>
                <dd className="font-dm-sans mt-0.5 font-semibold text-[#402818]">
                  {problem.evidenceCoverage.sourceCount ?? 'Unknown'}
                </dd>
              </div>
              <div>
                <dt className="font-dm-sans text-[#806957]">
                  Verified records
                </dt>
                <dd className="font-dm-sans mt-0.5 font-semibold text-[#402818]">
                  {problem.evidenceCoverage.verifiedCount}
                </dd>
              </div>
              <div>
                <dt className="font-dm-sans text-[#806957]">Last updated</dt>
                <dd className="font-dm-sans mt-0.5 font-semibold text-[#402818]">
                  {problem.evidenceCoverage.lastUpdated ?? 'Not available'}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      {/* 5. Source Evidence */}
      <section
        aria-labelledby="investigation-sources-heading"
        className="border-b border-[#402818]/10 pb-7"
      >
        <h2
          id="investigation-sources-heading"
          className="font-newsreader text-[1.3125rem] font-semibold text-[#402818]"
        >
          Source Evidence
        </h2>
        <div className="mt-3">
          <EvidenceSourcesList evidence={problem.evidence} />
        </div>
      </section>

      {/* 6. Key Insights */}
      <section
        aria-labelledby="investigation-insights-heading"
        className="border-b border-[#402818]/10 pb-7"
      >
        <h2
          id="investigation-insights-heading"
          className="font-newsreader text-[1.3125rem] font-semibold text-[#402818]"
        >
          Key Insights
        </h2>

        {!hasAnyRenderableInsights ? (
          <div
            data-testid="insights-empty-state"
            className="mt-3 rounded-xl border border-[#402818]/12 bg-[#FAE8D7]/45 px-5 py-5"
          >
            <p className="font-dm-sans text-[0.9rem] text-[#705848]">
              Insights will appear when supporting evidence is available.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            {evidenceBackedInsights.length > 0 && (
              <div>
                <h3 className="font-dm-sans text-[0.75rem] font-semibold tracking-[0.06em] uppercase text-[#705848]">
                  Evidence-Supported Findings
                </h3>
                <ul className="mt-2 space-y-2.5">
                  {evidenceBackedInsights.map((insight) => (
                    <li
                      key={insight.id}
                      className="rounded-xl border border-[#402818]/12 bg-[#FFF9F3] p-4"
                    >
                      <p className="font-dm-sans text-[0.9rem] leading-relaxed text-[#402818]">
                        {insight.statement}
                      </p>
                      <p className="font-dm-sans mt-2 text-[0.75rem] text-[#806957]">
                        Supporting evidence:{' '}
                        {insight.supportingEvidenceIds.join(', ')}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {workingHypotheses.length > 0 && (
              <div>
                <h3 className="font-dm-sans text-[0.75rem] font-semibold tracking-[0.06em] uppercase text-[#705848]">
                  Working Hypotheses (Unverified)
                </h3>
                <ul className="mt-2 space-y-2.5">
                  {workingHypotheses.map((insight) => (
                    <li
                      key={insight.id}
                      className="rounded-xl border border-dashed border-[#402818]/18 bg-[#FAE8D7]/45 p-4"
                    >
                      <p className="font-dm-sans text-[0.9rem] leading-relaxed text-[#402818]">
                        {insight.statement}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 7. Existing Alternatives */}
      <section
        aria-labelledby="investigation-alternatives-heading"
        className="border-b border-[#402818]/10 pb-7"
      >
        <h2
          id="investigation-alternatives-heading"
          className="font-newsreader text-[1.3125rem] font-semibold text-[#402818]"
        >
          Existing Alternatives
        </h2>

        {problem.existingAlternatives.length === 0 ? (
          <div
            data-testid="alternatives-empty-state"
            className="mt-3 rounded-xl border border-[#402818]/12 bg-[#FAE8D7]/45 px-5 py-5"
          >
            <p className="font-dm-sans text-[0.9rem] text-[#705848]">
              Existing alternatives have not yet been researched.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {problem.existingAlternatives.map((alt) => (
              <div
                key={alt.id}
                className="rounded-xl border border-[#402818]/12 bg-[#FFF9F3] p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-dm-sans text-[0.95rem] font-semibold text-[#402818]">
                    {alt.name}
                  </h3>
                  <span className="font-dm-sans text-[0.75rem] text-[#806957]">
                    {alt.category}
                  </span>
                </div>
                <p className="font-dm-sans mt-1.5 text-[0.875rem] leading-relaxed text-[#705848]">
                  {alt.observedShortcoming}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 8. Unknowns and Risks */}
      <section
        aria-labelledby="investigation-unknowns-heading"
        className="border-b border-[#402818]/10 pb-7"
      >
        <h2
          id="investigation-unknowns-heading"
          className="font-newsreader text-[1.3125rem] font-semibold text-[#402818]"
        >
          What We Still Don&apos;t Know
        </h2>

        <ul
          data-testid="unknowns-list"
          className="mt-3 space-y-2.5 rounded-xl border border-[#402818]/12 bg-[#FFF9F3] p-5"
        >
          {problem.unknownsAndRisks.map((unknownItem) => (
            <li
              key={unknownItem}
              className="font-dm-sans flex items-start gap-2.5 text-[0.9rem] leading-relaxed text-[#402818]/90"
            >
              <span
                aria-hidden="true"
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C65A1B]"
              />
              <span>{unknownItem}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 9. Evaluate Opportunity Action */}
      <section
        aria-label="Next workflow step"
        className="flex flex-col justify-between gap-4 rounded-2xl border border-[#402818]/12 bg-[#FAE8D7]/70 p-6 sm:flex-row sm:items-center"
      >
        <div>
          <p className="font-newsreader text-[1.1875rem] font-semibold text-[#402818]">
            Ready for the next stage?
          </p>
          <p className="font-dm-sans mt-1 text-[0.875rem] text-[#705848]">
            Move from problem investigation to structured opportunity evaluation
            once evidence is connected.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onEvaluateOpportunity(problem)}
          className="font-dm-sans group inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#402818] px-6 py-3 text-[0.9rem] font-semibold text-white transition-colors duration-150 hover:bg-[#2F1B13] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
        >
          <span>Evaluate Opportunity</span>
          <ArrowRight
            size={16}
            strokeWidth={2.2}
            aria-hidden="true"
            className="shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
          />
        </button>
      </section>
    </div>
  );
}

export function ProblemInvestigationView({
  problemId,
  onNavigateHome,
  onNavigateRadar,
  onBackToExplorer,
  onEvaluateProblem,
}: ProblemInvestigationViewProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [placeholderRoute, setPlaceholderRoute] =
    useState<RoutePlaceholderState | null>(null);

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
      onBackToExplorer();
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

  const handleEvaluateOpportunity = (target: Problem) => {
    if (onEvaluateProblem) {
      onEvaluateProblem(target.id);
      return;
    }

    setPlaceholderRoute({
      title: 'Opportunity Evaluation coming next',
      description: `The Opportunity Evaluation workspace for "${target.title}" (ID: ${target.id}) is the next stage in KOPI's Discover → Investigate → Evaluate workflow. No evaluation or score has been generated yet.`,
    });
  };

  return (
    <div
      data-testid="problem-investigation-view"
      data-problem-id={problem?.id ?? ''}
      className="flex min-h-[100dvh] w-full bg-[#FFF2E5] text-[#402818]"
    >
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
        {/* Mobile & Tablet Top Bar */}
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

        <main className="mx-auto w-full max-w-[900px] flex-1 px-4 pt-6 pb-14 sm:px-6 md:px-8 lg:px-10 lg:pt-9">
          {/* 1. Breadcrumb Navigation */}
          <nav
            aria-label="Investigation breadcrumb"
            className="mb-6 flex flex-wrap items-center justify-between gap-2"
          >
            <button
              type="button"
              onClick={onBackToExplorer}
              className="font-dm-sans group inline-flex cursor-pointer items-center gap-1.5 rounded-full py-1 pr-2 text-[0.875rem] font-semibold text-[#402818] transition-colors duration-150 hover:text-[#C65A1B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
            >
              <ArrowLeft
                size={15}
                strokeWidth={2.2}
                aria-hidden="true"
                className="shrink-0 transition-transform duration-150 group-hover:-translate-x-0.5"
              />
              <span>Back to Problem Explorer</span>
            </button>

            <button
              type="button"
              onClick={onNavigateRadar}
              className="font-dm-sans cursor-pointer rounded-full py-1 text-[0.8125rem] font-medium text-[#705848] transition-colors duration-150 hover:text-[#402818] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
            >
              Return to Opportunity Radar
            </button>
          </nav>

          {isDevOfflineFixture && <DevOfflineFixtureBanner />}

          {loadStatus === 'loading' ? (
            <DatabaseLoadingSkeleton variant="dossier" />
          ) : loadStatus === 'error' ? (
            <DatabaseErrorState
              errorCode={errorCode}
              errorMessage={errorMessage}
              onRetry={retry}
              secondaryActionLabel="Back to Problem Explorer"
              onSecondaryAction={onBackToExplorer}
            />
          ) : problem ? (
            renderInvestigationBody(problem, handleEvaluateOpportunity)
          ) : (
            <ProblemNotFoundState
              attemptedId={problemId}
              onBackToExplorer={onBackToExplorer}
              onNavigateRadar={onNavigateRadar}
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
        closeLabel="Back to Investigation"
      />
    </div>
  );
}
