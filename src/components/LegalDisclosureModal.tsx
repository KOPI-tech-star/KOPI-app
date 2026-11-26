import { useEffect, useRef } from 'react';
import { FileText, X } from 'lucide-react';
import type { LegalDraftDocument } from '../config/legalDisclosures';

interface LegalDisclosureModalProps {
  document: LegalDraftDocument | null;
  onClose: () => void;
}

export function LegalDisclosureModal({
  document,
  onClose,
}: LegalDisclosureModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!document) return;
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [document, onClose]);

  if (!document) return null;

  return (
    <div
      data-testid={`legal-disclosure-modal-${document.kind}`}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kopi-legal-modal-title"
    >
      <div
        className="fixed inset-0 bg-[#2F1B13]/40"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 flex max-h-[86dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#402818]/15 bg-[#FFF2E5] text-[#402818] shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#402818]/12 px-6 py-5">
          <div>
            <p className="font-dm-sans text-[0.75rem] font-semibold tracking-[0.06em] uppercase text-[#C65A1B]">
              {document.draftStatusLabel}
            </p>
            <h2
              id="kopi-legal-modal-title"
              className="font-newsreader mt-1 text-[1.5rem] font-semibold leading-tight text-[#402818]"
            >
              {document.title}
            </h2>
            <p className="font-dm-sans mt-1 text-[0.78rem] text-[#705848]">
              Document version · <span className="tabular-nums">{document.version}</span>
            </p>
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close legal draft dialog"
            className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#402818] transition-colors duration-150 hover:bg-[#402818]/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
          >
            <X size={20} strokeWidth={1.9} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          <div className="flex items-start gap-2.5 rounded-xl border border-[#402818]/14 bg-[#FAE8D7]/70 p-3.5 text-[0.84375rem] text-[#402818]">
            <FileText
              size={16}
              strokeWidth={1.9}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[#C65A1B]"
            />
            <p className="font-dm-sans leading-relaxed">{document.effectiveNotice}</p>
          </div>

          <div className="mt-5 space-y-5">
            {document.sections.map((section) => (
              <section key={section.heading}>
                <h3 className="font-newsreader text-[1.0625rem] font-semibold text-[#402818]">
                  {section.heading}
                </h3>
                <div className="mt-1.5 space-y-2">
                  {section.paragraphs.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="font-dm-sans text-[0.875rem] leading-[1.6] text-[#705848]"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end border-t border-[#402818]/12 bg-[#FAE8D7]/45 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="font-dm-sans cursor-pointer rounded-full bg-[#402818] px-5 py-2.5 text-[0.875rem] font-semibold text-white transition-colors duration-150 hover:bg-[#2F1B13] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
          >
            Close Draft
          </button>
        </div>
      </div>
    </div>
  );
}
