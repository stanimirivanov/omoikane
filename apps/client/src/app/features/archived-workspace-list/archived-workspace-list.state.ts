import type { ArchivedWorkspace } from '@omoikane/domain/workspace';
import type { WorkspaceId } from '@omoikane/domain/workspace';

export type ArchivedWorkspaceLoadStatus =
  | 'idle'
  | 'loading'
  | 'loaded'
  | 'failed';

export interface ArchivedWorkspaceListError {
  readonly message: string;
}

export type WorkspaceRestorationStatus = 'idle' | 'restoring' | 'failed';

export type ArchivedWorkspaceListContent =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: ArchivedWorkspaceListError }
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'workspaces';
      readonly workspaces: readonly ArchivedWorkspace[];
    };

/** Coherent rendering state for archive discovery and restoration. */
export interface ArchivedWorkspaceListView {
  readonly content: ArchivedWorkspaceListContent;
  readonly isRestoring: boolean;
  readonly restorationError: ArchivedWorkspaceListError | null;
}

/** Independent presentation state for archived-workspace discovery. */
export interface ArchivedWorkspaceListState {
  readonly workspaces: readonly ArchivedWorkspace[];
  readonly loadStatus: ArchivedWorkspaceLoadStatus;
  readonly error: ArchivedWorkspaceListError | null;
  readonly restorationStatus: WorkspaceRestorationStatus;
  readonly restoringWorkspaceId: WorkspaceId | null;
  readonly restorationError: ArchivedWorkspaceListError | null;
}

export const initialArchivedWorkspaceListState: ArchivedWorkspaceListState = {
  workspaces: [],
  loadStatus: 'idle',
  error: null,
  restorationStatus: 'idle',
  restoringWorkspaceId: null,
  restorationError: null,
};
