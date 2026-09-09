import type {
  PendingWorkspaceInvitation,
  PendingWorkspaceInvitationForOwner,
} from '@omoikane/application/workspace';
import type {
  WorkspaceId,
  WorkspaceInvitationId,
} from '@omoikane/domain/workspace';

export type WorkspaceInvitationLoadStatus =
  | 'idle'
  | 'loading'
  | 'loaded'
  | 'failed';

export type WorkspaceInvitationCreationStatus =
  | 'idle'
  | 'pending'
  | 'succeeded'
  | 'failed';

export type WorkspaceInvitationResponseStatus = 'idle' | 'pending' | 'failed';

export type WorkspaceInvitationResponseKind = 'accept' | 'decline';

export type WorkspaceInvitationCancellationStatus =
  | 'idle'
  | 'pending'
  | 'failed';

export interface WorkspaceInvitationsError {
  readonly message: string;
}

export type WorkspaceInvitationResponseView =
  | {
      readonly kind: WorkspaceInvitationResponseKind;
      readonly invitationId: WorkspaceInvitationId;
    }
  | { readonly kind: 'idle' };

export type WorkspaceInvitationRecipientView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: WorkspaceInvitationsError }
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'invitations';
      readonly invitations: readonly PendingWorkspaceInvitation[];
      readonly response: WorkspaceInvitationResponseView;
      readonly responseError: WorkspaceInvitationsError | null;
    };

export type WorkspaceInvitationOwnerView =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: WorkspaceInvitationsError }
  | {
      readonly kind: 'ready';
      readonly invitations: readonly PendingWorkspaceInvitationForOwner[];
      readonly isMutating: boolean;
      readonly isCreating: boolean;
      readonly cancellationError: WorkspaceInvitationsError | null;
    };

export type WorkspaceInvitationCreationFeedback =
  | { readonly kind: 'none' }
  | { readonly kind: 'succeeded' }
  | { readonly kind: 'error'; readonly error: WorkspaceInvitationsError };

/** Coherent rendering state for recipient and owner invitation workflows. */
export interface WorkspaceInvitationsView {
  readonly isBusy: boolean;
  readonly recipient: WorkspaceInvitationRecipientView;
  readonly owner: WorkspaceInvitationOwnerView;
  readonly creationFeedback: WorkspaceInvitationCreationFeedback;
}

/** Presentation state for recipient responses and selected-owner creation. */
export interface WorkspaceInvitationsState {
  readonly invitations: readonly PendingWorkspaceInvitation[];
  readonly loadStatus: WorkspaceInvitationLoadStatus;
  readonly error: WorkspaceInvitationsError | null;
  readonly creationStatus: WorkspaceInvitationCreationStatus;
  readonly creationError: WorkspaceInvitationsError | null;
  readonly responseStatus: WorkspaceInvitationResponseStatus;
  readonly responseKind: WorkspaceInvitationResponseKind | null;
  readonly respondingInvitationId: WorkspaceInvitationId | null;
  readonly responseError: WorkspaceInvitationsError | null;
  readonly ownerWorkspaceId: WorkspaceId | null;
  readonly managedInvitations: readonly PendingWorkspaceInvitationForOwner[];
  readonly ownerLoadStatus: WorkspaceInvitationLoadStatus;
  readonly ownerError: WorkspaceInvitationsError | null;
  readonly cancellationStatus: WorkspaceInvitationCancellationStatus;
  readonly cancellingInvitationId: WorkspaceInvitationId | null;
  readonly cancellationError: WorkspaceInvitationsError | null;
}

export const initialWorkspaceInvitationsState: WorkspaceInvitationsState = {
  invitations: [],
  loadStatus: 'idle',
  error: null,
  creationStatus: 'idle',
  creationError: null,
  responseStatus: 'idle',
  responseKind: null,
  respondingInvitationId: null,
  responseError: null,
  ownerWorkspaceId: null,
  managedInvitations: [],
  ownerLoadStatus: 'idle',
  ownerError: null,
  cancellationStatus: 'idle',
  cancellingInvitationId: null,
  cancellationError: null,
};
