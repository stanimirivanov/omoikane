import { Effect } from 'effect';
import type { AuthenticatedRequestIdentity } from '@omoikane/application/authentication';
import type { AnalysisRun } from '@omoikane/domain/analysis';
import type { AnalysisRunError } from './analysis-run-error';
import {
  AnalysisRunRepositoryTag,
  type AnalysisRunRepository,
} from './analysis-run-repository';
import { decodeStartRequest } from './decode-analysis-run-request';

export interface StartAnalysisRunInput {
  readonly identity: AuthenticatedRequestIdentity;
  readonly workspaceId: unknown;
  readonly channelId: unknown;
  readonly traceContext: unknown;
}

/** Validates identity and channel scope before atomically starting one run. */
export const startAnalysisRun = (
  input: unknown
): Effect.Effect<AnalysisRun, AnalysisRunError, AnalysisRunRepository> =>
  Effect.gen(function* () {
    const command = yield* decodeStartRequest(input);
    const repository = yield* AnalysisRunRepositoryTag;
    return yield* repository.start(command);
  });
