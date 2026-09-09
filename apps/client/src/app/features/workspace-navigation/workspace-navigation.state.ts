import type { Workspace, WorkspaceId } from '@omoikane/domain/workspace';

/**
 * Lifecycle of accessible-workspace discovery.
 */
export type WorkspaceLoadStatus = 'idle' | 'loading' | 'loaded' | 'failed';

/** Lifecycle of the per-user workspace-access observation. */
export type WorkspaceAccessRealtimeStatus = 'idle' | 'observing' | 'failed';

/**
 * Lifecycle of the single in-flight workspace creation operation.
 */
export type WorkspaceCreationStatus = 'idle' | 'creating' | 'failed';

/**
 * Lifecycle of the selected-workspace update operation.
 */
export type WorkspaceUpdateStatus = 'idle' | 'updating' | 'failed';

/**
 * Lifecycle of the serialized workspace archive operation.
 */
export type WorkspaceArchiveStatus = 'idle' | 'archiving' | 'failed';

/**
 * Lifecycle of the serialized self-departure operation.
 */
export type WorkspaceDepartureStatus = 'idle' | 'leaving' | 'failed';

/**
 * Safe failure information rendered by workspace navigation.
 */
export interface WorkspaceNavigationError {
  readonly message: string;
}

export interface WorkspaceNavigationOperationsView {
  readonly isBusy: boolean;
  readonly isCreating: boolean;
  readonly isUpdating: boolean;
  readonly isArchiving: boolean;
  readonly isLeaving: boolean;
}

export type WorkspaceNavigationContent =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: WorkspaceNavigationError }
  | {
      readonly kind: 'ready';
      readonly workspaces: readonly Workspace[];
      readonly selectedWorkspace: Workspace | null;
    };

/** Complete rendering state for workspace navigation. */
export interface WorkspaceNavigationView {
  readonly content: WorkspaceNavigationContent;
  readonly operations: WorkspaceNavigationOperationsView;
  readonly realtimeError: WorkspaceNavigationError | null;
  readonly creationError: WorkspaceNavigationError | null;
  readonly updateError: WorkspaceNavigationError | null;
  readonly archiveError: WorkspaceNavigationError | null;
  readonly departureError: WorkspaceNavigationError | null;
}

/**
 * Presentation state for workspace discovery and explicit selection.
 */
export interface WorkspaceNavigationState {
  readonly workspaces: readonly Workspace[];
  readonly selectedWorkspaceId: WorkspaceId | null;
  readonly loadStatus: WorkspaceLoadStatus;
  readonly error: WorkspaceNavigationError | null;
  readonly realtimeStatus: WorkspaceAccessRealtimeStatus;
  readonly realtimeError: WorkspaceNavigationError | null;
  readonly creationStatus: WorkspaceCreationStatus;
  readonly creationError: WorkspaceNavigationError | null;
  readonly updateStatus: WorkspaceUpdateStatus;
  readonly updateError: WorkspaceNavigationError | null;
  readonly archiveStatus: WorkspaceArchiveStatus;
  readonly archivingWorkspaceId: WorkspaceId | null;
  readonly archiveError: WorkspaceNavigationError | null;
  readonly departureStatus: WorkspaceDepartureStatus;
  readonly departingWorkspaceId: WorkspaceId | null;
  readonly departureError: WorkspaceNavigationError | null;
}

/**
 * Fresh feature state before workspace discovery begins.
 */
export const initialWorkspaceNavigationState: WorkspaceNavigationState = {
  workspaces: [],
  selectedWorkspaceId: null,
  loadStatus: 'idle',
  error: null,
  realtimeStatus: 'idle',
  realtimeError: null,
  creationStatus: 'idle',
  creationError: null,
  updateStatus: 'idle',
  updateError: null,
  archiveStatus: 'idle',
  archivingWorkspaceId: null,
  archiveError: null,
  departureStatus: 'idle',
  departingWorkspaceId: null,
  departureError: null,
};
