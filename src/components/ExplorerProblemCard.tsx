import { ArrowRight, FileQuestion } from 'lucide-react';
import type { OpportunityIllustrationKey } from '../config/opportunityRadar';
import type { Problem } from '../config/problemExplorer';
import { OpportunityCardIllustration } from './OpportunityCardIllustration';

interface ExplorerProblemCardProps {
  problem: Problem;
  onInvestigate: (problem: Problem) => void;
}

const PROBLEM_ILLUSTRATION_MAP: Record<string, OpportunityIllustrationKey> = {
  'wet-entrance-monsoons': 'monsoon',
  'student-nutrition-consistency': 'nutrition',
  'excessive-small-delivery-packaging': 'packaging',
};

export function ExplorerProblemCard({
  problem,
  onInvestigate,
}: ExplorerProblemCardProps) {
  const illustrationKey = PROBLEM_ILLUSTRATION_MAP[problem.id];
  const hasEvidence = problem.evidence.length > 0;
  const evidenceLabel = hasEvidence
    ? `${problem.evidence.length} source record${problem.evidence.length === 1 ? '' : 's'} available`
    : 'Evidence not yet available';

  return (
    <article
      data-testid={`explorer-problem-card-${problem.id}`}
      data-problem-id={problem.id}
      className="flex flex-col gap-4 rounded-2xl border border-[#402818]/12 bg-[#FAE8D7]/70 p-4 transition-colors duration-150 hover:border-[#402818]/24 hover:bg-[#FAE8D7] md:flex-row md:items-stretch md:gap-5 md:p-5"
    >
      {/* Existing compact editorial illustration when available */}
      {illustrationKey && (
        <div className="h-[112px] w-full shrink-0 overflow-hidden rounded-xl border border-[#402818]/10 md:h-auto md:w-[200px]">
          <OpportunityCardIllustration variant={illustrationKey} />
        </div>
      )}

      {/* Main editorial problem brief */}
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-dm-sans text-[0.75rem] font-semibold tracking-[0.06em] uppercase text-[#705848]">
              {problem.categories.join(' · ')}
            </span>
            {problem.isIllustrativeDemo && (
              <span className="font-dm-sans text-[0.75rem] font-medium text-[#806957]">
                · Illustrative example
              </span>
            )}
          </div>

          <h2 className="font-newsreader mt-1.5 text-[1.25rem] font-semibold leading-[1.25] text-[#402818] md:text-[1.35rem]">
            {problem.title}
          </h2>

          <p className="font-dm-sans mt-2 text-[0.9rem] leading-[1.55] text-[#705848]">
            {problem.summary}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#402818]/10 pt-3">
          <div className="font-dm-sans flex items-center gap-1.5 text-[0.8125rem] font-medium text-[#705848]">
            <FileQuestion
              size={15}
              strokeWidth={1.9}
              aria-hidden="true"
              className="shrink-0 text-[#806957]"
            />
            <span>{evidenceLabel}</span>
          </div>

          <button
            type="button"
            onClick={() => onInvestigate(problem)}
            aria-label={`Investigate Problem: ${problem.title}`}
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
        </div>
      </div>
    </article>
  );
}
