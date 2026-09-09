import type { WorkspaceMemberCursor } from '@omoikane/application/workspace';
import type { AvatarUrl, Profile, ProfileId } from '@omoikane/domain/profile';
import type {
  WorkspaceId,
  WorkspaceMember,
  WorkspaceMemberRole,
} from '@omoikane/domain/workspace';

export type WorkspaceMemberLoadStatus =
  | 'idle'
  | 'loading'
  | 'loaded'
  | 'failed';

export type WorkspaceMemberMutationStatus = 'idle' | 'pending' | 'failed';

export type WorkspaceMemberPaginationStatus = 'idle' | 'loading' | 'failed';

export type WorkspaceMemberMutationKind =
  | 'role-change'
  | 'removal'
  | 'suspension';

export interface WorkspaceMemberDirectoryError {
  readonly message: string;
}

/**
 * Display entry derived from a membership and optional profile enrichment.
 */
export interface WorkspaceMemberDirectoryEntry {
  readonly profileId: ProfileId;
  readonly displayName: string;
  readonly avatarUrl: AvatarUrl | null;
  readonly role: WorkspaceMemberRole;
}

export type WorkspaceMemberMutationView =
  | { readonly kind: 'idle' }
  | {
      readonly kind: WorkspaceMemberMutationKind;
      readonly profileId: ProfileId;
    };

export interface WorkspaceMemberPaginationView {
  readonly hasMore: boolean;
  readonly isLoading: boolean;
  readonly error: WorkspaceMemberDirectoryError | null;
}

export type WorkspaceMemberDirectoryContent =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: WorkspaceMemberDirectoryError }
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'members';
      readonly entries: readonly WorkspaceMemberDirectoryEntry[];
      readonly pagination: WorkspaceMemberPaginationView;
      readonly mutation: WorkspaceMemberMutationView;
    };

/** Coherent rendering state for the member collection and its operations. */
export interface WorkspaceMemberDirectoryView {
  readonly isBusy: boolean;
  readonly canRefresh: boolean;
  readonly mutationError: WorkspaceMemberDirectoryError | null;
  readonly content: WorkspaceMemberDirectoryContent;
}

/**
 * Presentation state for the active-member directory of one workspace.
 */
export interface WorkspaceMemberDirectoryState {
  readonly workspaceId: WorkspaceId | null;
  readonly members: readonly WorkspaceMember[];
  readonly profiles: readonly Profile[];
  readonly loadStatus: WorkspaceMemberLoadStatus;
  readonly error: WorkspaceMemberDirectoryError | null;
  readonly nextCursor: WorkspaceMemberCursor | null;
  readonly paginationStatus: WorkspaceMemberPaginationStatus;
  readonly paginationError: WorkspaceMemberDirectoryError | null;
  readonly mutationStatus: WorkspaceMemberMutationStatus;
  readonly mutationKind: WorkspaceMemberMutationKind | null;
  readonly mutatingProfileId: ProfileId | null;
  readonly mutationError: WorkspaceMemberDirectoryError | null;
}

export const initialWorkspaceMemberDirectoryState: WorkspaceMemberDirectoryState =
  {
    workspaceId: null,
    members: [],
    profiles: [],
    loadStatus: 'idle',
    error: null,
    nextCursor: null,
    paginationStatus: 'idle',
    paginationError: null,
    mutationStatus: 'idle',
    mutationKind: null,
    mutatingProfileId: null,
    mutationError: null,
  };
