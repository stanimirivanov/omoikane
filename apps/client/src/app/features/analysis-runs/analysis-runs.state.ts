import type {
  AnalysisDecisionCandidateId,
  AnalysisRun,
} from '@omoikane/domain/analysis';
import type { ChannelId } from '@omoikane/domain/channel';
import type { WorkspaceId } from '@omoikane/domain/workspace';

export interface AnalysisRunsState {
  readonly workspaceId: WorkspaceId | null;
  readonly channelId: ChannelId | null;
  readonly timeRangeStart: Date;
  readonly timeRangeEnd: Date;
  readonly run: AnalysisRun | null;
  readonly status: 'idle' | 'starting' | 'observing' | 'failed';
  readonly reviewingCandidateId: AnalysisDecisionCandidateId | null;
  readonly error: { readonly message: string } | null;
}

export const ANALYSIS_DEFAULT_TIME_RANGE_MILLISECONDS =
  7 * 24 * 60 * 60 * 1_000;

/** Creates a fresh seven-day draft range for each feature-scoped store. */
export const createInitialAnalysisRunsState = (
  now = new Date()
): AnalysisRunsState => ({
  workspaceId: null,
  channelId: null,
  timeRangeStart: new Date(
    now.getTime() - ANALYSIS_DEFAULT_TIME_RANGE_MILLISECONDS
  ),
  timeRangeEnd: new Date(now),
  run: null,
  status: 'idle',
  reviewingCandidateId: null,
  error: null,
});
