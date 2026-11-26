import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  SavedOpportunityDocument,
  SavedOpportunitySourceScreen,
  UserProfileDocument,
} from '../data/firestoreContracts';
import {
  addOrKeepGuestDraftBookmark,
  computePendingGuestMigrations,
  loadGuestDraftBookmarks,
  persistGuestDraftBookmarks,
  removeGuestDraftBookmark,
  type GuestDraftBookmark,
} from '../data/guestBookmarkMigration';
import { RepositoryError } from '../data/repositories/problemRepository';
import {
  getUserAccountRepository,
  type UserAccountRepository,
} from '../data/repositories/userAccountRepository';
import {
  getAuthClientService,
  mapFirebaseAuthError,
  type AuthClientService,
  type AuthUserSummary,
} from '../lib/firebaseAuth';
import { LegalDisclosureModal } from '../components/LegalDisclosureModal';
import { AuthOnboardingModal } from '../components/AuthOnboardingModal';
import type { LegalDraftDocument } from '../config/legalDisclosures';
import { DRAFT_PRIVACY_POLICY, DRAFT_TERMS_OF_SERVICE } from '../config/legalDisclosures';

export interface PendingBookmarkIntent {
  readonly problemId: string;
  readonly problemTitle: string;
  readonly sourceScreen: SavedOpportunitySourceScreen;
}

export interface AuthModalContextState {
  readonly open: boolean;
  readonly reason: 'bookmark' | 'saved_route' | 'account_button' | 'onboarding_required';
  readonly pendingBookmark: PendingBookmarkIntent | null;
  readonly returnRoute: string | null;
}

export interface AuthAndSavedContextValue {
  readonly authStatus: 'initializing' | 'signed_out' | 'signed_in';
  readonly authUser: AuthUserSummary | null;
  readonly profileStatus: 'idle' | 'loading' | 'needs_onboarding' | 'ready' | 'error';
  readonly userProfile: UserProfileDocument | null;
  readonly profileError: string | null;

  readonly savedStatus: 'idle' | 'loading' | 'ready' | 'error';
  readonly savedItems: readonly SavedOpportunityDocument[];
  readonly savedProblemIds: readonly string[];
  readonly savedCount: number;
  readonly savedError: string | null;
  readonly savingProblemIds: readonly string[];

  readonly guestBookmarks: readonly GuestDraftBookmark[];
  readonly pendingMigrations: readonly GuestDraftBookmark[];
  readonly migrationStatus: 'idle' | 'migrating' | 'success' | 'error';
  readonly migrationMessage: string | null;

  readonly authBusy: boolean;
  readonly authError: string | null;

  isProblemSaved(problemId: string): boolean;
  toggleBookmark(input: {
    problemId: string;
    problemTitle: string;
    sourceScreen: SavedOpportunitySourceScreen;
  }): Promise<void>;
  removeSaved(problemId: string): Promise<void>;
  removeGuestDraft(problemId: string): void;
  retrySync(): Promise<void>;
  retryGuestMigration(): Promise<void>;

  openSignInModal(options?: {
    reason?: AuthModalContextState['reason'];
    pendingBookmark?: PendingBookmarkIntent | null;
    returnRoute?: string | null;
  }): void;
  closeSignInModal(): void;
  openLegalDraft(kind: 'terms' | 'privacy'): void;
  submitConsentAndSignIn(input: {
    confirmedEighteenOrOlder: boolean;
    acceptedTermsAndPrivacy: boolean;
  }): Promise<void>;
  submitOnboardingForCurrentUser(input: {
    confirmedEighteenOrOlder: boolean;
    acceptedTermsAndPrivacy: boolean;
  }): Promise<void>;
  signOut(): Promise<void>;
}

const AuthAndSavedContext = createContext<AuthAndSavedContextValue | null>(null);

interface AuthAndSavedProviderProps {
  children: ReactNode;
  authService?: AuthClientService;
  userRepository?: UserAccountRepository;
  onNavigateAfterAuth?: (route: string) => void;
}

