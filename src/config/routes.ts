export type KopiRoute =
  | '/'
  | '/opportunity-radar'
  | '/problem-explorer'
  | `/problem-explorer/${string}`
  | '/opportunity-evaluation'
  | `/opportunity-evaluation/${string}`;

const EXPLORER_PREFIX = '/problem-explorer/';
const EVALUATION_ROUTE = '/opportunity-evaluation';
const EVALUATION_PREFIX = '/opportunity-evaluation/';

export function buildProblemDetailRoute(
  problemId: string
): `/problem-explorer/${string}` {
  return `/problem-explorer/${encodeURIComponent(problemId)}`;
}

export function buildOpportunityEvaluationRoute(
  problemId: string
): `/opportunity-evaluation/${string}` {
  return `/opportunity-evaluation/${encodeURIComponent(problemId)}`;
}

/**
 * Safely extracts and decodes the :problemId segment from a /problem-explorer/:problemId
 * route. Returns null when the path is not a detail route, and returns '' (empty)
 * if the segment is malformed or contains nested slashes so callers render NotFound cleanly.
 */
export function parseProblemDetailId(pathname: string): string | null {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (!clean.startsWith(EXPLORER_PREFIX)) return null;

  const rawSegment = clean.slice(EXPLORER_PREFIX.length);
  if (!rawSegment || rawSegment.includes('/')) {
    return '';
  }

  try {
    return decodeURIComponent(rawSegment);
  } catch {
    return '';
  }
}

/**
 * Safely extracts and decodes the :problemId segment from a /opportunity-evaluation/:problemId
 * route. Returns null when the path is not an evaluation route, and returns '' (empty)
 * for /opportunity-evaluation, nested paths, or malformed percent-encoding.
 */
export function parseOpportunityEvaluationId(pathname: string): string | null {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (clean === EVALUATION_ROUTE) return '';
  if (!clean.startsWith(EVALUATION_PREFIX)) return null;

  const rawSegment = clean.slice(EVALUATION_PREFIX.length);
  if (!rawSegment || rawSegment.includes('/')) {
    return '';
  }

  try {
    return decodeURIComponent(rawSegment);
  } catch {
    return '';
  }
}

export function normalizeRoute(pathname: string): KopiRoute {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  if (
    clean === '/opportunity-radar' ||
    clean === '/explore' ||
    clean === '/radar'
  ) {
    return '/opportunity-radar';
  }

  if (clean === '/problem-explorer') {
    return '/problem-explorer';
  }

  if (clean.startsWith(EXPLORER_PREFIX)) {
    const rawSegment = clean.slice(EXPLORER_PREFIX.length);
    return `/problem-explorer/${rawSegment}`;
  }

  if (clean === EVALUATION_ROUTE) {
    return '/opportunity-evaluation';
  }

  if (clean.startsWith(EVALUATION_PREFIX)) {
    const rawSegment = clean.slice(EVALUATION_PREFIX.length);
    return `/opportunity-evaluation/${rawSegment}`;
  }

  return '/';
}
