import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bookmark, ShieldCheck, X } from 'lucide-react';
import {
  AGE_ELIGIBILITY_DISCLOSURE,
  CONSENT_CHECKBOX_COPY,
} from '../config/legalDisclosures';
import type { PendingBookmarkIntent } from '../contexts/AuthAndSavedContext';

interface AuthOnboardingModalProps {
  open: boolean;
  reason: 'bookmark' | 'saved_route' | 'account_button' | 'onboarding_required';
  pendingBookmark: PendingBookmarkIntent | null;
  isAlreadySignedIn: boolean;
  busy: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onOpenLegalDraft: (kind: 'terms' | 'privacy') => void;
  onSubmitGoogleSignIn: (input: {
    confirmedEighteenOrOlder: boolean;
    acceptedTermsAndPrivacy: boolean;
  }) => Promise<void>;
  onSubmitExistingUserOnboarding: (input: {
    confirmedEighteenOrOlder: boolean;
    acceptedTermsAndPrivacy: boolean;
  }) => Promise<void>;
}

export function AuthOnboardingModal({
  open,
  reason,
  pendingBookmark,
  isAlreadySignedIn,
  busy,
  errorMessage,
  onClose,
  onOpenLegalDraft,
  onSubmitGoogleSignIn,
  onSubmitExistingUserOnboarding,
}: AuthOnboardingModalProps) {
  const [confirmedEighteenOrOlder, setConfirmedEighteenOrOlder] = useState(false);
  const [acceptedTermsAndPrivacy, setAcceptedTermsAndPrivacy] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      setValidationError(null);
      return;
    }

    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, onClose, open]);

  if (!open) return null;

  const canSubmit = confirmedEighteenOrOlder && acceptedTermsAndPrivacy && !busy;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!confirmedEighteenOrOlder) {
      setValidationError(
        'You must confirm that you are at least 18 years old before creating a Kopi account.'
      );
      return;
    }

    if (!acceptedTermsAndPrivacy) {
      setValidationError(
        'You must accept the pre-launch Draft Terms of Service and Draft Privacy Policy before continuing.'
      );
      return;
    }

    setValidationError(null);
    if (isAlreadySignedIn) {
      await onSubmitExistingUserOnboarding({
        confirmedEighteenOrOlder,
        acceptedTermsAndPrivacy,
      });
    } else {
      await onSubmitGoogleSignIn({
        confirmedEighteenOrOlder,
        acceptedTermsAndPrivacy,
      });
    }
  };

  const subtitleText =
    reason === 'bookmark' && pendingBookmark
      ? `Sign in with Google to save "${pendingBookmark.problemTitle}" to your Kopi account. A browser bookmark has been held locally in the meantime.`
      : reason === 'saved_route'
        ? 'Sign in with Google to store and revisit saved opportunities across sessions.'
        : isAlreadySignedIn
          ? 'Complete 18+ eligibility confirmation and consent acceptance to activate your personal saved opportunities.'
          : 'Sign in with Google to create or access your Kopi account and save opportunities across sessions.';

  const combinedError = validationError ?? errorMessage;

  return (
    <div
      data-testid="auth-onboarding-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kopi-auth-modal-title"
    >
      <div
        className="fixed inset-0 bg-[#2F1B13]/35"
        onClick={() => {
          if (!busy) onClose();
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#402818]/14 bg-[#FFF2E5] p-6 text-[#402818] shadow-xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-dm-sans text-[0.75rem] font-semibold tracking-[0.06em] uppercase text-[#C65A1B]">
              {isAlreadySignedIn ? 'Account Eligibility & Consent' : 'Kopi Account Access'}
            </p>
            <h2
              id="kopi-auth-modal-title"
              className="font-newsreader mt-1 text-[1.5rem] font-semibold leading-tight text-[#402818]"
            >
              {isAlreadySignedIn
                ? 'Confirm eligibility to continue'
                : 'Sign in to save opportunities'}
            </h2>
          </div>

          <button
            ref={closeRef}
            type="button"
            disabled={busy}
            aria-label="Close sign-in dialog"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#402818] transition-colors duration-150 hover:bg-[#402818]/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818] disabled:opacity-50"
          >
            <X size={20} strokeWidth={1.9} />
          </button>
        </div>

        <p className="font-dm-sans mt-2.5 text-[0.9rem] leading-relaxed text-[#705848]">
          {subtitleText}
        </p>

        {pendingBookmark && (
          <div
            data-testid="auth-pending-bookmark-banner"
            className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#402818]/12 bg-[#FAE8D7]/65 p-3.5 text-[0.84375rem] text-[#402818]"
          >
            <Bookmark
              size={16}
              strokeWidth={2}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[#C65A1B]"
            />
            <p className="font-dm-sans leading-snug">
              Pending bookmark:{' '}
              <span className="font-semibold">{pendingBookmark.problemTitle}</span>
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* 1. Explicit 18+ Eligibility Declaration */}
          <div className="rounded-xl border border-[#402818]/12 bg-[#FFF9F3] p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                id="kopi-age-eligibility-checkbox"
                data-testid="age-eligibility-checkbox"
                type="checkbox"
                checked={confirmedEighteenOrOlder}
                onChange={(e) => {
                  setConfirmedEighteenOrOlder(e.target.checked);
                  setValidationError(null);
                }}
                disabled={busy}
                className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[#402818]"
              />
              <span className="font-dm-sans text-[0.875rem] font-medium leading-snug text-[#402818]">
                {AGE_ELIGIBILITY_DISCLOSURE.checkboxLabel}
              </span>
            </label>
            <p className="font-dm-sans mt-2 pl-7 text-[0.78rem] leading-relaxed text-[#806957]">
              {AGE_ELIGIBILITY_DISCLOSURE.honestyNote}
            </p>
          </div>

          {/* 2. Versioned Draft Terms & Privacy Acceptance */}
          <div className="rounded-xl border border-[#402818]/12 bg-[#FFF9F3] p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                id="kopi-consent-checkbox"
                data-testid="legal-consent-checkbox"
                type="checkbox"
                checked={acceptedTermsAndPrivacy}
                onChange={(e) => {
                  setAcceptedTermsAndPrivacy(e.target.checked);
                  setValidationError(null);
                }}
                disabled={busy}
                className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[#402818]"
              />
              <span className="font-dm-sans text-[0.875rem] leading-snug text-[#402818]">
                {CONSENT_CHECKBOX_COPY.labelPrefix}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenLegalDraft('terms');
                  }}
                  className="cursor-pointer font-semibold text-[#C65A1B] underline underline-offset-2 hover:text-[#9E4310]"
                >
                  {CONSENT_CHECKBOX_COPY.termsLinkLabel}
                </button>
                {CONSENT_CHECKBOX_COPY.labelMiddle}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenLegalDraft('privacy');
                  }}
                  className="cursor-pointer font-semibold text-[#C65A1B] underline underline-offset-2 hover:text-[#9E4310]"
                >
                  {CONSENT_CHECKBOX_COPY.privacyLinkLabel}
                </button>
                {CONSENT_CHECKBOX_COPY.labelSuffix}
              </span>
            </label>

            <div className="mt-2.5 flex items-center gap-1.5 pl-7 text-[0.78rem] text-[#806957]">
              <ShieldCheck size={14} strokeWidth={1.9} aria-hidden="true" className="shrink-0" />
              <span className="font-dm-sans">
                Only your user ID, optional display name, and consent timestamps are stored in Firestore.
              </span>
            </div>
          </div>

          {combinedError && (
            <div
              data-testid="auth-modal-error"
              role="alert"
              className="rounded-xl border border-[#9E4310]/30 bg-[#FAE8D7] px-4 py-3 font-dm-sans text-[0.84375rem] font-medium text-[#7B2D0C]"
            >
              {combinedError}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="font-dm-sans inline-flex cursor-pointer items-center justify-center rounded-full border border-[#402818]/18 bg-[#FFF9F3] px-5 py-2.5 text-[0.875rem] font-medium text-[#402818] transition-colors duration-150 hover:bg-[#FAE8D7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818] disabled:opacity-50"
            >
              Continue Browsing Demo
            </button>

            <button
              type="submit"
              data-testid="google-signin-submit-button"
              aria-disabled={!canSubmit}
              disabled={busy}
              className={`font-dm-sans inline-flex cursor-pointer items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[0.875rem] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818] ${
                canSubmit
                  ? 'bg-[#402818] text-white hover:bg-[#2F1B13]'
                  : 'bg-[#402818]/45 text-white hover:bg-[#402818]/55'
              } disabled:cursor-not-allowed`}
            >
              <span>
                {busy
                  ? 'Connecting...'
                  : isAlreadySignedIn
                    ? 'Confirm Eligibility & Continue'
                    : 'Continue with Google'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
