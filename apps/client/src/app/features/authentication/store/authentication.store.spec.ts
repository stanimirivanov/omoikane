import { Either } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  AuthenticationUnavailableError,
  AccountAlreadyRegisteredError,
  ConfirmationEmailResendRateLimitedError,
  InvalidCredentialsError,
  InvalidPasswordUpdateInputError,
  PasswordResetRateLimitedError,
  type AuthenticationError,
  type AuthenticationSession,
  type AuthenticationSessionChange,
  type SignUpResult,
} from '@omoikane/application/authentication';
import { AuthenticationApplicationService } from '@client/core/authentication/authentication-application.service';
import { AuthenticationStore } from './authentication.store';

const session: AuthenticationSession = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'owner@omoikane.local',
};

const makeDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });

  return { promise, resolve };
};

const makeSessionObserver = () => {
  let onSessionChange:
    | ((value: AuthenticationSessionChange) => void)
    | undefined;
  let onError: ((error: AuthenticationError) => void) | undefined;
  const stop = vi.fn();

  const observeSessionChanges = vi.fn(
    (
      sessionHandler: (value: AuthenticationSessionChange) => void,
      errorHandler: (error: AuthenticationError) => void
    ) => {
      onSessionChange = sessionHandler;
      onError = errorHandler;
      return stop;
    }
  );

  return {
    observeSessionChanges,
    stop,
    emitSession(value: AuthenticationSession | null): void {
      onSessionChange?.({
        type: 'session',
        session: value,
      });
    },
    emitPasswordRecovery(value: AuthenticationSession): void {
      onSessionChange?.({
        type: 'password-recovery',
        session: value,
      });
    },
    emitError(error: AuthenticationError): void {
      onError?.(error);
    },
  };
};

const configureStore = (
  overrides: Partial<{
    restoreSession: AuthenticationApplicationService['restoreSession'];

    signIn: AuthenticationApplicationService['signIn'];

    signUp: AuthenticationApplicationService['signUp'];

    resendConfirmationEmail: AuthenticationApplicationService['resendConfirmationEmail'];

    requestPasswordReset: AuthenticationApplicationService['requestPasswordReset'];

    updatePassword: AuthenticationApplicationService['updatePassword'];

    signOut: AuthenticationApplicationService['signOut'];

    observeSessionChanges: AuthenticationApplicationService['observeSessionChanges'];
  }> = {}
) => {
  const stopObserving = vi.fn();

  const service = {
    restoreSession: vi.fn().mockResolvedValue(Either.right(null)),

    signIn: vi.fn().mockResolvedValue(Either.right(session)),

    signUp: vi.fn().mockResolvedValue(
      Either.right({
        status: 'authenticated',
        session,
      } satisfies SignUpResult)
    ),

    signOut: vi.fn().mockResolvedValue(Either.right(undefined)),

    resendConfirmationEmail: vi.fn().mockResolvedValue(Either.right(undefined)),

    requestPasswordReset: vi.fn().mockResolvedValue(Either.right(undefined)),

    updatePassword: vi.fn().mockResolvedValue(Either.right(undefined)),

    observeSessionChanges: vi.fn().mockReturnValue(stopObserving),

    ...overrides,
  };

  TestBed.configureTestingModule({
    providers: [
      AuthenticationStore,
      {
        provide: AuthenticationApplicationService,
        useValue: service,
      },
    ],
  });

  return {
    store: TestBed.inject(AuthenticationStore),
    service,
    stopObserving,
  };
};

