import { Effect } from 'effect';
import type { AnalysisJobExecution } from './analysis-job';
import type { AnalysisJobExecutionRepositoryError } from './analysis-run-error';
import {
  AnalysisRunRepositoryTag,
  type AnalysisRunRepository,
} from './analysis-run-repository';
import type { DecisionExtractionInput } from './decision-extraction';

/**
 * Loads the frozen revision content under the current worker lease.
 * The repository reauthorizes access and validates bounded extraction input.
 * Model execution must separately pin its execution manifest before invocation.
 */
export const prepareAnalysisJobExtraction = (
  execution: AnalysisJobExecution
): Effect.Effect<
  DecisionExtractionInput,
  AnalysisJobExecutionRepositoryError,
  AnalysisRunRepository
> =>
  Effect.flatMap(AnalysisRunRepositoryTag, (repository) =>
    repository.loadJobExtractionInput({ execution })
  );
