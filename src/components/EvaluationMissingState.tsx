import { ArrowLeft, SearchX } from 'lucide-react';

interface EvaluationMissingStateProps {
  attemptedId: string;
  onReturnToExplorer: () => void;
  onReturnToRadar: () => void;
}

export function EvaluationMissingState({
  attemptedId,
  onReturnToExplorer,
  onReturnToRadar,
}: EvaluationMissingStateProps) {
  return (
    <section
      data-testid="evaluation-missing-state"
      aria-labelledby="evaluation-missing-heading"
      className="mx-auto my-8 max-w-[600px] rounded-2xl border border-[#402818]/14 bg-[#FAE8D7]/70 px-6 py-10 text-center"
    >
      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#402818]/14 bg-[#FFF2E5] text-[#C65A1B]">
        <SearchX size={22} strokeWidth={1.8} aria-hidden="true" />
      </div>

      <p className="font-dm-sans mt-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase text-[#806957]">
        Opportunity Evaluation
      </p>

      <h1
        id="evaluation-missing-heading"
        className="font-newsreader mt-2 text-[1.75rem] font-semibold text-[#402818]"
      >
        Problem not found.
      </h1>

      <p className="font-dm-sans mx-auto mt-2 max-w-md text-[0.9375rem] leading-relaxed text-[#705848]">
        {attemptedId
          ? `No problem record matching "${attemptedId}" is available to evaluate.`
          : 'No valid problem identifier was provided for evaluation.'}
      </p>

      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onReturnToExplorer}
          className="font-dm-sans inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-[#402818] px-6 py-2.5 text-[0.875rem] font-semibold text-white transition-colors duration-150 hover:bg-[#2F1B13] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
        >
          <ArrowLeft size={15} strokeWidth={2.2} aria-hidden="true" />
          <span>Return to Problem Explorer</span>
        </button>

        <button
          type="button"
          onClick={onReturnToRadar}
          className="font-dm-sans inline-flex cursor-pointer items-center justify-center rounded-full border border-[#402818]/18 bg-[#FFF9F3] px-5 py-2.5 text-[0.875rem] font-medium text-[#402818] transition-colors duration-150 hover:bg-[#F3DFCA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
        >
          Return to Opportunity Radar
        </button>
      </div>
    </section>
  );
}