describe('AuthenticationStore', () => {
  it('starts as initializing', () => {
    const { store } = configureStore();

    expect(store.status()).toBe('initializing');

    expect(store.session()).toBeNull();

    expect(store.isInitializing()).toBe(true);

    expect(store.shellView()).toBe('initializing');

    expect(store.currentUserId()).toBeNull();
  });

  it('becomes anonymous without a restored session', async () => {
    const { store } = configureStore();

    await store.initialize();

    expect(store.status()).toBe('anonymous');

    expect(store.session()).toBeNull();

    expect(store.shellView()).toBe('anonymous');
  });

  it('restores an authenticated session', async () => {
    const { store } = configureStore({
      restoreSession: vi.fn().mockResolvedValue(Either.right(session)),
    });

    await store.initialize();

    expect(store.status()).toBe('authenticated');

    expect(store.session()).toEqual(session);

    expect(store.shellView()).toBe('authenticated');

    expect(store.currentUserId()).toBe(session.userId);
  });

  it('does not overwrite a recovery event with an older restoration snapshot', async () => {
    const observer = makeSessionObserver();
    const restoration =
      makeDeferred<
        Either.Either<AuthenticationSession | null, AuthenticationError>
      >();
    const { store } = configureStore({
      restoreSession: vi.fn().mockReturnValue(restoration.promise),
      observeSessionChanges: observer.observeSessionChanges,
    });

    const initialization = store.initialize();

    expect(observer.observeSessionChanges).toHaveBeenCalledOnce();

    observer.emitPasswordRecovery(session);
    restoration.resolve(Either.right(null));
    await initialization;

    expect(store.status()).toBe('authenticated');
    expect(store.session()).toEqual(session);
    expect(store.isPasswordRecoveryActive()).toBe(true);
    expect(store.passwordRecoveryStatus()).toBe('ready');
    expect(store.shellView()).toBe('password-recovery');
    expect(store.passwordRecoveryView()).toBe('update-form');
  });

  it('exposes a restoration failure and remains anonymous', async () => {
    const failure = new AuthenticationUnavailableError({
      operation: 'restore-session',
      cause: new Error('Provider unavailable'),
    });

    const { store } = configureStore({
      restoreSession: vi.fn().mockResolvedValue(Either.left(failure)),
    });

    await store.initialize();

    expect(store.status()).toBe('anonymous');

    expect(store.session()).toBeNull();

    expect(store.error()).toEqual({
      message: 'Authentication is currently unavailable. Please try again.',
    });
  });

  it('initializes and subscribes only once', async () => {
    const restoreSession = vi.fn().mockResolvedValue(Either.right(null));

    const observeSessionChanges = vi.fn().mockReturnValue(() => undefined);

    const { store } = configureStore({
      restoreSession,
      observeSessionChanges,
    });

    await Promise.all([
      store.initialize(),
      store.initialize(),
      store.initialize(),
    ]);

    expect(restoreSession).toHaveBeenCalledOnce();

    expect(observeSessionChanges).toHaveBeenCalledOnce();
  });

  it('applies observed session changes', async () => {
    const observer = makeSessionObserver();

    const { store } = configureStore({
      observeSessionChanges: observer.observeSessionChanges,
    });

    await store.initialize();

    observer.emitSession(session);

    expect(store.status()).toBe('authenticated');

    expect(store.session()).toEqual(session);

    observer.emitSession(null);

    expect(store.status()).toBe('anonymous');

    expect(store.session()).toBeNull();
  });

  it('exposes session observation failures', async () => {
    const observer = makeSessionObserver();

    const { store } = configureStore({
      observeSessionChanges: observer.observeSessionChanges,
    });

    await store.initialize();

    observer.emitError(
      new AuthenticationUnavailableError({
        operation: 'observe-session',
        cause: new Error('Listener failed'),
      })
    );

    expect(store.error()).toEqual({
      message: 'Authentication is currently unavailable. Please try again.',
    });
  });

  it('authenticates after successful sign-in', async () => {
    const signIn = vi.fn().mockResolvedValue(Either.right(session));

    const { store } = configureStore({
      signIn,
    });

    await store.initialize();

    const result = await store.signIn('owner@omoikane.local', 'Password123!');

    expect(result).toBe(true);

    expect(store.status()).toBe('authenticated');

    expect(store.session()).toEqual(session);

    expect(store.signInStatus()).toBe('idle');
  });

  it('exposes invalid credentials', async () => {
    const signIn = vi
      .fn()
      .mockResolvedValue(Either.left(new InvalidCredentialsError()));

    const { store } = configureStore({
      signIn,
    });

    await store.initialize();

    const result = await store.signIn('owner@omoikane.local', 'wrong-password');

    expect(result).toBe(false);

    expect(store.signInStatus()).toBe('failed');

    expect(store.error()).toEqual({
      message: 'The email or password is incorrect.',
    });
  });

  it('prevents duplicate pending sign-in requests', async () => {
    let resolveSignIn:
      | ((
          value: Either.Either<AuthenticationSession, AuthenticationError>
        ) => void)
      | undefined;

    const pendingSignIn = new Promise<
      Either.Either<AuthenticationSession, AuthenticationError>
    >((resolve) => {
      resolveSignIn = resolve;
    });

    const signIn = vi.fn().mockReturnValue(pendingSignIn);

    const { store } = configureStore({
      signIn,
    });

    await store.initialize();

    const firstResult = store.signIn('owner@omoikane.local', 'Password123!');

    expect(store.signInStatus()).toBe('pending');

    const duplicateResult = await store.signIn(
      'owner@omoikane.local',
      'Password123!'
    );

    expect(duplicateResult).toBe(false);

    expect(signIn).toHaveBeenCalledOnce();

    resolveSignIn?.(Either.right(session));

    await expect(firstResult).resolves.toBe(true);
  });

  it('does not complete sign-in solely because a session event arrived', async () => {
    const observer = makeSessionObserver();
    const signIn =
      makeDeferred<Either.Either<AuthenticationSession, AuthenticationError>>();

    const { store } = configureStore({
      signIn: vi.fn().mockReturnValue(signIn.promise),
      observeSessionChanges: observer.observeSessionChanges,
    });

    await store.initialize();

    const result = store.signIn('owner@omoikane.local', 'Password123!');

    observer.emitSession(session);

    expect(store.signInStatus()).toBe('pending');

    signIn.resolve(Either.right(session));

    await expect(result).resolves.toBe(true);

    expect(store.signInStatus()).toBe('idle');
  });

  it('does not let a stale sign-in result replace a newer observed session', async () => {
    const newerSession: AuthenticationSession = {
      userId: '00000000-0000-4000-8000-000000000002',
      email: 'newer@omoikane.local',
    };

    const observer = makeSessionObserver();
    const signIn =
      makeDeferred<Either.Either<AuthenticationSession, AuthenticationError>>();

    const { store } = configureStore({
      signIn: vi.fn().mockReturnValue(signIn.promise),
      observeSessionChanges: observer.observeSessionChanges,
    });

    await store.initialize();

    const result = store.signIn('owner@omoikane.local', 'Password123!');

    observer.emitSession(newerSession);

    signIn.resolve(Either.right(session));

    await expect(result).resolves.toBe(true);

    expect(store.session()).toEqual(newerSession);
  });

  it('authenticates after registration returns an immediate session', async () => {
    const signUp = vi.fn().mockResolvedValue(
      Either.right({
        status: 'authenticated',
        session,
      } satisfies SignUpResult)
    );
    const { store } = configureStore({ signUp });

    await store.initialize();

    await expect(
      store.signUp('new-user@example.com', 'Password123!')
    ).resolves.toBe(true);
    expect(signUp).toHaveBeenCalledExactlyOnceWith({
      email: 'new-user@example.com',
      password: 'Password123!',
    });
    expect(store.status()).toBe('authenticated');
    expect(store.session()).toEqual(session);
    expect(store.signUpStatus()).toBe('idle');
  });

  it('retains an anonymous confirmation-required completion', async () => {
    const { store } = configureStore({
      signUp: vi.fn().mockResolvedValue(
        Either.right({
          status: 'confirmation-required',
          email: 'new-user@example.com',
        } satisfies SignUpResult)
      ),
    });

    await store.initialize();

    await expect(
      store.signUp('new-user@example.com', 'Password123!')
    ).resolves.toBe(true);
    expect(store.status()).toBe('anonymous');
    expect(store.session()).toBeNull();
    expect(store.signUpStatus()).toBe('confirmation-required');
    expect(store.requiresEmailConfirmation()).toBe(true);
    expect(store.confirmationEmail()).toBe('new-user@example.com');

    store.resetSignUp();

    expect(store.signUpStatus()).toBe('idle');
    expect(store.confirmationEmail()).toBeNull();
  });

  it('resends confirmation for the normalized registration email', async () => {
    const resendConfirmationEmail = vi
      .fn()
      .mockResolvedValue(Either.right(undefined));
    const { store } = configureStore({
      signUp: vi.fn().mockResolvedValue(
        Either.right({
          status: 'confirmation-required',
          email: 'new-user@example.com',
        } satisfies SignUpResult)
      ),
      resendConfirmationEmail,
    });

    await store.initialize();
    await store.signUp(' new-user@example.com ', 'Password123!');

    await expect(store.resendConfirmationEmail()).resolves.toBe(true);
    expect(resendConfirmationEmail).toHaveBeenCalledExactlyOnceWith(
      'new-user@example.com'
    );
    expect(store.wasConfirmationEmailResent()).toBe(true);
    expect(store.requiresEmailConfirmation()).toBe(true);
  });

  it('presents confirmation resend rate limits without losing its email', async () => {
    const { store } = configureStore({
      signUp: vi.fn().mockResolvedValue(
        Either.right({
          status: 'confirmation-required',
          email: 'new-user@example.com',
        } satisfies SignUpResult)
      ),
      resendConfirmationEmail: vi
        .fn()
        .mockResolvedValue(
          Either.left(new ConfirmationEmailResendRateLimitedError())
        ),
    });

    await store.initialize();
    await store.signUp('new-user@example.com', 'Password123!');

    await expect(store.resendConfirmationEmail()).resolves.toBe(false);
    expect(store.confirmationEmailResendStatus()).toBe('failed');
    expect(store.confirmationEmail()).toBe('new-user@example.com');
    expect(store.error()).toEqual({
      message: 'Wait a moment before requesting another confirmation email.',
    });
  });

  it('serializes confirmation resend with other authentication commands', async () => {
    const resend = makeDeferred<Either.Either<void, AuthenticationError>>();
    const signIn = vi.fn().mockResolvedValue(Either.right(session));
    const { store } = configureStore({
      signUp: vi.fn().mockResolvedValue(
        Either.right({
          status: 'confirmation-required',
          email: 'new-user@example.com',
        } satisfies SignUpResult)
      ),
      resendConfirmationEmail: vi.fn().mockReturnValue(resend.promise),
      signIn,
    });

    await store.initialize();
    await store.signUp('new-user@example.com', 'Password123!');

    const resendResult = store.resendConfirmationEmail();

    expect(store.isResendingConfirmationEmail()).toBe(true);
    await expect(
      store.signIn('new-user@example.com', 'Password123!')
    ).resolves.toBe(false);
    expect(signIn).not.toHaveBeenCalled();

    store.resetSignUp();
    expect(store.requiresEmailConfirmation()).toBe(true);

    resend.resolve(Either.right(undefined));
    await expect(resendResult).resolves.toBe(true);
  });

  it('does not restore confirmation state after a newer session arrives', async () => {
    const observer = makeSessionObserver();
    const resend = makeDeferred<Either.Either<void, AuthenticationError>>();
    const { store } = configureStore({
      signUp: vi.fn().mockResolvedValue(
        Either.right({
          status: 'confirmation-required',
          email: 'new-user@example.com',
        } satisfies SignUpResult)
      ),
      resendConfirmationEmail: vi.fn().mockReturnValue(resend.promise),
      observeSessionChanges: observer.observeSessionChanges,
    });

    await store.initialize();
    await store.signUp('new-user@example.com', 'Password123!');

    const result = store.resendConfirmationEmail();
    observer.emitSession(session);
    resend.resolve(Either.right(undefined));

    await expect(result).resolves.toBe(true);
    expect(store.status()).toBe('authenticated');
    expect(store.confirmationEmail()).toBeNull();
    expect(store.confirmationEmailResendStatus()).toBe('idle');
  });

  it('presents an already registered account without provider details', async () => {
    const { store } = configureStore({
      signUp: vi
        .fn()
        .mockResolvedValue(Either.left(new AccountAlreadyRegisteredError())),
    });

    await store.initialize();

    await expect(
      store.signUp('owner@omoikane.local', 'Password123!')
    ).resolves.toBe(false);
    expect(store.signUpStatus()).toBe('failed');
    expect(store.error()).toEqual({
      message: 'An account with this email already exists. Try signing in.',
    });
  });

  it('serializes registration with other authentication commands', async () => {
    const pendingSignUp =
      makeDeferred<Either.Either<SignUpResult, AuthenticationError>>();
    const signIn = vi.fn().mockResolvedValue(Either.right(session));
    const signUp = vi.fn().mockReturnValue(pendingSignUp.promise);
    const { store } = configureStore({ signIn, signUp });

    await store.initialize();

    const registration = store.signUp('new-user@example.com', 'Password123!');

    expect(store.isSigningUp()).toBe(true);
    await expect(
      store.signIn('owner@omoikane.local', 'Password123!')
    ).resolves.toBe(false);
    expect(signIn).not.toHaveBeenCalled();

    pendingSignUp.resolve(
      Either.right({
        status: 'confirmation-required',
        email: 'new-user@example.com',
      })
    );
    await expect(registration).resolves.toBe(true);
  });

  it('does not let a stale registration result replace an observed session', async () => {
    const newerSession: AuthenticationSession = {
      userId: '00000000-0000-4000-8000-000000000002',
      email: 'newer@omoikane.local',
    };
    const observer = makeSessionObserver();
    const signUp =
      makeDeferred<Either.Either<SignUpResult, AuthenticationError>>();
    const { store } = configureStore({
      signUp: vi.fn().mockReturnValue(signUp.promise),
      observeSessionChanges: observer.observeSessionChanges,
    });

    await store.initialize();

    const registration = store.signUp('new-user@example.com', 'Password123!');
    observer.emitSession(newerSession);
    signUp.resolve(
      Either.right({
        status: 'authenticated',
        session,
      })
    );

    await expect(registration).resolves.toBe(true);
    expect(store.session()).toEqual(newerSession);
    expect(store.signUpStatus()).toBe('idle');
  });

  it('exposes a non-enumerating completion after requesting a recovery email', async () => {
    const requestPasswordReset = vi
      .fn()
      .mockResolvedValue(Either.right(undefined));
    const { store } = configureStore({ requestPasswordReset });

    await store.initialize();

    await expect(
      store.requestPasswordReset('owner@omoikane.local')
    ).resolves.toBe(true);
    expect(requestPasswordReset).toHaveBeenCalledExactlyOnceWith(
      'owner@omoikane.local'
    );
    expect(store.isPasswordResetEmailSent()).toBe(true);
    expect(store.passwordRecoveryView()).toBe('email-sent');
    expect(store.error()).toBeNull();

    store.resetPasswordResetRequest();

    expect(store.passwordResetRequestStatus()).toBe('idle');
    expect(store.passwordRecoveryView()).toBe('request-form');
  });

  it('presents password-reset rate limits without provider details', async () => {
    const { store } = configureStore({
      requestPasswordReset: vi
        .fn()
        .mockResolvedValue(Either.left(new PasswordResetRateLimitedError())),
    });

    await store.initialize();

    await expect(
      store.requestPasswordReset('owner@omoikane.local')
    ).resolves.toBe(false);
    expect(store.passwordResetRequestStatus()).toBe('failed');
    expect(store.error()).toEqual({
      message: 'Wait a moment before requesting another recovery email.',
    });
  });

  it('serializes recovery-email requests with other authentication commands', async () => {
    const request = makeDeferred<Either.Either<void, AuthenticationError>>();
    const signIn = vi.fn().mockResolvedValue(Either.right(session));
    const { store } = configureStore({
      requestPasswordReset: vi.fn().mockReturnValue(request.promise),
      signIn,
    });

    await store.initialize();

    const recoveryRequest = store.requestPasswordReset('owner@omoikane.local');

    expect(store.isRequestingPasswordReset()).toBe(true);
    await expect(
      store.signIn('owner@omoikane.local', 'Password123!')
    ).resolves.toBe(false);
    expect(signIn).not.toHaveBeenCalled();

    request.resolve(Either.right(undefined));
    await expect(recoveryRequest).resolves.toBe(true);
  });

  it('updates the password for an observed recovery session', async () => {
    const observer = makeSessionObserver();
    const updatePassword = vi.fn().mockResolvedValue(Either.right(undefined));
    const { store } = configureStore({
      observeSessionChanges: observer.observeSessionChanges,
      updatePassword,
    });

    await store.initialize();
    observer.emitPasswordRecovery(session);

    await expect(
      store.updatePassword('Replacement123!', 'Replacement123!')
    ).resolves.toBe(true);
    expect(updatePassword).toHaveBeenCalledExactlyOnceWith({
      password: 'Replacement123!',
      passwordConfirmation: 'Replacement123!',
    });
    expect(store.isPasswordUpdateComplete()).toBe(true);
    expect(store.passwordRecoveryView()).toBe('update-complete');

    store.finishPasswordRecovery();

    expect(store.isPasswordRecoveryActive()).toBe(false);
    expect(store.status()).toBe('authenticated');
    expect(store.session()).toEqual(session);
    expect(store.shellView()).toBe('authenticated');
    expect(store.passwordRecoveryView()).toBe('request-form');
  });

  it('presents invalid replacement-password input inside recovery', async () => {
    const observer = makeSessionObserver();
    const { store } = configureStore({
      observeSessionChanges: observer.observeSessionChanges,
      updatePassword: vi.fn().mockResolvedValue(
        Either.left(
          new InvalidPasswordUpdateInputError({
            field: 'passwordConfirmation',
          })
        )
      ),
    });

    await store.initialize();
    observer.emitPasswordRecovery(session);

    await expect(store.updatePassword('one', 'two')).resolves.toBe(false);
    expect(store.passwordRecoveryStatus()).toBe('failed');
    expect(store.passwordRecoveryView()).toBe('update-form');
    expect(store.error()).toEqual({
      message: 'The password confirmation must match.',
    });
  });

  it('completes recovery after a same-user session notification', async () => {
    const observer = makeSessionObserver();
    const update = makeDeferred<Either.Either<void, AuthenticationError>>();
    const { store } = configureStore({
      observeSessionChanges: observer.observeSessionChanges,
      updatePassword: vi.fn().mockReturnValue(update.promise),
    });

    await store.initialize();
    observer.emitPasswordRecovery(session);

    const result = store.updatePassword('Replacement123!', 'Replacement123!');
    expect(store.passwordRecoveryStatus()).toBe('pending');
    expect(store.passwordRecoveryView()).toBe('update-form');
    observer.emitSession(session);
    update.resolve(Either.right(undefined));

    await expect(result).resolves.toBe(true);
    expect(store.passwordRecoveryStatus()).toBe('completed');
  });

  it('does not complete recovery for a replaced session', async () => {
    const newerSession: AuthenticationSession = {
      userId: '00000000-0000-4000-8000-000000000002',
      email: 'newer@omoikane.local',
    };
    const observer = makeSessionObserver();
    const update = makeDeferred<Either.Either<void, AuthenticationError>>();
    const { store } = configureStore({
      observeSessionChanges: observer.observeSessionChanges,
      updatePassword: vi.fn().mockReturnValue(update.promise),
    });

    await store.initialize();
    observer.emitPasswordRecovery(session);

    const result = store.updatePassword('Replacement123!', 'Replacement123!');
    observer.emitSession(newerSession);
    update.resolve(Either.right(undefined));

    await expect(result).resolves.toBe(false);
    expect(store.passwordRecoveryStatus()).toBe('idle');
    expect(store.session()).toEqual(newerSession);
  });

  it('becomes anonymous after sign-out', async () => {
    const { store } = configureStore({
      restoreSession: vi.fn().mockResolvedValue(Either.right(session)),
    });

    await store.initialize();

    const result = await store.signOut();

    expect(result).toBe(true);

    expect(store.status()).toBe('anonymous');

    expect(store.session()).toBeNull();

    expect(store.signOutStatus()).toBe('idle');
  });

  it('preserves the session after failed sign-out', async () => {
    const failure = new AuthenticationUnavailableError({
      operation: 'sign-out',
      cause: new Error('Provider unavailable'),
    });

    const { store } = configureStore({
      restoreSession: vi.fn().mockResolvedValue(Either.right(session)),

      signOut: vi.fn().mockResolvedValue(Either.left(failure)),
    });

    await store.initialize();

    const result = await store.signOut();

    expect(result).toBe(false);

    expect(store.status()).toBe('authenticated');

    expect(store.session()).toEqual(session);

    expect(store.signOutStatus()).toBe('failed');
  });

  it('does not let a stale sign-out result clear a newer observed session', async () => {
    const newerSession: AuthenticationSession = {
      userId: '00000000-0000-4000-8000-000000000002',
      email: 'newer@omoikane.local',
    };

    const observer = makeSessionObserver();
    const signOut = makeDeferred<Either.Either<void, AuthenticationError>>();

    const { store } = configureStore({
      restoreSession: vi.fn().mockResolvedValue(Either.right(session)),

      signOut: vi.fn().mockReturnValue(signOut.promise),
      observeSessionChanges: observer.observeSessionChanges,
    });

    await store.initialize();

    const result = store.signOut();

    observer.emitSession(newerSession);

    signOut.resolve(Either.right(undefined));

    await expect(result).resolves.toBe(true);

    expect(store.session()).toEqual(newerSession);

    expect(store.signOutStatus()).toBe('idle');
  });

  it('unsubscribes when its injection context is destroyed', async () => {
    const { store, stopObserving } = configureStore();

    await store.initialize();

    TestBed.resetTestingModule();

    expect(stopObserving).toHaveBeenCalledOnce();
  });
});
