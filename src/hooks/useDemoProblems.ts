import { useCallback, useEffect, useState } from 'react';
import {
  DEMO_OPPORTUNITIES,
  type OpportunityCardItem,
  type OpportunityIllustrationKey,
} from '../config/opportunityRadar';
import { PROBLEM_RECORDS, type Problem } from '../config/problemExplorer';
import { getProblemRepository } from '../data/repositories/firestoreProblemRepository';
import {
  RepositoryError,
  type CombinedProblemFeedBundle,
  type ProblemRepository,
  type PublishedFeedStatus,
  type RepositoryErrorCode,
  type SingleDemoProblemResult,
} from '../data/repositories/problemRepository';

export type DemoCollectionLoadStatus = 'loading' | 'success' | 'empty' | 'error';
export type DemoProblemLoadStatus = 'loading' | 'success' | 'not_found' | 'error';

export interface DemoProblemsHookState {
  readonly status: DemoCollectionLoadStatus;
  readonly problems: readonly Problem[];
  readonly publishedProblems: readonly Problem[];
  readonly demoProblems: readonly Problem[];
  readonly opportunities: readonly OpportunityCardItem[];
  readonly illustrationByProblemId: Readonly<Record<string, OpportunityIllustrationKey>>;
  readonly missingIds: readonly string[];
  readonly publishedCount: number;
  readonly demoCount: number;
  readonly publishedStatus: PublishedFeedStatus;
  readonly errorCode: RepositoryErrorCode | null;
  readonly errorMessage: string | null;
  readonly isDevOfflineFixture: boolean;
  readonly retry: () => void;
}

export interface DemoProblemHookState {
  readonly status: DemoProblemLoadStatus;
  readonly problem: Problem | null;
  readonly illustration: OpportunityIllustrationKey | null;
  readonly errorCode: RepositoryErrorCode | null;
  readonly errorMessage: string | null;
  readonly isDevOfflineFixture: boolean;
  readonly retry: () => void;
}

function isDevOfflineFixtureRequested(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return false;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('offlineFixture') === 'demo';
  } catch {
    return false;
  }
}

function buildDevOfflineBundle(): CombinedProblemFeedBundle {
  const illustrationByProblemId: Record<string, OpportunityIllustrationKey> = {};
  for (const opp of DEMO_OPPORTUNITIES) {
    illustrationByProblemId[opp.id] = opp.illustration;
  }
  return {
    problems: PROBLEM_RECORDS,
    publishedProblems: [],
    demoProblems: PROBLEM_RECORDS,
    opportunities: DEMO_OPPORTUNITIES,
    illustrationByProblemId,
    missingIds: [],
    publishedCount: 0,
    demoCount: PROBLEM_RECORDS.length,
    publishedStatus: 'empty',
    retrievedAt: new Date().toISOString(),
    source: 'firestore',
  };
}

