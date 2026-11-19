import type { Problem } from '../config/problemExplorer';

interface EvaluationLimitationsSectionProps {
  problem: Problem;
  verifiedEvidenceCount: number;
  recurrenceUnavailable: boolean;
}

export function EvaluationLimitationsSection({
  problem,
  verifiedEvidenceCount,
  recurrenceUnavailable,
}: EvaluationLimitationsSectionProps) {
  const limitationItems: string[] = [];

  if (verifiedEvidenceCount === 0) {
    limitationItems.push('No verified source evidence is connected.');
  } else {
    limitationItems.push(
      `${verifiedEvidenceCount} verified evidence record${verifiedEvidenceCount === 1 ? '' : 's'} connected.`
    );
  }

  if (recurrenceUnavailable) {
    limitationItems.push('Recurrence has not been established.');
  } else {
    limitationItems.push(`Observed recurrence note: ${problem.recurrenceNote}`);
  }

  if (problem.evidenceCoverage.sourceCount === null) {
    limitationItems.push('Source coverage is unknown.');
  } else {
    limitationItems.push(
      `Reported source coverage count: ${problem.evidenceCoverage.sourceCount}.`
    );
  }

  limitationItems.push('Commercial viability has not been validated.');

  return (
    <section
      aria-labelledby="evaluation-limitations-heading"
      data-testid="evaluation-limitations-section"
      className="border-b border-[#402818]/10 pb-7"
    >
      <h2
        id="evaluation-limitations-heading"
        className="font-newsreader text-[1.3125rem] font-semibold text-[#402818]"
      >
        Evidence &amp; Limitations
      </h2>

      <div className="mt-3 rounded-2xl border border-[#402818]/12 bg-[#FAE8D7]/55 p-5">
        <ul className="space-y-2">
          {limitationItems.map((item) => (
            <li
              key={item}
              className="font-dm-sans flex items-start gap-2.5 text-[0.9rem] leading-relaxed text-[#402818]/90"
            >
              <span
                aria-hidden="true"
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#806957]"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
