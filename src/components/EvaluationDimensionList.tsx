import type {
  EvaluationDimension,
  EvaluationDimensionKey,
} from '../config/opportunityEvaluation';
import type { QualitativeRelevanceSummaryItem } from '../config/problemExplorer';

interface EvaluationDimensionListProps {
  dimensions: readonly EvaluationDimension[];
  qualitativeDimensions?: readonly QualitativeRelevanceSummaryItem[];
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

const QUALITATIVE_STATUS_META: Record<
  QualitativeRelevanceSummaryItem['status'],
  { label: string; badgeClass: string; dotClass: string }
> = {
  supported: {
    label: 'Supported',
    badgeClass: 'border-[#7A8463]/35 bg-[#7A8463]/14 text-[#3F4A2D]',
    dotClass: 'bg-[#7A8463]',
  },
  partially_supported: {
    label: 'Partially supported',
    badgeClass: 'border-[#C65A1B]/30 bg-[#FAE8D7]/80 text-[#9E4310]',
    dotClass: 'bg-[#C65A1B]',
  },
  insufficient_evidence: {
    label: 'Insufficient evidence',
    badgeClass: 'border-[#402818]/14 bg-[#FAE8D7]/60 text-[#705848]',
    dotClass: 'bg-[#806957]',
  },
  contradicted: {
    label: 'Contradicted',
    badgeClass: 'border-[#9E4310]/40 bg-[#9E4310]/12 text-[#7B2D0C]',
    dotClass: 'bg-[#9E4310]',
  },
};

export function EvaluationDimensionList({
  dimensions,
  qualitativeDimensions,
}: EvaluationDimensionListProps) {
  const hasQualitative =
    Boolean(qualitativeDimensions && qualitativeDimensions.length > 0);

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
          {hasQualitative ? 'Qualitative Commercial Relevance' : 'Evaluation Dimensions'}
        </h2>
        <span className="font-dm-sans text-[0.78rem] font-medium text-[#806957]">
          No numeric scores assigned
        </span>
      </div>

      <div
        data-testid="evaluation-dimensions-list"
        className="mt-4 divide-y divide-[#402818]/10 rounded-2xl border border-[#402818]/12 bg-[#FFF9F3]"
      >
        {hasQualitative
          ? qualitativeDimensions!.map((dim) => {
              const meta = QUALITATIVE_STATUS_META[dim.status];
              return (
                <div
                  key={dim.key}
                  data-testid={`evaluation-dimension-${dim.key}`}
                  className="px-5 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 shrink-0 rounded-full ${meta.dotClass}`}
                      />
                      <h3 className="font-dm-sans text-[0.9375rem] font-semibold text-[#402818]">
                        {dim.label}
                      </h3>
                    </div>

                    <span
                      className={`font-dm-sans inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.75rem] font-medium ${meta.badgeClass}`}
                    >
                      {meta.label}
                    </span>
                  </div>

                  <p className="font-dm-sans mt-1.5 pl-4.5 text-[0.875rem] leading-relaxed text-[#402818]/90">
                    {dim.summary}
                  </p>

                  {dim.unresolvedQuestion && (
                    <p className="font-dm-sans mt-1.5 pl-4.5 text-[0.8125rem] leading-relaxed text-[#705848]">
                      <strong>Open question:</strong> {dim.unresolvedQuestion}
                    </p>
                  )}
                </div>
              );
            })
          : dimensions.map((dimension) => {
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
