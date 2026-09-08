import { Effect } from 'effect';
import type {
  AnalysisDecisionReview,
  AnalysisDecisionReviewAction,
} from '@omoikane/domain/analysis';
import {
  decodeAnalysisDecisionCandidateId,
  decodeAnalysisDecisionReviewAction,
  decodeAnalysisDecisionReviewReason,
  decodeAnalysisRunId,
  decodeScopedRequest,
  readInputProperty,
} from './decode-analysis-run-request';
import type { AnalysisDecisionReviewError } from './analysis-run-error';
import {
  AnalysisRunRepositoryTag,
  type AnalysisRunRepository,
} from './analysis-run-repository';

export interface ReviewAnalysisDecisionCandidateInput {
  readonly identity: unknown;
  readonly workspaceId: unknown;
  readonly analysisRunId: unknown;
  readonly candidateId: unknown;
  readonly action: unknown;
  readonly reason?: unknown;
}

/** Validates and appends one authorized human review without mutating model output. */
export const reviewAnalysisDecisionCandidate = (
  input: ReviewAnalysisDecisionCandidateInput
): Effect.Effect<
  AnalysisDecisionReview,
  AnalysisDecisionReviewError,
  AnalysisRunRepository
> =>
  Effect.gen(function* () {
    const scoped = yield* decodeScopedRequest(input);
    const analysisRunId = yield* decodeAnalysisRunId(
      readInputProperty(input, 'analysisRunId')
    );
    const candidateId = yield* decodeAnalysisDecisionCandidateId(
      readInputProperty(input, 'candidateId')
    );
    const action: AnalysisDecisionReviewAction =
      yield* decodeAnalysisDecisionReviewAction(
        readInputProperty(input, 'action')
      );
    const reason = yield* decodeAnalysisDecisionReviewReason(
      readInputProperty(input, 'reason')
    );
    const repository = yield* AnalysisRunRepositoryTag;
    return yield* repository.reviewDecisionCandidate({
      ...scoped,
      analysisRunId,
      candidateId,
      action,
      reason,
    });
  });
