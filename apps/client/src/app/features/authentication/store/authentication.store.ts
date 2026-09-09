import { Either } from 'effect';
import { computed, DestroyRef, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import type {
  AuthenticationError,
  AuthenticationSession,
  AuthenticationSessionChange,
} from '@omoikane/application/authentication';
import { AuthenticationApplicationService } from '@client/core/authentication/authentication-application.service';
import {
  initialAuthenticationState,
  type AuthenticationShellView,
  type PasswordRecoveryView,
} from './authentication.state';
import { toAuthenticationPresentationError } from './to-authentication-presentation-error';

/**
 * Root-scoped authentication state for the browser application.
 *
 * The store restores the persisted session once, subscribes once to future
 * provider changes, and coordinates account access and password recovery.
 */
export const AuthenticationStore = signalStore(
  {
    providedIn: 'root',
  },

  withState(initialAuthenticationState),

  withComputed((store) => ({
    isInitializing: computed(() => store.status() === 'initializing'),

    isAuthenticated: computed(() => store.status() === 'authenticated'),

    currentUserId: computed(() => store.session()?.userId ?? null),

    isSigningIn: computed(() => store.signInStatus() === 'pending'),

    isSigningUp: computed(() => store.signUpStatus() === 'pending'),

    requiresEmailConfirmation: computed(
      () => store.signUpStatus() === 'confirmation-required'
    ),

    isResendingConfirmationEmail: computed(
      () => store.confirmationEmailResendStatus() === 'pending'
    ),

    wasConfirmationEmailResent: computed(
      () => store.confirmationEmailResendStatus() === 'sent'
    ),

    isRequestingPasswordReset: computed(
      () => store.passwordResetRequestStatus() === 'pending'
    ),

    isPasswordResetEmailSent: computed(
      () => store.passwordResetRequestStatus() === 'sent'
    ),

    isPasswordRecoveryActive: computed(
      () => store.passwordRecoveryStatus() !== 'idle'
    ),

    isUpdatingPassword: computed(
      () => store.passwordRecoveryStatus() === 'pending'
    ),

    isPasswordUpdateComplete: computed(
      () => store.passwordRecoveryStatus() === 'completed'
    ),

    isSigningOut: computed(() => store.signOutStatus() === 'pending'),
  })),

  /*
   * Compose low-level authentication facts into mutually exclusive views so
   * templates do not need to reproduce workflow precedence.
   */
  withComputed((store) => ({
    shellView: computed<AuthenticationShellView>(() => {
      const status = store.status();

      if (status === 'initializing') {
        return 'initializing';
      }

      if (store.isPasswordRecoveryActive()) {
        return 'password-recovery';
      }

      return status;
    }),

    passwordRecoveryView: computed<PasswordRecoveryView>(() => {
      switch (store.passwordRecoveryStatus()) {
        case 'completed':
          return 'update-complete';

        case 'ready':
        case 'pending':
        case 'failed':
          return 'update-form';

        case 'idle':
          return store.isPasswordResetEmailSent()
            ? 'email-sent'
            : 'request-form';
      }
    }),
  })),

  withMethods(
    (
      store,
      authenticationApplication = inject(AuthenticationApplicationService),
      destroyRef = inject(DestroyRef)
    ) => {
      let initialization: Promise<void> | null = null;

      let stopObserving: (() => void) | null = null;

      let sessionRevision = 0;

      const idleConfirmationEmailState = {
        confirmationEmail: null,
        confirmationEmailResendStatus: 'idle',
      } as const;

      /**
       * Applies a current authentication session without completing an
       * independently running authentication request.
       */
      const applySession = (session: AuthenticationSession | null): void => {
        if (session === null) {
          patchState(store, {
            status: 'anonymous',
            session: null,
            passwordRecoveryStatus: 'idle',
          });

          return;
        }

        patchState(store, {
          status: 'authenticated',
          session,
          error: null,
          signUpStatus:
            store.signUpStatus() === 'pending' ? store.signUpStatus() : 'idle',
          ...idleConfirmationEmailState,
          passwordResetRequestStatus:
            store.passwordResetRequestStatus() === 'pending'
              ? store.passwordResetRequestStatus()
              : 'idle',
        });
      };

      const isAuthenticationCommandPending = (): boolean =>
        store.signInStatus() === 'pending' ||
        store.signUpStatus() === 'pending' ||
        store.confirmationEmailResendStatus() === 'pending' ||
        store.signOutStatus() === 'pending' ||
        store.passwordResetRequestStatus() === 'pending' ||
        store.passwordRecoveryStatus() === 'pending';

      /**
       * Applies an authoritative provider notification and invalidates
       * command results that started against an older session.
       */
      const applyObservedSession = (
        change: AuthenticationSessionChange
      ): void => {
        const recoveryUserId =
          store.passwordRecoveryStatus() === 'idle'
            ? null
            : (store.session()?.userId ?? null);

        sessionRevision += 1;
        applySession(change.session);

        if (change.type === 'password-recovery') {
          patchState(store, {
            passwordRecoveryStatus: 'ready',
            passwordResetRequestStatus: 'idle',
            error: null,
          });
          return;
        }

        if (
          recoveryUserId !== null &&
          change.session?.userId !== recoveryUserId
        ) {
          patchState(store, {
            passwordRecoveryStatus: 'idle',
          });
        }
      };

      /**
       * Records a safe presentation error emitted by the session stream.
       */
      const applyObservationError = (error: AuthenticationError): void => {
        patchState(store, {
          error: toAuthenticationPresentationError(error),
        });
      };

      /**
       * Starts the long-lived provider listener once.
       */
      const startObservation = (): void => {
        if (stopObserving !== null) {
          return;
        }

        stopObserving = authenticationApplication.observeSessionChanges(
          applyObservedSession,
          applyObservationError
        );
      };

      /**
       * Interrupt the Effect stream when Angular destroys this store's
       * injection context. This closes the scoped Supabase subscription.
       */
      destroyRef.onDestroy(() => {
        stopObserving?.();
        stopObserving = null;
      });

      return {
        /**
         * Restores the persisted session and starts session observation.
         *
         * Concurrent and repeated calls share one Promise, preventing
         * duplicate restoration calls and duplicate provider listeners.
         */
        initialize(): Promise<void> {
          if (initialization !== null) {
            return initialization;
          }

          initialization = (async () => {
            patchState(store, {
              status: 'initializing',
              error: null,
            });

            /*
             * Register before restoration so a recovery callback discovered
             * during Supabase client initialization cannot be reduced to a
             * later ordinary INITIAL_SESSION notification.
             */
            startObservation();

            const restorationRevision = sessionRevision;
            const result = await authenticationApplication.restoreSession();

            if (sessionRevision !== restorationRevision) {
              return;
            }

            Either.match(result, {
              onLeft: (error) => {
                patchState(store, {
                  status: 'anonymous',
                  session: null,
                  error: toAuthenticationPresentationError(error),
                });
              },

              onRight: (session) => {
                applySession(session);
              },
            });
          })();

          return initialization;
        },

        /**
         * Attempts email/password authentication.
         *
         * Returns `false` while another authentication command is pending,
         * avoiding overlapping provider requests.
         */
        async signIn(email: string, password: string): Promise<boolean> {
          if (isAuthenticationCommandPending()) {
            return false;
          }

          const startedAtRevision = sessionRevision;

          patchState(store, {
            signInStatus: 'pending',
            error: null,
          });

          const result = await authenticationApplication.signIn({
            email,
            password,
          });

          return Either.match(result, {
            onLeft: (error) => {
              if (sessionRevision !== startedAtRevision) {
                patchState(store, {
                  signInStatus: 'idle',
                });

                return false;
              }

              patchState(store, {
                signInStatus: 'failed',
                error: toAuthenticationPresentationError(error),
              });

              return false;
            },

            onRight: (session) => {
              if (sessionRevision === startedAtRevision) {
                applySession(session);
              }

              patchState(store, {
                signInStatus: 'idle',
              });

              return true;
            },
          });
        },

        /**
         * Attempts email/password account registration.
         *
         * Immediate-session results enter the authenticated shell. A
         * confirmation-required result remains anonymous and exposes a stable
         * completion state instead of treating the absent session as failure.
         */
        async signUp(email: string, password: string): Promise<boolean> {
          if (isAuthenticationCommandPending()) {
            return false;
          }

          const startedAtRevision = sessionRevision;

          patchState(store, {
            signUpStatus: 'pending',
            ...idleConfirmationEmailState,
            error: null,
          });

          const result = await authenticationApplication.signUp({
            email,
            password,
          });

          return Either.match(result, {
            onLeft: (error) => {
              if (sessionRevision !== startedAtRevision) {
                patchState(store, {
                  signUpStatus: 'idle',
                  ...idleConfirmationEmailState,
                });

                return false;
              }

              patchState(store, {
                signUpStatus: 'failed',
                ...idleConfirmationEmailState,
                error: toAuthenticationPresentationError(error),
              });

              return false;
            },

            onRight: (signUpResult) => {
              if (sessionRevision !== startedAtRevision) {
                patchState(store, {
                  signUpStatus: 'idle',
                  ...idleConfirmationEmailState,
                });

                return true;
              }

              if (signUpResult.status === 'authenticated') {
                applySession(signUpResult.session);
                patchState(store, {
                  signUpStatus: 'idle',
                  ...idleConfirmationEmailState,
                });
              } else {
                patchState(store, {
                  signUpStatus: 'confirmation-required',
                  confirmationEmail: signUpResult.email,
                  confirmationEmailResendStatus: 'idle',
                  error: null,
                });
              }

              return true;
            },
          });
        },

        /** Resends confirmation for the retained normalized registration email. */
        async resendConfirmationEmail(): Promise<boolean> {
          const email = store.confirmationEmail();

          if (
            email === null ||
            store.status() !== 'anonymous' ||
            store.signUpStatus() !== 'confirmation-required' ||
            isAuthenticationCommandPending()
          ) {
            return false;
          }

          const startedAtRevision = sessionRevision;
          const isCurrentRequest = (): boolean =>
            sessionRevision === startedAtRevision &&
            store.confirmationEmail() === email;

          patchState(store, {
            confirmationEmailResendStatus: 'pending',
            error: null,
          });

          const result =
            await authenticationApplication.resendConfirmationEmail(email);

          return Either.match(result, {
            onLeft: (error) => {
              if (!isCurrentRequest()) {
                patchState(store, {
                  confirmationEmailResendStatus: 'idle',
                });
                return false;
              }

              patchState(store, {
                confirmationEmailResendStatus: 'failed',
                error: toAuthenticationPresentationError(error),
              });
              return false;
            },
            onRight: () => {
              if (!isCurrentRequest()) {
                patchState(store, {
                  confirmationEmailResendStatus: 'idle',
                });
                return true;
              }

              patchState(store, {
                confirmationEmailResendStatus: 'sent',
                error: null,
              });
              return true;
            },
          });
        },

        /**
         * Requests a recovery email without revealing account existence.
         *
         * The completion notice is applied only while the same anonymous
         * session generation remains current.
         */
        async requestPasswordReset(email: string): Promise<boolean> {
          if (
            store.status() !== 'anonymous' ||
            isAuthenticationCommandPending()
          ) {
            return false;
          }

          const startedAtRevision = sessionRevision;
          patchState(store, {
            passwordResetRequestStatus: 'pending',
            error: null,
          });

          const result =
            await authenticationApplication.requestPasswordReset(email);

          return Either.match(result, {
            onLeft: (error) => {
              if (sessionRevision !== startedAtRevision) {
                patchState(store, { passwordResetRequestStatus: 'idle' });
                return false;
              }

              patchState(store, {
                passwordResetRequestStatus: 'failed',
                error: toAuthenticationPresentationError(error),
              });
              return false;
            },
            onRight: () => {
              if (
                sessionRevision !== startedAtRevision ||
                store.status() !== 'anonymous'
              ) {
                patchState(store, { passwordResetRequestStatus: 'idle' });
                return true;
              }

              patchState(store, {
                passwordResetRequestStatus: 'sent',
                error: null,
              });
              return true;
            },
          });
        },

        /** Replaces the password for the active recovery session. */
        async updatePassword(
          password: string,
          passwordConfirmation: string
        ): Promise<boolean> {
          const recoverySession = store.session();

          if (
            recoverySession === null ||
            (store.passwordRecoveryStatus() !== 'ready' &&
              store.passwordRecoveryStatus() !== 'failed') ||
            isAuthenticationCommandPending()
          ) {
            return false;
          }

          patchState(store, {
            passwordRecoveryStatus: 'pending',
            error: null,
          });

          const result = await authenticationApplication.updatePassword({
            password,
            passwordConfirmation,
          });

          return Either.match(result, {
            onLeft: (error) => {
              if (store.session()?.userId !== recoverySession.userId) {
                patchState(store, { passwordRecoveryStatus: 'idle' });
                return false;
              }

              patchState(store, {
                passwordRecoveryStatus: 'failed',
                error: toAuthenticationPresentationError(error),
              });
              return false;
            },
            onRight: () => {
              if (store.session()?.userId !== recoverySession.userId) {
                patchState(store, { passwordRecoveryStatus: 'idle' });
                return false;
              }

              patchState(store, {
                passwordRecoveryStatus: 'completed',
                error: null,
              });
              return true;
            },
          });
        },

        /**
         * Attempts to end the current session.
         *
         * Returns `false` while another authentication command is pending.
         */
        async signOut(): Promise<boolean> {
          if (isAuthenticationCommandPending()) {
            return false;
          }

          const startedAtRevision = sessionRevision;

          patchState(store, {
            signOutStatus: 'pending',
            error: null,
          });

          const result = await authenticationApplication.signOut();

          return Either.match(result, {
            onLeft: (error) => {
              if (sessionRevision !== startedAtRevision) {
                patchState(store, {
                  signOutStatus: 'idle',
                });

                return false;
              }

              patchState(store, {
                signOutStatus: 'failed',
                error: toAuthenticationPresentationError(error),
              });

              return false;
            },

            onRight: () => {
              if (sessionRevision === startedAtRevision) {
                applySession(null);
              }

              patchState(store, {
                signOutStatus: 'idle',
              });

              return true;
            },
          });
        },

        /**
         * Clears the current presentation error and returns failed operation
         * statuses to idle.
         */
        clearError(): void {
          patchState(store, {
            error: null,

            signInStatus:
              store.signInStatus() === 'failed' ? 'idle' : store.signInStatus(),

            signUpStatus:
              store.signUpStatus() === 'failed' ? 'idle' : store.signUpStatus(),

            confirmationEmailResendStatus:
              store.confirmationEmailResendStatus() === 'failed'
                ? 'idle'
                : store.confirmationEmailResendStatus(),

            signOutStatus:
              store.signOutStatus() === 'failed'
                ? 'idle'
                : store.signOutStatus(),

            passwordResetRequestStatus:
              store.passwordResetRequestStatus() === 'failed'
                ? 'idle'
                : store.passwordResetRequestStatus(),

            passwordRecoveryStatus:
              store.passwordRecoveryStatus() === 'failed'
                ? 'ready'
                : store.passwordRecoveryStatus(),
          });
        },

        /** Clears a completed confirmation notice so another email can register. */
        resetSignUp(): void {
          if (
            store.signUpStatus() !== 'pending' &&
            store.confirmationEmailResendStatus() !== 'pending'
          ) {
            patchState(store, {
              signUpStatus: 'idle',
              ...idleConfirmationEmailState,
              error: null,
            });
          }
        },

        /** Clears the sent notice so another recovery email can be requested. */
        resetPasswordResetRequest(): void {
          if (store.passwordResetRequestStatus() !== 'pending') {
            patchState(store, {
              passwordResetRequestStatus: 'idle',
              error: null,
            });
          }
        },

        /** Leaves the completed recovery screen while retaining its session. */
        finishPasswordRecovery(): void {
          if (store.passwordRecoveryStatus() === 'completed') {
            patchState(store, {
              passwordRecoveryStatus: 'idle',
              error: null,
            });
          }
        },
      };
    }
  )
);
