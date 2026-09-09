import type { ArchivedChannel } from '@omoikane/domain/channel';
import type { WorkspaceId } from '@omoikane/domain/workspace';

export type ArchivedChannelLoadStatus =
  | 'idle'
  | 'loading'
  | 'loaded'
  | 'failed';

export interface ArchivedChannelListError {
  readonly message: string;
}

export type ChannelRestorationStatus = 'idle' | 'restoring' | 'failed';

export type ArchivedChannelListContent =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: ArchivedChannelListError }
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'channels';
      readonly channels: readonly ArchivedChannel[];
    };

/** Coherent rendering state for archive discovery and restoration. */
export interface ArchivedChannelListView {
  readonly content: ArchivedChannelListContent;
  readonly isRestoring: boolean;
  readonly restorationError: ArchivedChannelListError | null;
}

/** Workspace-keyed presentation state for archived-channel discovery. */
export interface ArchivedChannelListState {
  readonly workspaceId: WorkspaceId | null;
  readonly channels: readonly ArchivedChannel[];
  readonly loadStatus: ArchivedChannelLoadStatus;
  readonly error: ArchivedChannelListError | null;
  readonly restorationStatus: ChannelRestorationStatus;
  readonly restoringChannelId: ArchivedChannel['id'] | null;
  readonly restorationError: ArchivedChannelListError | null;
}

export const initialArchivedChannelListState: ArchivedChannelListState = {
  workspaceId: null,
  channels: [],
  loadStatus: 'idle',
  error: null,
  restorationStatus: 'idle',
  restoringChannelId: null,
  restorationError: null,
};
