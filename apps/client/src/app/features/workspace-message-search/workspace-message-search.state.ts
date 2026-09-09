import type { WorkspaceMessageSearchResult } from '@omoikane/application/message';
import type { WorkspaceId } from '@omoikane/domain/workspace';

export type WorkspaceMessageSearchStatus =
  | 'idle'
  | 'searching'
  | 'completed'
  | 'failed';

/** Complete rendering state for workspace message search. */
export type WorkspaceMessageSearchView =
  | { readonly kind: 'idle'; readonly query: string }
  | { readonly kind: 'searching'; readonly query: string }
  | { readonly kind: 'error'; readonly query: string; readonly message: string }
  | { readonly kind: 'empty'; readonly query: string }
  | {
      readonly kind: 'results';
      readonly query: string;
      readonly results: readonly WorkspaceMessageSearchResult[];
    };

/** Presentation state for one selected workspace's independent search form. */
export interface WorkspaceMessageSearchState {
  readonly workspaceId: WorkspaceId | null;
  readonly query: string;
  readonly results: readonly WorkspaceMessageSearchResult[];
  readonly status: WorkspaceMessageSearchStatus;
  readonly error: string | null;
  readonly requestGeneration: number;
}

export const initialWorkspaceMessageSearchState: WorkspaceMessageSearchState = {
  workspaceId: null,
  query: '',
  results: [],
  status: 'idle',
  error: null,
  requestGeneration: 0,
};
