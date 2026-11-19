/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { WelcomeScreen } from './components/WelcomeScreen';
import {
  INITIAL_RADAR_SESSION_STATE,
  OpportunityRadarScreen,
  type RadarSessionState,
} from './components/OpportunityRadarScreen';
import { ProblemExplorerDirectory } from './components/ProblemExplorerDirectory';
import { ProblemInvestigationView } from './components/ProblemInvestigationView';
import { OpportunityEvaluationScreen } from './components/OpportunityEvaluationScreen';
import {
  buildOpportunityEvaluationRoute,
  buildProblemDetailRoute,
  normalizeRoute,
  parseOpportunityEvaluationId,
  parseProblemDetailId,
  type KopiRoute,
} from './config/routes';

export { normalizeRoute, type KopiRoute };

export default function App() {
  const [route, setRoute] = useState<KopiRoute>(() =>
    normalizeRoute(window.location.pathname)
  );
  const [radarSessionState, setRadarSessionState] = useState<RadarSessionState>(
    INITIAL_RADAR_SESSION_STATE
  );

  useEffect(() => {
    const handlePopState = () => {
      setRoute(normalizeRoute(window.location.pathname));
      window.scrollTo({ top: 0, behavior: 'auto' });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (nextRoute: KopiRoute) => {
    if (nextRoute !== route) {
      window.history.pushState({}, '', nextRoute);
      setRoute(nextRoute);
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  if (route === '/opportunity-radar') {
    return (
      <OpportunityRadarScreen
        onNavigateHome={() => navigate('/')}
        onNavigateToExplorer={() => navigate('/problem-explorer')}
        onInvestigateOpportunity={(problemId) =>
          navigate(buildProblemDetailRoute(problemId))
        }
        sessionState={radarSessionState}
        onSessionStateChange={setRadarSessionState}
      />
    );
  }

  if (route === '/problem-explorer') {
    return (
      <ProblemExplorerDirectory
        onNavigateHome={() => navigate('/')}
        onNavigateRadar={() => navigate('/opportunity-radar')}
        onSelectProblem={(problemId) =>
          navigate(buildProblemDetailRoute(problemId))
        }
      />
    );
  }

  const detailProblemId = parseProblemDetailId(route);
  if (detailProblemId !== null) {
    return (
      <ProblemInvestigationView
        problemId={detailProblemId}
        onNavigateHome={() => navigate('/')}
        onNavigateRadar={() => navigate('/opportunity-radar')}
        onBackToExplorer={() => navigate('/problem-explorer')}
        onEvaluateProblem={(problemId) =>
          navigate(buildOpportunityEvaluationRoute(problemId))
        }
      />
    );
  }

  const evaluationProblemId = parseOpportunityEvaluationId(route);
  if (evaluationProblemId !== null) {
    return (
      <OpportunityEvaluationScreen
        problemId={evaluationProblemId}
        onNavigateHome={() => navigate('/')}
        onNavigateRadar={() => navigate('/opportunity-radar')}
        onNavigateToExplorer={() => navigate('/problem-explorer')}
        onBackToInvestigation={(problemId) =>
          navigate(buildProblemDetailRoute(problemId))
        }
      />
    );
  }

  return (
    <WelcomeScreen onNavigateToRadar={() => navigate('/opportunity-radar')} />
  );
}
