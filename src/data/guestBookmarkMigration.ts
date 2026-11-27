import type {
  SavedOpportunitySourceScreen,
} from './firestoreContracts';
import {
  isApprovedDemoProblemId,
  isPlainObject,
  isValidFirestoreDocId,
  parseValidIsoTimestamp,
} from './firestoreValidation';

export const GUEST_BOOKMARKS_STORAGE_KEY = 'kopi_guest_saved_opportunities_v1';

export interface GuestDraftBookmark {
  readonly problemId: string;
  readonly savedAt: string;
  readonly sourceScreen: SavedOpportunitySourceScreen;
}

export interface GuestBookmarkFilterOptions {
  readonly allowPublishedIds?: boolean;
  readonly isApprovedId?: (id: string) => boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const VALID_SOURCE_SCREENS: ReadonlySet<string> = new Set([
  'opportunity-radar',
  'problem-explorer',
  'problem-investigation',
  'opportunity-evaluation',
  'guest-migration',
]);

function isPermittedGuestProblemId(
  problemId: string,
  options: GuestBookmarkFilterOptions = {}
): boolean {
  if (!isValidFirestoreDocId(problemId)) {
    return false;
  }
  if (isApprovedDemoProblemId(problemId)) {
    return true;
  }
  if (options.isApprovedId) {
    return options.isApprovedId(problemId);
  }
  return options.allowPublishedIds ?? true;
}

function getBrowserStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage !== undefined) {
    return storage;
  }
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function parseGuestDraftBookmarks(
  rawJson: string | null,
  options: GuestBookmarkFilterOptions = {}
): GuestDraftBookmark[] {
  if (!rawJson) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const seenIds = new Set<string>();
  const validated: GuestDraftBookmark[] = [];

  for (const item of parsed) {
    if (!isPlainObject(item)) continue;
    const rawId = typeof item.problemId === 'string' ? item.problemId.trim() : '';
    if (!rawId || !isPermittedGuestProblemId(rawId, options)) {
      continue;
    }
    if (seenIds.has(rawId)) continue;

    const savedAt = parseValidIsoTimestamp(item.savedAt) ?? new Date().toISOString();
    const sourceScreen =
      typeof item.sourceScreen === 'string' && VALID_SOURCE_SCREENS.has(item.sourceScreen)
        ? (item.sourceScreen as SavedOpportunitySourceScreen)
        : 'opportunity-radar';

    seenIds.add(rawId);
    validated.push({
      problemId: rawId,
      savedAt,
      sourceScreen,
    });
  }

  return validated;
}

export function loadGuestDraftBookmarks(
  storage?: StorageLike | null,
  options: GuestBookmarkFilterOptions = {}
): GuestDraftBookmark[] {
  const target = getBrowserStorage(storage);
  if (!target) return [];
  try {
    return parseGuestDraftBookmarks(target.getItem(GUEST_BOOKMARKS_STORAGE_KEY), options);
  } catch {
    return [];
  }
}

export function persistGuestDraftBookmarks(
  items: readonly GuestDraftBookmark[],
  storage?: StorageLike | null
): void {
  const target = getBrowserStorage(storage);
  if (!target) return;
  try {
    if (items.length === 0) {
      target.removeItem(GUEST_BOOKMARKS_STORAGE_KEY);
      return;
    }
    target.setItem(GUEST_BOOKMARKS_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore quota/storage errors cleanly; state remains in React memory.
  }
}

export function addOrKeepGuestDraftBookmark(
  current: readonly GuestDraftBookmark[],
  problemId: string,
  sourceScreen: SavedOpportunitySourceScreen,
  options: GuestBookmarkFilterOptions = {}
): GuestDraftBookmark[] {
  const trimmed = problemId.trim();
  if (!isPermittedGuestProblemId(trimmed, options)) {
    return [...current];
  }
  if (current.some((entry) => entry.problemId === trimmed)) {
    return [...current];
  }
  return [
    {
      problemId: trimmed,
      savedAt: new Date().toISOString(),
      sourceScreen,
    },
    ...current,
  ];
}

export function removeGuestDraftBookmark(
  current: readonly GuestDraftBookmark[],
  problemId: string
): GuestDraftBookmark[] {
  return current.filter((entry) => entry.problemId !== problemId.trim());
}

/**
 * Returns only guest bookmarks that are valid problem IDs and not
 * already stored in the signed-in user's Firestore savedOpportunities collection.
 */
export function computePendingGuestMigrations(
  guestDrafts: readonly GuestDraftBookmark[],
  existingAccountProblemIds: readonly string[],
  options: GuestBookmarkFilterOptions = {}
): GuestDraftBookmark[] {
  const existingSet = new Set(existingAccountProblemIds);
  return guestDrafts.filter(
    (entry) =>
      isPermittedGuestProblemId(entry.problemId, options) &&
      !existingSet.has(entry.problemId)
  );
}
