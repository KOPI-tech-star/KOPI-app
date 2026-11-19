import { Info, ShieldAlert } from 'lucide-react';
import type {
  EvaluationReadiness,
  OpportunityEvaluation,
} from '../config/opportunityEvaluation';
import { BotanicalBranch } from './BotanicalBranch';

interface EvaluationReadinessPanelProps {
  readiness: EvaluationReadiness;
  evaluation: OpportunityEvaluation;
}

export function EvaluationReadinessPanel({
  readiness,
  evaluation,
}: EvaluationReadinessPanelProps) {
  const statusHeading =
    readiness.status === 'insufficient_evidence'
      ? 'Insufficient Evidence'
      : readiness.status === 'preliminary_hypothesis'
        ? 'Preliminary Hypothesis Only'
        : 'Evidence-Supported Review';

  const statusExplanation =
    readiness.status === 'insufficient_evidence'
      ? 'Not enough verified information is available to produce a reliable opportunity assessment.'
      : 'Verified observations are connected, though scoring remains uncomputed without an approved rubric.';

  return (
    <section
      aria-labelledby="evaluation-readiness-heading"
      data-testid="evaluation-readiness-panel"
      className="relative overflow-hidden rounded-2xl border border-[#402818]/12 bg-gradient-to-br from-[#FFF9F3] via-[#FDF0E3] to-[#F8E4CE] p-6 sm:p-7"
    >
      {/* Restrained botanical accent echoing Kopi's editorial stationery language */}
      <BotanicalBranch
        className="pointer-events-none absolute -top-5 -right-5 h-[140px] w-[160px] opacity-[0.14] select-none"
      />

      <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C65A1B]/30 bg-[#FFF2E5] px-3 py-1 font-dm-sans text-[0.75rem] font-semibold tracking-[0.04em] uppercase text-[#9E4310]">
              <ShieldAlert size={13} strokeWidth={2.2} aria-hidden="true" />
              <span>{statusHeading}</span>
            </span>
          </div>

          <h2
            id="evaluation-readiness-heading"
            className="font-newsreader mt-3 text-[1.4375rem] font-semibold leading-snug text-[#402818]"
          >
            {statusHeading}
          </h2>

          <p className="font-dm-sans mt-1.5 max-w-[60ch] text-[0.9375rem] leading-relaxed text-[#402818]/88">
            {statusExplanation}
          </p>

          <p className="font-dm-sans mt-2.5 flex items-start gap-2 text-[0.8125rem] leading-relaxed text-[#705848]">
            <Info
              size={14}
              strokeWidth={2}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[#806957]"
            />
            <span>
              Missing evidence is not equivalent to zero commercial potential.
              No opportunity score or success probability has been inferred.
            </span>
          </p>
        </div>

        {/* Non-quantitative status card (replaces quantitative score ring honestly) */}
        <div
          data-testid="evaluation-score-status-box"
          className="w-full shrink-0 rounded-2xl border border-[#402818]/14 bg-[#FFF2E5]/92 px-5 py-4 text-left md:w-[256px] md:text-center"
        >
          <p className="font-dm-sans text-[0.72rem] font-semibold tracking-[0.06em] uppercase text-[#806957]">
            Assessment Score
          </p>
          <p className="font-newsreader mt-1 text-[1.5rem] font-semibold leading-tight text-[#402818]">
            Not scored
          </p>
          <p className="font-dm-sans mt-1 text-[0.78rem] font-medium text-[#705848]">
            Evaluation not scored
          </p>
          <dl className="mt-3.5 space-y-1.5 border-t border-[#402818]/10 pt-3 text-left text-[0.75rem]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="font-dm-sans text-[#806957]">Verified sources</dt>
              <dd className="font-dm-sans shrink-0 font-semibold tabular-nums text-[#402818]">
                {readiness.verifiedEvidenceCount}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="font-dm-sans text-[#806957]">Methodology</dt>
              <dd className="font-dm-sans shrink-0 font-semibold text-[#402818]">
                {evaluation.scoreMethodologyVersion ?? 'Not approved'}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
