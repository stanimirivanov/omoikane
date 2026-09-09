import type { Profile } from '@omoikane/domain/profile';

export type CurrentProfileLoadStatus = 'idle' | 'loading' | 'loaded' | 'failed';
export type CurrentProfileUpdateStatus = 'idle' | 'updating' | 'failed';

export interface CurrentProfilePresentationError {
  readonly message: string;
}

/** Coherent rendering state for current-profile loading and editing. */
export type CurrentProfileView =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'error';
      readonly error: CurrentProfilePresentationError;
    }
  | {
      readonly kind: 'profile';
      readonly profile: Profile;
      readonly isUpdating: boolean;
      readonly updateError: CurrentProfilePresentationError | null;
    };

/**
 * Presentation state for the profile associated with the current session.
 */
export interface CurrentProfileState {
  readonly userId: string | null;
  readonly profile: Profile | null;
  readonly loadStatus: CurrentProfileLoadStatus;
  readonly error: CurrentProfilePresentationError | null;
  readonly updateStatus: CurrentProfileUpdateStatus;
  readonly updateError: CurrentProfilePresentationError | null;
}

export const initialCurrentProfileState: CurrentProfileState = {
  userId: null,
  profile: null,
  loadStatus: 'idle',
  error: null,
  updateStatus: 'idle',
  updateError: null,
};
