import { ArrowLeft } from 'lucide-react';

interface ProblemNotFoundStateProps {
  attemptedId: string;
  onBackToExplorer: () => void;
  onNavigateRadar: () => void;
}

export function ProblemNotFoundState({
  attemptedId,
  onBackToExplorer,
  onNavigateRadar,
}: ProblemNotFoundStateProps) {
  return (
    <section
      data-testid="problem-not-found-state"
      aria-labelledby="problem-not-found-heading"
      className="mx-auto my-8 max-w-[680px] rounded-2xl border border-[#402818]/14 bg-[#FAE8D7]/65 p-7 sm:p-9"
    >
      <p className="font-dm-sans text-xs font-semibold tracking-[0.08em] uppercase text-[#705848]">
        Problem Investigation
      </p>
      <h1
        id="problem-not-found-heading"
        className="font-newsreader mt-2 text-[clamp(1.65rem,4vw,2.15rem)] font-semibold leading-tight text-[#402818]"
      >
        Problem record not found.
      </h1>
      <p className="font-dm-sans mt-3 text-[0.9375rem] leading-relaxed text-[#705848]">
        {attemptedId
          ? `No problem record matching "${attemptedId}" is present in the current directory.`
          : 'The requested problem identifier is missing or malformed.'}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBackToExplorer}
          className="font-dm-sans inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#402818] px-5 py-2.5 text-[0.875rem] font-semibold text-white transition-colors duration-150 hover:bg-[#2F1B13] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
        >
          <ArrowLeft size={15} strokeWidth={2.2} aria-hidden="true" />
          <span>Back to Problem Explorer</span>
        </button>

        <button
          type="button"
          onClick={onNavigateRadar}
          className="font-dm-sans inline-flex cursor-pointer items-center rounded-full border border-[#402818]/18 bg-[#FFF2E5] px-5 py-2.5 text-[0.875rem] font-semibold text-[#402818] transition-colors duration-150 hover:bg-[#F6E2CE] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
        >
          Return to Opportunity Radar
        </button>
      </div>
    </section>
  );
}
