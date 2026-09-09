import type { Channel, ChannelId } from '@omoikane/domain/channel';
import type { WorkspaceId } from '@omoikane/domain/workspace';
import type { ChannelUnreadCount } from '@omoikane/application/message';

export type ChannelLoadStatus = 'idle' | 'loading' | 'loaded' | 'failed';

export type ChannelUnreadStatus = 'idle' | 'loading' | 'loaded' | 'failed';

/** Lifecycle of persisted unread-count reconciliation. */
export type ChannelUnreadRealtimeStatus = 'idle' | 'observing' | 'failed';

/** Lifecycle of the selected workspace's channel observation. */
export type ChannelNavigationRealtimeStatus = 'idle' | 'observing' | 'failed';

/**
 * Lifecycle of the single in-flight channel creation operation.
 */
export type ChannelCreationStatus = 'idle' | 'creating' | 'failed';

/**
 * Lifecycle of the single selected-channel update operation.
 */
export type ChannelUpdateStatus = 'idle' | 'updating' | 'failed';

/**
 * Lifecycle of the serialized channel archive operation.
 */
export type ChannelArchiveStatus = 'idle' | 'archiving' | 'failed';

export interface ChannelNavigationError {
  readonly message: string;
}

export interface ChannelNavigationOperationsView {
  readonly isBusy: boolean;
  readonly isCreating: boolean;
  readonly isUpdating: boolean;
  readonly isArchiving: boolean;
}

export type ChannelNavigationContent =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: ChannelNavigationError }
  | {
      readonly kind: 'ready';
      readonly channels: readonly Channel[];
      readonly selectedChannel: Channel | null;
      readonly unreadCountByChannel: ReadonlyMap<ChannelId, number>;
    };

/** Complete rendering state for channel navigation. */
export interface ChannelNavigationView {
  readonly content: ChannelNavigationContent;
  readonly operations: ChannelNavigationOperationsView;
  readonly realtimeError: ChannelNavigationError | null;
  readonly unreadError: ChannelNavigationError | null;
  readonly unreadRealtimeError: ChannelNavigationError | null;
  readonly creationError: ChannelNavigationError | null;
  readonly updateError: ChannelNavigationError | null;
  readonly archiveError: ChannelNavigationError | null;
}

/**
 * Presentation state for channel discovery inside one selected workspace.
 */
export interface ChannelNavigationState {
  readonly workspaceId: WorkspaceId | null;
  readonly channels: readonly Channel[];
  readonly selectedChannelId: ChannelId | null;
  readonly loadStatus: ChannelLoadStatus;
  readonly error: ChannelNavigationError | null;
  readonly unreadCounts: readonly ChannelUnreadCount[];
  readonly unreadStatus: ChannelUnreadStatus;
  readonly unreadError: ChannelNavigationError | null;
  readonly unreadRealtimeStatus: ChannelUnreadRealtimeStatus;
  readonly unreadRealtimeError: ChannelNavigationError | null;
  readonly realtimeStatus: ChannelNavigationRealtimeStatus;
  readonly realtimeError: ChannelNavigationError | null;
  readonly creationStatus: ChannelCreationStatus;
  readonly creationError: ChannelNavigationError | null;
  readonly updateStatus: ChannelUpdateStatus;
  readonly updateError: ChannelNavigationError | null;
  readonly archiveStatus: ChannelArchiveStatus;
  readonly archivingChannelId: ChannelId | null;
  readonly archiveError: ChannelNavigationError | null;
}

export const initialChannelNavigationState: ChannelNavigationState = {
  workspaceId: null,
  channels: [],
  selectedChannelId: null,
  loadStatus: 'idle',
  error: null,
  unreadCounts: [],
  unreadStatus: 'idle',
  unreadError: null,
  unreadRealtimeStatus: 'idle',
  unreadRealtimeError: null,
  realtimeStatus: 'idle',
  realtimeError: null,
  creationStatus: 'idle',
  creationError: null,
  updateStatus: 'idle',
  updateError: null,
  archiveStatus: 'idle',
  archivingChannelId: null,
  archiveError: null,
};
