import type { AnalysisRun } from '@omoikane/domain/analysis';
import type { ChannelId } from '@omoikane/domain/channel';
import type { WorkspaceId } from '@omoikane/domain/workspace';

export interface AnalysisRunsState {
  readonly workspaceId: WorkspaceId | null;
  readonly channelId: ChannelId | null;
  readonly run: AnalysisRun | null;
  readonly status: 'idle' | 'starting' | 'observing' | 'failed';
  readonly error: { readonly message: string } | null;
}

export const initialAnalysisRunsState: AnalysisRunsState = {
  workspaceId: null,
  channelId: null,
  run: null,
  status: 'idle',
  error: null,
};