export function AuthAndSavedProvider({
  children,
  authService = getAuthClientService(),
  userRepository = getUserAccountRepository(),
  onNavigateAfterAuth,
}: AuthAndSavedProviderProps) {
  const [authStatus, setAuthStatus] = useState<'initializing' | 'signed_out' | 'signed_in'>(
    'initializing'
  );
  const [authUser, setAuthUser] = useState<AuthUserSummary | null>(null);

  const [profileStatus, setProfileStatus] = useState<
    'idle' | 'loading' | 'needs_onboarding' | 'ready' | 'error'
  >('idle');
  const [userProfile, setUserProfile] = useState<UserProfileDocument | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [savedStatus, setSavedStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle'
  );
  const [savedItems, setSavedItems] = useState<readonly SavedOpportunityDocument[]>([]);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [savingProblemIds, setSavingProblemIds] = useState<string[]>([]);

  const [guestBookmarks, setGuestBookmarks] = useState<GuestDraftBookmark[]>(() =>
    loadGuestDraftBookmarks()
  );
  const [migrationStatus, setMigrationStatus] = useState<
    'idle' | 'migrating' | 'success' | 'error'
  >('idle');
  const [migrationMessage, setMigrationMessage] = useState<string | null>(null);

  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [modalState, setModalState] = useState<AuthModalContextState>({
    open: false,
    reason: 'account_button',
    pendingBookmark: null,
    returnRoute: null,
  });

  const [activeLegalDoc, setActiveLegalDoc] = useState<LegalDraftDocument | null>(null);

  // Holds validated consent choices during active Google popup sign-in so newly
  // created accounts immediately persist eligibility & consent records in Firestore.
  const pendingConsentRef = useRef<{
    confirmedEighteenOrOlder: boolean;
    acceptedTermsAndPrivacy: boolean;
  } | null>(null);

  const pendingBookmarkRef = useRef<PendingBookmarkIntent | null>(null);
  const returnRouteRef = useRef<string | null>(null);
  const activeUidRef = useRef<string | null>(null);

  const migrateGuestBookmarksForUser = useCallback(
    async (
      uid: string,
      currentSaved: readonly SavedOpportunityDocument[],
      currentGuests: readonly GuestDraftBookmark[]
    ): Promise<{
      updatedSaved: readonly SavedOpportunityDocument[];
      remainingGuests: GuestDraftBookmark[];
    }> => {
      const toMigrate = computePendingGuestMigrations(
        currentGuests,
        currentSaved.map((s) => s.problemId)
      );

      if (toMigrate.length === 0) {
        return { updatedSaved: currentSaved, remainingGuests: [...currentGuests] };
      }

      setMigrationStatus('migrating');
      setMigrationMessage(null);

      let nextSaved = [...currentSaved];
      let nextGuests = [...currentGuests];
      let migratedCount = 0;

      for (const draft of toMigrate) {
        try {
          const result = await userRepository.saveOpportunity(
            uid,
            draft.problemId,
            draft.sourceScreen === 'guest-migration' ? 'guest-migration' : draft.sourceScreen
          );
          if (!nextSaved.some((s) => s.problemId === result.item.problemId)) {
            nextSaved = [result.item, ...nextSaved];
          }
          nextGuests = removeGuestDraftBookmark(nextGuests, draft.problemId);
          migratedCount += 1;
        } catch (err) {
          const msg =
            err instanceof RepositoryError
              ? err.userMessage
              : 'Unable to migrate all browser bookmarks into your account right now.';
          setGuestBookmarks(nextGuests);
          persistGuestDraftBookmarks(nextGuests);
          setMigrationStatus('error');
          setMigrationMessage(msg);
          return { updatedSaved: nextSaved, remainingGuests: nextGuests };
        }
      }

      setGuestBookmarks(nextGuests);
      persistGuestDraftBookmarks(nextGuests);
      setMigrationStatus('success');
      setMigrationMessage(
        migratedCount === 1
          ? 'Saved 1 pre-login bookmark to your account.'
          : `Saved ${migratedCount} pre-login bookmarks to your account.`
      );
      return { updatedSaved: nextSaved, remainingGuests: nextGuests };
    },
    [userRepository]
  );

  const syncAccountDataForUser = useCallback(
    async (user: AuthUserSummary) => {
      if (activeUidRef.current && activeUidRef.current !== user.uid) {
        setUserProfile(null);
        setSavedItems([]);
        setSavedStatus('idle');
        setMigrationStatus('idle');
        setMigrationMessage(null);
      }
      activeUidRef.current = user.uid;

      setProfileStatus('loading');
      setProfileError(null);
      setSavedError(null);

      try {
        let profile = await userRepository.getUserProfile(user.uid);

        if (!profile && pendingConsentRef.current) {
          const pendingConsent = pendingConsentRef.current;
          profile = await userRepository.upsertUserProfileOnConsent({
            uid: user.uid,
            displayName: user.displayName,
            confirmedEighteenOrOlder: pendingConsent.confirmedEighteenOrOlder,
            acceptedTermsAndPrivacy: pendingConsent.acceptedTermsAndPrivacy,
          });
          pendingConsentRef.current = null;
        }

        if (!profile) {
          setUserProfile(null);
          setProfileStatus('needs_onboarding');
          setSavedStatus('idle');
          setSavedItems([]);
          setModalState((prev) => ({
            open: true,
            reason: 'onboarding_required',
            pendingBookmark: pendingBookmarkRef.current ?? prev.pendingBookmark,
            returnRoute: returnRouteRef.current ?? prev.returnRoute,
          }));
          return;
        }

        setUserProfile(profile);
        setProfileStatus('ready');

        setSavedStatus('loading');
        let loadedSaved = await userRepository.listSavedOpportunities(user.uid);

        const activeBookmark = pendingBookmarkRef.current;
        if (activeBookmark) {
          const savedResult = await userRepository.saveOpportunity(
            user.uid,
            activeBookmark.problemId,
            activeBookmark.sourceScreen
          );
          if (!loadedSaved.some((i) => i.problemId === savedResult.item.problemId)) {
            loadedSaved = [savedResult.item, ...loadedSaved];
          }
          setGuestBookmarks((prev) => {
            const cleaned = removeGuestDraftBookmark(prev, activeBookmark.problemId);
            persistGuestDraftBookmarks(cleaned);
            return cleaned;
          });
          pendingBookmarkRef.current = null;
        }

        const latestGuests = loadGuestDraftBookmarks();
        if (latestGuests.length > 0) {
          const migrated = await migrateGuestBookmarksForUser(
            user.uid,
            loadedSaved,
            latestGuests
          );
          loadedSaved = migrated.updatedSaved;
        }

        setSavedItems(loadedSaved);
        setSavedStatus('ready');
        setModalState((prev) => ({ ...prev, open: false, pendingBookmark: null }));

        if (returnRouteRef.current && onNavigateAfterAuth) {
          const targetRoute = returnRouteRef.current;
          returnRouteRef.current = null;
          onNavigateAfterAuth(targetRoute);
        }
      } catch (err) {
        const message =
          err instanceof RepositoryError
            ? err.userMessage
            : 'Unable to load your Kopi account from Cloud Firestore.';
        setProfileStatus('error');
        setProfileError(message);
        setSavedStatus('error');
        setSavedError(message);
      }
    },
    [migrateGuestBookmarksForUser, onNavigateAfterAuth, userRepository]
  );

  useEffect(() => {
    const unsubscribe = authService.subscribeAuthState((user) => {
      if (!user) {
        setAuthStatus('signed_out');
        setAuthUser(null);
        setProfileStatus('idle');
        setUserProfile(null);
        setProfileError(null);
        setSavedStatus('idle');
        setSavedItems([]);
        setSavedError(null);
        return;
      }

      setAuthStatus('signed_in');
      setAuthUser(user);
      void syncAccountDataForUser(user);
    });

    return () => unsubscribe();
  }, [authService, syncAccountDataForUser]);

  const savedProblemIds = useMemo<readonly string[]>(() => {
    if (authStatus === 'signed_in' && profileStatus === 'ready') {
      return savedItems.map((item) => item.problemId);
    }
    return guestBookmarks.map((item) => item.problemId);
  }, [authStatus, guestBookmarks, profileStatus, savedItems]);

  const isProblemSaved = useCallback(
    (problemId: string) => savedProblemIds.includes(problemId),
    [savedProblemIds]
  );

  const openSignInModal = useCallback(
    (options?: {
      reason?: AuthModalContextState['reason'];
      pendingBookmark?: PendingBookmarkIntent | null;
      returnRoute?: string | null;
    }) => {
      setAuthError(null);
      if (options?.pendingBookmark) {
        pendingBookmarkRef.current = options.pendingBookmark;
      }
      if (options?.returnRoute) {
        returnRouteRef.current = options.returnRoute;
      }
      setModalState({
        open: true,
        reason: options?.reason ?? 'account_button',
        pendingBookmark: options?.pendingBookmark ?? null,
        returnRoute: options?.returnRoute ?? null,
      });
    },
    []
  );

  const closeSignInModal = useCallback(() => {
    setAuthError(null);
    pendingBookmarkRef.current = null;
    returnRouteRef.current = null;
    setModalState((prev) => ({
      ...prev,
      open: false,
      pendingBookmark: null,
      returnRoute: null,
    }));
  }, []);

  const openLegalDraft = useCallback((kind: 'terms' | 'privacy') => {
    setActiveLegalDoc(
      kind === 'terms' ? DRAFT_TERMS_OF_SERVICE : DRAFT_PRIVACY_POLICY
    );
  }, []);

  const submitConsentAndSignIn = useCallback(
    async ({
      confirmedEighteenOrOlder,
      acceptedTermsAndPrivacy,
    }: {
      confirmedEighteenOrOlder: boolean;
      acceptedTermsAndPrivacy: boolean;
    }) => {
      if (!confirmedEighteenOrOlder) {
        setAuthError('Please confirm that you are at least 18 years old before continuing.');
        return;
      }
      if (!acceptedTermsAndPrivacy) {
        setAuthError(
          'Please accept the pre-launch Draft Terms of Service and Draft Privacy Policy before continuing.'
        );
        return;
      }

      setAuthBusy(true);
      setAuthError(null);
      pendingConsentRef.current = {
        confirmedEighteenOrOlder,
        acceptedTermsAndPrivacy,
      };

      try {
        await authService.signInWithGoogle();
      } catch (err) {
        pendingConsentRef.current = null;
        const mapped = mapFirebaseAuthError(err);
        setAuthError(mapped.userMessage);
      } finally {
        setAuthBusy(false);
      }
    },
    [authService]
  );

  const submitOnboardingForCurrentUser = useCallback(
    async ({
      confirmedEighteenOrOlder,
      acceptedTermsAndPrivacy,
    }: {
      confirmedEighteenOrOlder: boolean;
      acceptedTermsAndPrivacy: boolean;
    }) => {
      if (!authUser) {
        await submitConsentAndSignIn({
          confirmedEighteenOrOlder,
          acceptedTermsAndPrivacy,
        });
        return;
      }

      if (!confirmedEighteenOrOlder) {
        setAuthError('Please confirm that you are at least 18 years old before continuing.');
        return;
      }
      if (!acceptedTermsAndPrivacy) {
        setAuthError(
          'Please accept the pre-launch Draft Terms of Service and Draft Privacy Policy before continuing.'
        );
        return;
      }

      setAuthBusy(true);
      setAuthError(null);
      pendingConsentRef.current = {
        confirmedEighteenOrOlder,
        acceptedTermsAndPrivacy,
      };

      try {
        await syncAccountDataForUser(authUser);
      } finally {
        setAuthBusy(false);
      }
    },
    [authUser, submitConsentAndSignIn, syncAccountDataForUser]
  );

  const toggleBookmark = useCallback(
    async ({
      problemId,
      problemTitle,
      sourceScreen,
    }: {
      problemId: string;
      problemTitle: string;
      sourceScreen: SavedOpportunitySourceScreen;
    }) => {
      if (authStatus !== 'signed_in' || !authUser) {
        const alreadyGuestSaved = guestBookmarks.some((g) => g.problemId === problemId);
        if (alreadyGuestSaved) {
          const updated = removeGuestDraftBookmark(guestBookmarks, problemId);
          setGuestBookmarks(updated);
          persistGuestDraftBookmarks(updated);
          return;
        }

        const updated = addOrKeepGuestDraftBookmark(
          guestBookmarks,
          problemId,
          sourceScreen
        );
        setGuestBookmarks(updated);
        persistGuestDraftBookmarks(updated);

        openSignInModal({
          reason: 'bookmark',
          pendingBookmark: { problemId, problemTitle, sourceScreen },
        });
        return;
      }

      if (profileStatus !== 'ready') {
        openSignInModal({
          reason: 'onboarding_required',
          pendingBookmark: { problemId, problemTitle, sourceScreen },
        });
        return;
      }

      const currentlySaved = savedItems.some((item) => item.problemId === problemId);
      setSavingProblemIds((prev) =>
        prev.includes(problemId) ? prev : [...prev, problemId]
      );
      setSavedError(null);

      try {
        if (currentlySaved) {
          await userRepository.removeSavedOpportunity(authUser.uid, problemId);
          setSavedItems((prev) => prev.filter((item) => item.problemId !== problemId));
        } else {
          const result = await userRepository.saveOpportunity(
            authUser.uid,
            problemId,
            sourceScreen
          );
          setSavedItems((prev) =>
            prev.some((i) => i.problemId === result.item.problemId)
              ? prev
              : [result.item, ...prev]
          );
        }
      } catch (err) {
        const msg =
          err instanceof RepositoryError
            ? err.userMessage
            : 'Unable to update your saved bookmark in Cloud Firestore.';
        setSavedError(msg);
      } finally {
        setSavingProblemIds((prev) => prev.filter((id) => id !== problemId));
      }
    },
    [
      authStatus,
      authUser,
      guestBookmarks,
      openSignInModal,
      profileStatus,
      savedItems,
      userRepository,
    ]
  );

  const removeSaved = useCallback(
    async (problemId: string) => {
      if (!authUser || profileStatus !== 'ready') {
        const updated = removeGuestDraftBookmark(guestBookmarks, problemId);
        setGuestBookmarks(updated);
        persistGuestDraftBookmarks(updated);
        return;
      }

      setSavingProblemIds((prev) =>
        prev.includes(problemId) ? prev : [...prev, problemId]
      );
      setSavedError(null);
      try {
        await userRepository.removeSavedOpportunity(authUser.uid, problemId);
        setSavedItems((prev) => prev.filter((item) => item.problemId !== problemId));
      } catch (err) {
        const msg =
          err instanceof RepositoryError
            ? err.userMessage
            : 'Unable to remove this saved opportunity from Cloud Firestore.';
        setSavedError(msg);
      } finally {
        setSavingProblemIds((prev) => prev.filter((id) => id !== problemId));
      }
    },
    [authUser, guestBookmarks, profileStatus, userRepository]
  );

  const removeGuestDraft = useCallback((problemId: string) => {
    setGuestBookmarks((prev) => {
      const updated = removeGuestDraftBookmark(prev, problemId);
      persistGuestDraftBookmarks(updated);
      return updated;
    });
  }, []);

  const retrySync = useCallback(async () => {
    if (!authUser) return;
    await syncAccountDataForUser(authUser);
  }, [authUser, syncAccountDataForUser]);

  const retryGuestMigration = useCallback(async () => {
    if (!authUser || profileStatus !== 'ready') return;
    const migrated = await migrateGuestBookmarksForUser(
      authUser.uid,
      savedItems,
      guestBookmarks
    );
    setSavedItems(migrated.updatedSaved);
  }, [authUser, guestBookmarks, migrateGuestBookmarksForUser, profileStatus, savedItems]);

  const signOut = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    pendingConsentRef.current = null;
    pendingBookmarkRef.current = null;
    returnRouteRef.current = null;
    setMigrationStatus('idle');
    setMigrationMessage(null);
    try {
      await authService.signOut();
    } catch {
      setAuthError('Unable to sign out right now. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  }, [authService]);

  const pendingMigrations = useMemo(
    () =>
      computePendingGuestMigrations(
        guestBookmarks,
        savedItems.map((i) => i.problemId)
      ),
    [guestBookmarks, savedItems]
  );

  const value: AuthAndSavedContextValue = {
    authStatus,
    authUser,
    profileStatus,
    userProfile,
    profileError,
    savedStatus,
    savedItems,
    savedProblemIds,
    savedCount: savedProblemIds.length,
    savedError,
    savingProblemIds,
    guestBookmarks,
    pendingMigrations,
    migrationStatus,
    migrationMessage,
    authBusy,
    authError,
    isProblemSaved,
    toggleBookmark,
    removeSaved,
    removeGuestDraft,
    retrySync,
    retryGuestMigration,
    openSignInModal,
    closeSignInModal,
    openLegalDraft,
    submitConsentAndSignIn,
    submitOnboardingForCurrentUser,
    signOut,
  };

  return (
    <AuthAndSavedContext.Provider value={value}>
      {children}

      <AuthOnboardingModal
        open={modalState.open}
        reason={modalState.reason}
        pendingBookmark={modalState.pendingBookmark}
        isAlreadySignedIn={authStatus === 'signed_in' && profileStatus === 'needs_onboarding'}
        busy={authBusy}
        errorMessage={authError}
        onClose={closeSignInModal}
        onOpenLegalDraft={openLegalDraft}
        onSubmitGoogleSignIn={submitConsentAndSignIn}
        onSubmitExistingUserOnboarding={submitOnboardingForCurrentUser}
      />

      <LegalDisclosureModal
        document={activeLegalDoc}
        onClose={() => setActiveLegalDoc(null)}
      />
    </AuthAndSavedContext.Provider>
  );
}

export function useAuthAndSaved(): AuthAndSavedContextValue {
  const ctx = useContext(AuthAndSavedContext);
  if (!ctx) {
    throw new Error('useAuthAndSaved must be used inside AuthAndSavedProvider.');
  }
  return ctx;
}
