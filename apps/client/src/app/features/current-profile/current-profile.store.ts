import { computed, inject } from '@angular/core';
import { Either } from 'effect';
import {
  type UpdateCurrentProfileError,
  type UpdateCurrentProfileInput,
} from '@omoikane/application/profile';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { ProfileApplicationService } from '@client/core/profile/profile-application.service';
import {
  initialCurrentProfileState,
  type CurrentProfileView,
} from './current-profile.state';

/**
 * Owns current-profile loading and self-service editing for one authenticated
 * shell.
 *
 * Authentication remains owned by `AuthenticationStore`; this store receives
 * the session user identifier and holds only the corresponding display data.
 */
export const CurrentProfileStore = signalStore(
  withState(initialCurrentProfileState),

  withComputed((store) => ({
    view: computed<CurrentProfileView>(() => {
      const profile = store.profile();
      if (profile !== null) {
        return {
          kind: 'profile',
          profile,
          isUpdating: store.updateStatus() === 'updating',
          updateError: store.updateError(),
        };
      }

      const error = store.error();
      return store.loadStatus() === 'failed' && error !== null
        ? { kind: 'error', error }
        : { kind: 'loading' };
    }),
  })),

  withMethods(
    (store, profileApplication = inject(ProfileApplicationService)) => {
      let requestVersion = 0;
      let activeRequest: {
        readonly userId: string;
        readonly promise: Promise<void>;
      } | null = null;

      return {
        /**
         * Loads a profile once for the current session identity.
         *
         * Duplicate calls share the active request. A changed session identity
         * clears the previous profile, and its late response cannot overwrite
         * the newer user's state.
         */
        load(userId: string): Promise<void> {
          if (store.userId() === userId && store.loadStatus() === 'loaded') {
            return Promise.resolve();
          }

          if (activeRequest?.userId === userId) {
            return activeRequest.promise;
          }

          const version = ++requestVersion;

          patchState(store, {
            userId,
            profile: null,
            loadStatus: 'loading',
            error: null,
            updateStatus: 'idle',
            updateError: null,
          });

          const promise = profileApplication
            .getCurrentProfile(userId)
            .then((result) => {
              if (version !== requestVersion) {
                return;
              }

              Either.match(result, {
                onLeft: () => {
                  patchState(store, {
                    profile: null,
                    loadStatus: 'failed',
                    error: {
                      message:
                        'Profile details are currently unavailable. Please try again.',
                    },
                  });
                },
                onRight: (profile) => {
                  patchState(store, {
                    profile,
                    loadStatus: 'loaded',
                    error: null,
                  });
                },
              });
            })
            .finally(() => {
              if (version === requestVersion) {
                activeRequest = null;
              }
            });

          activeRequest = { userId, promise };
          return promise;
        },

        /**
         * Updates editable values for the loaded session profile.
         *
         * The canonical profile returned by the application replaces local
         * state. A session change invalidates an update response in the same
         * way it invalidates a stale read response.
         */
        async update(input: UpdateCurrentProfileInput): Promise<boolean> {
          const userId = store.userId();

          if (
            userId === null ||
            store.profile() === null ||
            store.updateStatus() === 'updating'
          ) {
            return false;
          }

          const version = requestVersion;

          patchState(store, {
            updateStatus: 'updating',
            updateError: null,
          });

          const result = await profileApplication.updateCurrentProfile(input);

          if (version !== requestVersion || store.userId() !== userId) {
            return false;
          }

          return Either.match(result, {
            onLeft: (error) => {
              patchState(store, {
                updateStatus: 'failed',
                updateError: toProfileUpdateError(error),
              });

              return false;
            },
            onRight: (profile) => {
              patchState(store, {
                profile,
                updateStatus: 'idle',
                updateError: null,
              });

              return true;
            },
          });
        },

        clearUpdateError(): void {
          patchState(store, {
            updateStatus: 'idle',
            updateError: null,
          });
        },
      };
    }
  )
);

const toProfileUpdateError = (
  error: UpdateCurrentProfileError
): { readonly message: string } => {
  switch (error._tag) {
    case 'InvalidProfileUpdateInputError':
      return {
        message:
          error.field === 'displayName'
            ? 'Enter a display name.'
            : error.field === 'avatarUrl'
              ? 'Use an HTTPS avatar URL, or leave it blank.'
              : 'Check the profile values and try again.',
      };

    case 'ProfileUsernameUnavailableError':
      return {
        message: 'That username is already in use.',
      };

    default:
      return {
        message: 'Your profile could not be updated. Please try again.',
      };
  }
};
