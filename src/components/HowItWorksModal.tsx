import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface HowItWorksModalProps {
  open: boolean;
  onClose: () => void;
}

const METHODOLOGY_STEPS = [
  {
    step: '01',
    title: 'Gather recurring friction',
    detail:
      'Kopi collects public complaints, support frustrations, and unmet needs rather than startup hype.',
  },
  {
    step: '02',
    title: 'Inspect the underlying evidence',
    detail:
      'Every problem cluster links back to real source observations so you can verify who feels the pain and why.',
  },
  {
    step: '03',
    title: 'Evaluate viable opportunities',
    detail:
      'Compare urgency, existing workarounds, and willingness to pay before committing time or capital.',
  },
] as const;

export function HowItWorksModal({ open, onClose }: HowItWorksModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kopi-how-it-works-title"
    >
      <div
        className="fixed inset-0 bg-[#2F1B13]/32"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-[#402818]/14 bg-[#FAE8D7] p-7 text-[#402818] shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-dm-sans text-xs font-medium tracking-[0.08em] uppercase text-[#705848]">
              Editorial Discovery Process
            </p>
            <h2
              id="kopi-how-it-works-title"
              className="font-newsreader mt-1 text-[1.625rem] font-semibold leading-tight text-[#402818]"
            >
              How Kopi investigates opportunities
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close How It Works"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#402818] transition-colors duration-150 hover:bg-[#402818]/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
          >
            <X size={20} strokeWidth={1.9} />
          </button>
        </div>

        <ol className="mt-5 space-y-4 border-t border-[#402818]/10 pt-5">
          {METHODOLOGY_STEPS.map((item) => (
            <li key={item.step} className="flex gap-3.5">
              <span className="font-dm-sans mt-0.5 text-xs font-semibold tabular-nums text-[#C65A1B]">
                {item.step}.
              </span>
              <div>
                <h3 className="font-dm-sans text-[0.95rem] font-semibold text-[#402818]">
                  {item.title}
                </h3>
                <p className="font-dm-sans mt-1 text-[0.875rem] leading-relaxed text-[#705848]">
                  {item.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex items-center justify-between border-t border-[#402818]/10 pt-4">
          <span className="font-dm-sans text-xs text-[#705848]">
            Dedicated guide route coming in an upcoming screen.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="font-dm-sans cursor-pointer rounded-full bg-[#402818] px-5 py-2.5 text-[0.875rem] font-semibold text-white transition-colors duration-150 hover:bg-[#2F1B13] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
