import { LogIn, LogOut, UserCheck } from 'lucide-react';
import { useAuthAndSaved } from '../contexts/AuthAndSavedContext';

interface AccountControlsProps {
  variant: 'sidebar' | 'compact';
  onActionTaken?: () => void;
}

export function AccountControls({
  variant,
  onActionTaken,
}: AccountControlsProps) {
  const {
    authStatus,
    authUser,
    profileStatus,
    authBusy,
    openSignInModal,
    signOut,
  } = useAuthAndSaved();

  const isSignedIn = authStatus === 'signed_in' && authUser !== null;
  const displayLabel = authUser?.displayName ?? 'Kopi Account';

  if (variant === 'compact') {
    if (!isSignedIn) {
      return (
        <button
          type="button"
          data-testid="mobile-signin-button"
          disabled={authBusy || authStatus === 'initializing'}
          onClick={() => {
            onActionTaken?.();
            openSignInModal({ reason: 'account_button' });
          }}
          className="font-dm-sans inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-[#402818]/14 bg-[#FAE8D7] px-3.5 text-[0.8125rem] font-semibold whitespace-nowrap text-[#402818] transition-colors duration-150 hover:bg-[#F3DFCA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818] disabled:opacity-60"
        >
          <LogIn size={15} strokeWidth={2} aria-hidden="true" />
          <span>Sign in</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        data-testid="mobile-signout-button"
        disabled={authBusy}
        onClick={() => {
          onActionTaken?.();
          void signOut();
        }}
        aria-label={`Sign out (${displayLabel})`}
        className="font-dm-sans inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-[#402818]/14 bg-[#FFF9F3] px-3 text-[0.8125rem] font-medium whitespace-nowrap text-[#402818] transition-colors duration-150 hover:bg-[#FAE8D7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818] disabled:opacity-60"
      >
        <LogOut size={15} strokeWidth={2} aria-hidden="true" />
        <span>Sign out</span>
      </button>
    );
  }

  return (
    <div
      data-testid="sidebar-account-controls"
      className="mt-4 border-t border-[#402818]/10 pt-4"
    >
      {authStatus === 'initializing' ? (
        <p className="font-dm-sans px-2 py-1 text-[0.8125rem] text-[#806957]">
          Checking session...
        </p>
      ) : isSignedIn ? (
        <div className="rounded-xl border border-[#402818]/12 bg-[#FFF9F3] p-3">
          <div className="flex items-start gap-2.5">
            <UserCheck
              size={16}
              strokeWidth={2}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[#C65A1B]"
            />
            <div className="min-w-0 flex-1">
              <p
                data-testid="account-display-name"
                className="font-dm-sans truncate text-[0.84375rem] font-semibold text-[#402818]"
              >
                {displayLabel}
              </p>
              <p className="font-dm-sans text-[0.75rem] text-[#705848]">
                {profileStatus === 'needs_onboarding'
                  ? 'Eligibility confirmation required'
                  : 'Google account'}
              </p>
            </div>
          </div>

          {profileStatus === 'needs_onboarding' && (
            <button
              type="button"
              onClick={() => {
                onActionTaken?.();
                openSignInModal({ reason: 'onboarding_required' });
              }}
              className="font-dm-sans mt-2.5 w-full cursor-pointer rounded-full bg-[#402818] px-3 py-1.5 text-[0.78rem] font-semibold text-white transition-colors duration-150 hover:bg-[#2F1B13]"
            >
              Complete Onboarding
            </button>
          )}

          <button
            type="button"
            data-testid="sidebar-signout-button"
            disabled={authBusy}
            onClick={() => {
              onActionTaken?.();
              void signOut();
            }}
            className="font-dm-sans mt-2.5 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-full border border-[#402818]/14 bg-[#FFF2E5] px-3 py-1.5 text-[0.78rem] font-medium text-[#402818] transition-colors duration-150 hover:bg-[#FAE8D7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818] disabled:opacity-50"
          >
            <LogOut size={13} strokeWidth={2} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-testid="sidebar-signin-button"
          disabled={authBusy}
          onClick={() => {
            onActionTaken?.();
            openSignInModal({ reason: 'account_button' });
          }}
          className="font-dm-sans inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#402818]/16 bg-[#FFF9F3] px-3.5 py-2.5 text-[0.84375rem] font-semibold text-[#402818] transition-colors duration-150 hover:bg-[#FFF2E5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818] disabled:opacity-60"
        >
          <LogIn size={15} strokeWidth={2} aria-hidden="true" className="text-[#C65A1B]" />
          <span>Sign in with Google</span>
        </button>
      )}
    </div>
  );
}
