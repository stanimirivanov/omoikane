import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Effect, Either, Fiber, Stream } from 'effect';
import {
  observeSessionChanges,
  getCurrentAccessToken,
  resendConfirmationEmail,
  requestPasswordReset,
  restoreSession,
  signIn,
  signUp,
  signOut,
  updatePassword,
  type AuthenticationError,
  type AuthenticationOperation,
  type AuthenticationService,
  type AuthenticationSession,
  type AuthenticationSessionChange,
  type SignInInput,
  type SignUpInput,
  type SignUpResult,
  type UpdatePasswordInput,
} from '@omoikane/application/authentication';
import { applicationRuntime } from '../effect/application-runtime';
import { logAuthenticationError } from './log-authentication-error';

/**
 * Angular execution boundary for authentication application programs.
 *
 * Application use cases build lazy Effects. This service executes them using
 * the composed runtime and exposes Angular-friendly Promises and callbacks.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthenticationApplicationService {
  private readonly document = inject(DOCUMENT);

  /** Executes one authentication Effect with consistent safe diagnostics. */
  private run<A>(
    operation: AuthenticationOperation,
    program: Effect.Effect<A, AuthenticationError, AuthenticationService>
  ): Promise<Either.Either<A, AuthenticationError>> {
    return applicationRuntime.runPromise(
      program.pipe(
        Effect.tapError((error) =>
          Effect.sync(() => {
            logAuthenticationError(operation, error);
          })
        ),
        Effect.either
      )
    );
  }

  private rootCallbackUrl(): string {
    return new URL('/', this.document.location.origin).toString();
  }

  /** Retrieves a transient token for one trusted API call without storing it. */
  currentAccessToken(): Promise<Either.Either<string, AuthenticationError>> {
    return this.run('get-access-token', getCurrentAccessToken);
  }

  /**
   * Restores the persisted browser session.
   */
  restoreSession(): Promise<
    Either.Either<AuthenticationSession | null, AuthenticationError>
  > {
    return this.run('restore-session', restoreSession);
  }

  /**
   * Executes email/password sign-in.
   *
   * Credentials are deliberately not included in diagnostic output.
   */
  signIn(
    input: SignInInput
  ): Promise<Either.Either<AuthenticationSession, AuthenticationError>> {
    return this.run('sign-in', signIn(input));
  }

  /**
   * Executes email/password account registration.
   *
   * The result preserves whether the provider created an immediate session or
   * requires email confirmation. Credentials never enter diagnostic output.
   */
  signUp(
    input: SignUpInput
  ): Promise<Either.Either<SignUpResult, AuthenticationError>> {
    return this.run('sign-up', signUp(input));
  }

  /** Resends confirmation for an account awaiting email verification. */
  resendConfirmationEmail(
    email: string
  ): Promise<Either.Either<void, AuthenticationError>> {
    return this.run(
      'resend-confirmation-email',
      resendConfirmationEmail({
        email,
        redirectUrl: this.rootCallbackUrl(),
      })
    );
  }

  /**
   * Requests a password-reset email with a callback to this browser origin.
   *
   * Constructing the absolute URL belongs here because the application use
   * case has no browser globals. The callback returns to the root shell, whose
   * Auth listener selects recovery mode from the provider event.
   */
  requestPasswordReset(
    email: string
  ): Promise<Either.Either<void, AuthenticationError>> {
    return this.run(
      'request-password-reset',
      requestPasswordReset({
        email,
        redirectUrl: this.rootCallbackUrl(),
      })
    );
  }

  /** Updates the password belonging to the active recovery session. */
  updatePassword(
    input: UpdatePasswordInput
  ): Promise<Either.Either<void, AuthenticationError>> {
    return this.run('update-password', updatePassword(input));
  }

  /**
   * Ends the current browser session.
   */
  signOut(): Promise<Either.Either<void, AuthenticationError>> {
    return this.run('sign-out', signOut);
  }

  /**
   * Starts observing provider session changes.
   *
   * The returned cleanup function interrupts the running stream Fiber.
   */
  observeSessionChanges(
    onSessionChange: (change: AuthenticationSessionChange) => void,
    onError: (error: AuthenticationError) => void
  ): () => void {
    const program = observeSessionChanges.pipe(
      Stream.runForEach((change) =>
        Effect.sync(() => {
          onSessionChange(change);
        })
      ),

      Effect.catchAll((error) =>
        Effect.sync(() => {
          logAuthenticationError('observe-session', error);

          onError(error);
        })
      )
    );

    const fiber = applicationRuntime.runFork(program);

    return () => {
      void applicationRuntime.runPromise(Fiber.interrupt(fiber));
    };
  }
}
