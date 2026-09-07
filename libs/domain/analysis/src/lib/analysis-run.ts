import { Schema } from 'effect';
import { ChannelIdSchema } from '@omoikane/domain/channel';
import { ProfileIdSchema } from '@omoikane/domain/profile';
import { WorkspaceIdSchema } from '@omoikane/domain/workspace';
import { AnalysisResultSchema } from './analysis-result';
import { AnalysisRunIdSchema } from './analysis-run-id';

export const AnalysisRunStatusSchema = Schema.Literal(
  'created',
  'queued',
  'running',
  'succeeded',
  'failed'
);

export const AnalysisRunFailureCategorySchema = Schema.String.pipe(
  Schema.pattern(/^[a-z0-9._-]{1,64}$/u)
);

/**
 * Immutable acceptance identity enriched with its latest lifecycle fact.
 *
 * `channelId` is nullable only for runs accepted before channel-scoped
 * analysis was introduced. Every new start command requires a channel.
 */
export const AnalysisRunSchema = Schema.Struct({
  id: AnalysisRunIdSchema,
  workspaceId: WorkspaceIdSchema,
  channelId: Schema.NullOr(ChannelIdSchema),
  requestedBy: ProfileIdSchema,
  status: AnalysisRunStatusSchema,
  failureCategory: Schema.NullOr(AnalysisRunFailureCategorySchema),
  result: Schema.NullOr(AnalysisResultSchema),
  createdAt: Schema.DateFromSelf,
}).pipe(
  Schema.filter(
    (run) =>
      run.status === 'failed'
        ? run.failureCategory !== null
        : run.failureCategory === null,
    {
      message: () =>
        'Only a failed Analysis Run may expose a failure category.',
    }
  ),
  Schema.filter(
    (run) =>
      run.status === 'succeeded'
        ? run.result !== null && run.result.analysisRunId === run.id
        : run.result === null,
    {
      message: () =>
        'Exactly succeeded Analysis Runs must carry their immutable result.',
    }
  )
);

export type AnalysisRun = typeof AnalysisRunSchema.Type;
export type AnalysisRunStatus = typeof AnalysisRunStatusSchema.Type;
