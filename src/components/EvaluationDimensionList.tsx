import type {
  EvaluationDimension,
  EvaluationDimensionKey,
} from '../config/opportunityEvaluation';

interface EvaluationDimensionListProps {
  dimensions: readonly EvaluationDimension[];
}

const DISPLAY_LABELS: Record<EvaluationDimensionKey, string> = {
  evidence_strength: 'Evidence Strength',
  customer_problem: 'Customer Problem',
  market_context: 'Market Context',
  existing_alternatives: 'Existing Alternatives',
  business_feasibility: 'Business Feasibility',
  risks: 'Risks',
};

const DOT_COLOR_BY_KEY: Record<EvaluationDimensionKey, string> = {
  evidence_strength: 'bg-[#7A8463]',
  customer_problem: 'bg-[#8F7A61]',
  market_context: 'bg-[#C65A1B]',
  existing_alternatives: 'bg-[#9A7456]',
  business_feasibility: 'bg-[#7A6B5C]',
  risks: 'bg-[#B35D33]',
};

export function EvaluationDimensionList({
  dimensions,
}: EvaluationDimensionListProps) {
  return (
    <section
      aria-labelledby="evaluation-dimensions-heading"
      data-testid="evaluation-dimensions-section"
      className="border-b border-[#402818]/10 pb-7"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="evaluation-dimensions-heading"
          className="font-newsreader text-[1.3125rem] font-semibold text-[#402818]"
        >
          Evaluation Dimensions
        </h2>
        <span className="font-dm-sans text-[0.78rem] font-medium text-[#806957]">
          No numeric scores assigned
        </span>
      </div>

      <div
        data-testid="evaluation-dimensions-list"
        className="mt-4 divide-y divide-[#402818]/10 rounded-2xl border border-[#402818]/12 bg-[#FFF9F3]"
      >
        {dimensions.map((dimension) => {
          const isUnavailable = dimension.status === 'unavailable';
          const statusLabel = isUnavailable
            ? 'Not assessed'
            : dimension.status === 'hypothesis_only'
              ? 'Hypothesis only'
              : 'Evidence-backed';
          const label = DISPLAY_LABELS[dimension.key] ?? dimension.label;
          const dotColor = DOT_COLOR_BY_KEY[dimension.key] ?? 'bg-[#806957]';

          return (
            <div
              key={dimension.key}
              data-testid={`evaluation-dimension-${dimension.key}`}
              className="px-5 py-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`}
                  />
                  <h3 className="font-dm-sans text-[0.9375rem] font-semibold text-[#402818]">
                    {label}
                  </h3>
                </div>

                <span className="font-dm-sans inline-flex items-center rounded-full border border-[#402818]/12 bg-[#FAE8D7]/70 px-2.5 py-0.5 text-[0.75rem] font-medium text-[#705848]">
                  {statusLabel}
                </span>
              </div>

              {isUnavailable && dimension.unavailableReason && (
                <p className="font-dm-sans mt-1.5 pl-4.5 text-[0.84375rem] leading-relaxed text-[#705848]">
                  {dimension.unavailableReason}
                </p>
              )}

              {!isUnavailable && dimension.findings.length > 0 && (
                <ul className="mt-2 space-y-1.5 pl-4.5">
                  {dimension.findings.map((finding) => (
                    <li
                      key={finding.id}
                      className="font-dm-sans text-[0.875rem] leading-relaxed text-[#402818]"
                    >
                      {finding.statement}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
