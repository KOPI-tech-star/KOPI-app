import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface RoutePlaceholderState {
  title: string;
  description: string;
}

interface RoutePlaceholderModalProps {
  activeRoute: RoutePlaceholderState | null;
  onClose: () => void;
  closeLabel?: string;
}

export function RoutePlaceholderModal({
  activeRoute,
  onClose,
  closeLabel = 'Back to Home',
}: RoutePlaceholderModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!activeRoute) return;

    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeRoute, onClose]);

  if (!activeRoute) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kopi-route-dialog-title"
    >
      <div
        className="fixed inset-0 bg-[#2F1B13]/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#392419]/12 bg-[var(--kopi-cream)] p-7 text-[#392419] shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <h2
            id="kopi-route-dialog-title"
            className="font-newsreader text-[1.625rem] font-semibold leading-tight text-[#392419]"
          >
            {activeRoute.title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#392419] transition-colors duration-150 hover:bg-[#392419]/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#392419]"
          >
            <X size={20} strokeWidth={1.9} />
          </button>
        </div>
        <p className="font-dm-sans mt-3 text-[0.975rem] font-normal leading-relaxed text-[#392419]/85">
          {activeRoute.description}
        </p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="font-dm-sans cursor-pointer rounded-full bg-[var(--kopi-brown)] px-5 py-2.5 text-[0.875rem] font-semibold text-white transition-colors duration-150 hover:bg-[var(--kopi-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kopi-brown)]"
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
