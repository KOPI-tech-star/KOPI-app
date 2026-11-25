import { AlertCircle, Database, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
import type { RepositoryErrorCode } from '../data/repositories/problemRepository';

interface DatabaseLoadingSkeletonProps {
  variant: 'radar' | 'directory' | 'dossier';
}

export function DatabaseLoadingSkeleton({
  variant,
}: DatabaseLoadingSkeletonProps) {
  if (variant === 'radar') {
    return (
      <div
        data-testid="database-loading-skeleton"
        aria-busy="true"
        aria-label="Loading demonstration opportunities from Firestore"
        className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
      >
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="animate-pulse rounded-2xl border border-[#402818]/10 bg-[#FAE8D7]/60 p-4"
          >
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-24 rounded-full bg-[#402818]/10" />
              <div className="h-9 w-9 rounded-full bg-[#402818]/10" />
            </div>
            <div className="mt-3 h-[112px] w-full rounded-xl bg-[#402818]/8" />
            <div className="mt-4 h-5 w-4/5 rounded bg-[#402818]/10" />
            <div className="mt-2.5 space-y-1.5">
              <div className="h-3.5 w-full rounded bg-[#402818]/8" />
              <div className="h-3.5 w-5/6 rounded bg-[#402818]/8" />
            </div>
            <div className="mt-4 border-t border-[#402818]/8 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="h-7 rounded bg-[#402818]/8" />
                <div className="h-7 rounded bg-[#402818]/8" />
              </div>
              <div className="mt-3 h-4 w-32 rounded bg-[#402818]/10" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'directory') {
    return (
      <div
        data-testid="database-loading-skeleton"
        aria-busy="true"
        aria-label="Loading demonstration problems from Firestore"
        className="flex flex-col gap-4"
      >
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="animate-pulse rounded-2xl border border-[#402818]/10 bg-[#FAE8D7]/60 p-5"
          >
            <div className="h-3.5 w-28 rounded-full bg-[#402818]/10" />
            <div className="mt-3 h-6 w-2/3 rounded bg-[#402818]/10" />
            <div className="mt-2 h-4 w-full rounded bg-[#402818]/8" />
            <div className="mt-1.5 h-4 w-4/5 rounded bg-[#402818]/8" />
            <div className="mt-4 flex items-center justify-between border-t border-[#402818]/8 pt-3">
              <div className="h-4 w-36 rounded bg-[#402818]/8" />
              <div className="h-9 w-36 rounded-full bg-[#402818]/10" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      data-testid="database-loading-skeleton"
      aria-busy="true"
      aria-label="Loading problem dossier from Firestore"
      className="space-y-6"
    >
      <div className="animate-pulse border-b border-[#402818]/10 pb-6">
        <div className="h-3.5 w-40 rounded-full bg-[#402818]/10" />
        <div className="mt-3 h-8 w-3/4 rounded bg-[#402818]/10" />
        <div className="mt-3 h-4 w-full rounded bg-[#402818]/8" />
        <div className="mt-1.5 h-4 w-5/6 rounded bg-[#402818]/8" />
      </div>
      <div className="animate-pulse rounded-2xl border border-[#402818]/10 bg-[#FAE8D7]/60 p-6">
        <div className="h-5 w-48 rounded bg-[#402818]/10" />
        <div className="mt-3 h-16 w-full rounded bg-[#402818]/8" />
      </div>
    </div>
  );
}

interface DatabaseErrorStateProps {
  errorCode: RepositoryErrorCode | null;
  errorMessage: string | null;
  onRetry: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

export function DatabaseErrorState({
  errorCode,
  errorMessage,
  onRetry,
  secondaryActionLabel,
  onSecondaryAction,
}: DatabaseErrorStateProps) {
  const isPermission = errorCode === 'permission_denied';
  const isOffline = errorCode === 'unavailable';
  const isInvalid = errorCode === 'invalid_record';

  const heading = isPermission
    ? 'Firestore access is currently restricted.'
    : isOffline
      ? 'Cloud Firestore is currently unreachable.'
      : isInvalid
        ? 'Database record failed integrity validation.'
        : 'Unable to load demonstration data.';

  const Icon = isPermission
    ? ShieldAlert
    : isOffline
      ? WifiOff
      : AlertCircle;

  return (
    <section
      data-testid="database-error-state"
      data-error-code={errorCode ?? 'unknown'}
      aria-live="polite"
      className="mt-4 rounded-2xl border border-[#402818]/14 bg-[#FAE8D7]/70 px-6 py-8 text-center"
    >
      <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#402818]/14 bg-[#FFF2E5] text-[#C65A1B]">
        <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
      </div>

      <h2 className="font-newsreader mt-3 text-[1.3125rem] font-semibold text-[#402818]">
        {heading}
      </h2>

      <p className="font-dm-sans mx-auto mt-2 max-w-lg text-[0.9rem] leading-relaxed text-[#705848]">
        {errorMessage ??
          'Unable to retrieve validated records from Cloud Firestore. No fallback data was substituted.'}
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          data-testid="database-retry-button"
          className="font-dm-sans inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#402818] px-5 py-2.5 text-[0.875rem] font-semibold text-white transition-colors duration-150 hover:bg-[#2F1B13] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
        >
          <RefreshCw size={15} strokeWidth={2.1} aria-hidden="true" />
          <span>Retry Connection</span>
        </button>

        {secondaryActionLabel && onSecondaryAction && (
          <button
            type="button"
            onClick={onSecondaryAction}
            className="font-dm-sans inline-flex cursor-pointer items-center rounded-full border border-[#402818]/18 bg-[#FFF9F3] px-5 py-2.5 text-[0.875rem] font-medium text-[#402818] transition-colors duration-150 hover:bg-[#F3DFCA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
          >
            {secondaryActionLabel}
          </button>
        )}
      </div>
    </section>
  );
}

interface DatabaseMissingCollectionStateProps {
  missingIds: readonly string[];
  onRetry: () => void;
}

export function DatabaseMissingCollectionState({
  missingIds,
  onRetry,
}: DatabaseMissingCollectionStateProps) {
  return (
    <section
      data-testid="database-missing-collection-state"
      aria-live="polite"
      className="mt-4 rounded-2xl border border-[#402818]/14 bg-[#FAE8D7]/65 px-6 py-8 text-center"
    >
      <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#402818]/14 bg-[#FFF2E5] text-[#C65A1B]">
        <Database size={20} strokeWidth={1.9} aria-hidden="true" />
      </div>

      <h2 className="font-newsreader mt-3 text-[1.3125rem] font-semibold text-[#402818]">
        Demonstration documents are not seeded yet.
      </h2>

      <p className="font-dm-sans mx-auto mt-2 max-w-lg text-[0.9rem] leading-relaxed text-[#705848]">
        Cloud Firestore returned no documents for the approved{' '}
        <code className="rounded bg-[#FFF9F3] px-1.5 py-0.5 text-[0.82rem] text-[#402818]">
          demoProblems
        </code>{' '}
        records ({missingIds.join(', ')}). Seed the three demonstration documents
        and retry.
      </p>

      <div className="mt-5">
        <button
          type="button"
          onClick={onRetry}
          data-testid="database-retry-button"
          className="font-dm-sans inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#402818] px-5 py-2.5 text-[0.875rem] font-semibold text-white transition-colors duration-150 hover:bg-[#2F1B13] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
        >
          <RefreshCw size={15} strokeWidth={2.1} aria-hidden="true" />
          <span>Retry Connection</span>
        </button>
      </div>
    </section>
  );
}

export function DevOfflineFixtureBanner() {
  return (
    <div
      data-testid="dev-offline-fixture-banner"
      role="status"
      className="mb-4 rounded-xl border border-[#C65A1B]/30 bg-[#FFF9F3] px-4 py-2.5 font-dm-sans text-[0.8125rem] font-medium text-[#9E4310]"
    >
      Development-only offline fixture mode active — displaying local fixtures,
      not live Cloud Firestore data.
    </div>
  );
}
