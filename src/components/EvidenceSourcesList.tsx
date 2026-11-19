import { ExternalLink, FileText } from 'lucide-react';
import {
  sanitizeExternalUrl,
  type EvidenceRecord,
} from '../config/problemExplorer';

interface EvidenceRecordCardProps {
  record: EvidenceRecord;
}

const SOURCE_TYPE_LABELS: Record<EvidenceRecord['sourceType'], string> = {
  forum_thread: 'Forum discussion',
  support_ticket: 'Support observation',
  interview_note: 'Interview note',
  review_excerpt: 'Review excerpt',
  field_observation: 'Field observation',
  dataset_demo: 'Demonstration note',
};

const VERIFICATION_LABELS: Record<EvidenceRecord['verificationStatus'], string> = {
  verified: 'Verified source',
  illustrative_demo: 'Illustrative demo',
  unverified: 'Unverified',
};

export function EvidenceRecordCard({ record }: EvidenceRecordCardProps) {
  const safeUrl = sanitizeExternalUrl(record.externalUrl);

  return (
    <article
      data-testid={`evidence-record-${record.id}`}
      className="rounded-xl border border-[#402818]/12 bg-[#FFF9F3] p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-[0.75rem]">
        <div className="flex flex-wrap items-center gap-2 text-[#705848]">
          <span className="font-dm-sans font-semibold text-[#402818]">
            {record.sourceName}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-dm-sans">
            {SOURCE_TYPE_LABELS[record.sourceType]}
          </span>
          {record.observedDate && (
            <>
              <span aria-hidden="true">·</span>
              <time dateTime={record.observedDate} className="font-dm-sans">
                {record.observedDate}
              </time>
            </>
          )}
        </div>

        <span className="font-dm-sans text-[0.75rem] font-medium text-[#806957]">
          {VERIFICATION_LABELS[record.verificationStatus]}
        </span>
      </div>

      <p className="font-dm-sans mt-2.5 text-[0.9rem] leading-[1.58] text-[#402818]">
        {record.excerpt}
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#402818]/8 pt-2.5 text-[0.75rem] text-[#806957]">
        <span className="font-dm-sans">Record ID: {record.id}</span>
        {safeUrl && (
          <a
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="font-dm-sans inline-flex items-center gap-1 font-medium text-[#C65A1B] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
          >
            <span>View source</span>
            <ExternalLink size={12} strokeWidth={2} aria-hidden="true" />
          </a>
        )}
      </div>
    </article>
  );
}

interface EvidenceSourcesListProps {
  evidence: readonly EvidenceRecord[];
}

export function EvidenceSourcesList({ evidence }: EvidenceSourcesListProps) {
  if (evidence.length === 0) {
    return (
      <div
        data-testid="source-evidence-empty"
        className="rounded-xl border border-dashed border-[#402818]/18 bg-[#FAE8D7]/45 px-5 py-6"
      >
        <div className="flex items-start gap-3">
          <FileText
            size={18}
            strokeWidth={1.8}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-[#806957]"
          />
          <div>
            <p className="font-dm-sans text-[0.9375rem] font-semibold text-[#402818]">
              No source evidence available.
            </p>
            <p className="font-dm-sans mt-1 text-[0.875rem] leading-relaxed text-[#705848]">
              No verified primary observations or external citations have been
              connected to this illustrative problem yet.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="source-evidence-list" className="space-y-3">
      {evidence.map((record) => (
        <EvidenceRecordCard key={record.id} record={record} />
      ))}
    </div>
  );
}