export function useDemoProblems(
  repository: ProblemRepository = getProblemRepository()
): DemoProblemsHookState {
  const devFixture = isDevOfflineFixtureRequested();
  const [reloadNonce, setReloadNonce] = useState(0);
  const [state, setState] = useState<Omit<DemoProblemsHookState, 'retry'>>(() => {
    if (devFixture) {
      const bundle = buildDevOfflineBundle();
      return {
        status: 'success',
        problems: bundle.problems,
        publishedProblems: bundle.publishedProblems,
        demoProblems: bundle.demoProblems,
        opportunities: bundle.opportunities,
        illustrationByProblemId: bundle.illustrationByProblemId,
        missingIds: [],
        publishedCount: 0,
        demoCount: bundle.demoCount,
        publishedStatus: 'empty',
        errorCode: null,
        errorMessage: null,
        isDevOfflineFixture: true,
      };
    }

    return {
      status: 'loading',
      problems: [],
      publishedProblems: [],
      demoProblems: [],
      opportunities: [],
      illustrationByProblemId: {},
      missingIds: [],
      publishedCount: 0,
      demoCount: 0,
      publishedStatus: 'empty',
      errorCode: null,
      errorMessage: null,
      isDevOfflineFixture: false,
    };
  });

  useEffect(() => {
    if (devFixture) {
      return;
    }

    let cancelled = false;
    setState((prev) => ({
      ...prev,
      status: 'loading',
      errorCode: null,
      errorMessage: null,
    }));

    const loadFeed = repository.getCombinedProblemFeed
      ? repository.getCombinedProblemFeed({ forceRefresh: reloadNonce > 0 })
      : repository
          .getApprovedDemoProblems({ forceRefresh: reloadNonce > 0 })
          .then(
            (demoBundle): CombinedProblemFeedBundle => ({
              problems: demoBundle.problems,
              publishedProblems: [],
              demoProblems: demoBundle.problems,
              opportunities: demoBundle.opportunities,
              illustrationByProblemId: demoBundle.illustrationByProblemId,
              missingIds: demoBundle.missingIds,
              publishedCount: 0,
              demoCount: demoBundle.problems.length,
              publishedStatus: 'empty',
              retrievedAt: demoBundle.retrievedAt,
              source: 'firestore',
            })
          );

    loadFeed
      .then((bundle) => {
        if (cancelled) return;
        setState({
          status: bundle.problems.length > 0 ? 'success' : 'empty',
          problems: bundle.problems,
          publishedProblems: bundle.publishedProblems,
          demoProblems: bundle.demoProblems,
          opportunities: bundle.opportunities,
          illustrationByProblemId: bundle.illustrationByProblemId,
          missingIds: bundle.missingIds,
          publishedCount: bundle.publishedCount,
          demoCount: bundle.demoCount,
          publishedStatus: bundle.publishedStatus,
          errorCode: null,
          errorMessage: null,
          isDevOfflineFixture: false,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        const repoErr =
          err instanceof RepositoryError
            ? err
            : new RepositoryError({
                code: 'unknown',
                userMessage:
                  'Unable to load problems from Firestore right now.',
                retryable: true,
              });
        setState({
          status: 'error',
          problems: [],
          publishedProblems: [],
          demoProblems: [],
          opportunities: [],
          illustrationByProblemId: {},
          missingIds: [],
          publishedCount: 0,
          demoCount: 0,
          publishedStatus: 'empty',
          errorCode: repoErr.code,
          errorMessage: repoErr.userMessage,
          isDevOfflineFixture: false,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [repository, reloadNonce, devFixture]);

  const retry = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  return {
    ...state,
    retry,
  };
}

export function useDemoProblem(
  problemId: string,
  repository: ProblemRepository = getProblemRepository()
): DemoProblemHookState {
  const devFixture = isDevOfflineFixtureRequested();
  const [reloadNonce, setReloadNonce] = useState(0);
  const [state, setState] = useState<Omit<DemoProblemHookState, 'retry'>>(() => {
    if (devFixture) {
      const matched = PROBLEM_RECORDS.find((p) => p.id === problemId.trim()) ?? null;
      const opp = DEMO_OPPORTUNITIES.find((o) => o.id === problemId.trim()) ?? null;
      return matched && opp
        ? {
            status: 'success',
            problem: matched,
            illustration: opp.illustration,
            errorCode: null,
            errorMessage: null,
            isDevOfflineFixture: true,
          }
        : {
            status: 'not_found',
            problem: null,
            illustration: null,
            errorCode: 'not_found',
            errorMessage: null,
            isDevOfflineFixture: true,
          };
    }

    return {
      status: 'loading',
      problem: null,
      illustration: null,
      errorCode: null,
      errorMessage: null,
      isDevOfflineFixture: false,
    };
  });

  useEffect(() => {
    if (devFixture) {
      const matched = PROBLEM_RECORDS.find((p) => p.id === problemId.trim()) ?? null;
      const opp = DEMO_OPPORTUNITIES.find((o) => o.id === problemId.trim()) ?? null;
      setState(
        matched && opp
          ? {
              status: 'success',
              problem: matched,
              illustration: opp.illustration,
              errorCode: null,
              errorMessage: null,
              isDevOfflineFixture: true,
            }
          : {
              status: 'not_found',
              problem: null,
              illustration: null,
              errorCode: 'not_found',
              errorMessage: null,
              isDevOfflineFixture: true,
            }
      );
      return;
    }

    let cancelled = false;
    setState({
      status: 'loading',
      problem: null,
      illustration: null,
      errorCode: null,
      errorMessage: null,
      isDevOfflineFixture: false,
    });

    repository
      .getProblemById(problemId, { forceRefresh: reloadNonce > 0 })
      .then((result: SingleDemoProblemResult | null) => {
        if (cancelled) return;
        if (!result) {
          setState({
            status: 'not_found',
            problem: null,
            illustration: null,
            errorCode: 'not_found',
            errorMessage: null,
            isDevOfflineFixture: false,
          });
          return;
        }
        setState({
          status: 'success',
          problem: result.problem,
          illustration: result.illustration,
          errorCode: null,
          errorMessage: null,
          isDevOfflineFixture: false,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        const repoErr =
          err instanceof RepositoryError
            ? err
            : new RepositoryError({
                code: 'unknown',
                userMessage:
                  'Unable to retrieve this problem record from Firestore right now.',
                retryable: true,
              });
        setState({
          status: 'error',
          problem: null,
          illustration: null,
          errorCode: repoErr.code,
          errorMessage: repoErr.userMessage,
          isDevOfflineFixture: false,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [problemId, repository, reloadNonce, devFixture]);

  const retry = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  return {
    ...state,
    retry,
  };
}
