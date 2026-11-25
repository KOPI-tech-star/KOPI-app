import type {
  OpportunityCardItem,
  OpportunityIllustrationKey,
} from '../../config/opportunityRadar';
import type { Problem } from '../../config/problemExplorer';

export type RepositoryErrorCode =
  | 'not_found'
  | 'permission_denied'
  | 'unavailable'
  | 'invalid_record'
  | 'invalid_id'
  | 'unknown';

export class RepositoryError extends Error {
  public readonly code: RepositoryErrorCode;
  public readonly userMessage: string;
  public readonly retryable: boolean;

  constructor(options: {
    code: RepositoryErrorCode;
    userMessage: string;
    retryable: boolean;
    causeMessage?: string;
  }) {
    super(options.causeMessage ?? options.userMessage);
    this.name = 'RepositoryError';
    this.code = options.code;
    this.userMessage = options.userMessage;
    this.retryable = options.retryable;
  }
}

export interface DemoProblemBundle {
  readonly problems: readonly Problem[];
  readonly opportunities: readonly OpportunityCardItem[];
  readonly illustrationByProblemId: Readonly<Record<string, OpportunityIllustrationKey>>;
  readonly missingIds: readonly string[];
  readonly retrievedAt: string;
  readonly source: 'firestore';
}

export interface SingleDemoProblemResult {
  readonly problem: Problem;
  readonly opportunity: OpportunityCardItem;
  readonly illustration: OpportunityIllustrationKey;
  readonly retrievedAt: string;
  readonly source: 'firestore';
}

export interface RepositoryReadOptions {
  readonly forceRefresh?: boolean;
}

export interface ProblemRepository {
  getApprovedDemoProblems(options?: RepositoryReadOptions): Promise<DemoProblemBundle>;
  getProblemById(
    problemId: string,
    options?: RepositoryReadOptions
  ): Promise<SingleDemoProblemResult | null>;
  clearCache(): void;
}
