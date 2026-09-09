import type { AuthenticationSession } from '@omoikane/application/authentication';

/**
 * Overall authentication state visible to the application shell.
 */
export type AuthenticationStatus =
  | 'initializing'
  | 'anonymous'
  | 'authenticated';

/**
 * Mutually exclusive presentation selected by the authentication shell.
 *
 * Password recovery intentionally takes precedence over an authenticated
 * session once initialization has completed.
 */
export type AuthenticationShellView =
  | { readonly kind: 'initializing' }
  | { readonly kind: 'password-recovery' }
  | {
      readonly kind: 'authenticated';
      readonly session: AuthenticationSession;
      readonly isSigningOut: boolean;
    }
  | { readonly kind: 'anonymous' };

/**
 * State of one user-triggered authentication operation.
 */
export type AuthenticationOperationStatus = 'idle' | 'pending' | 'failed';

/** State of the account-registration command and its non-error completion. */
export type SignUpStatus =
  | AuthenticationOperationStatus
  | 'confirmation-required';

/** State of resending confirmation and its non-enumerating completion. */
export type ConfirmationEmailResendStatus =
  | AuthenticationOperationStatus
  | 'sent';

/** State of requesting a recovery email and its safe completion notice. */
export type PasswordResetRequestStatus = AuthenticationOperationStatus | 'sent';

/** State of replacing a password after a recovery session is established. */
export type PasswordRecoveryStatus =
  | 'idle'
  | 'ready'
  | 'pending'
  | 'failed'
  | 'completed';

/** Mutually exclusive step rendered by the password-recovery component. */
export type PasswordRecoveryView =
  | { readonly kind: 'update-complete' }
  | { readonly kind: 'update-form'; readonly isSubmitting: boolean }
  | { readonly kind: 'email-sent' }
  | { readonly kind: 'request-form'; readonly isSubmitting: boolean };

/**
 * Registration presentation with correlated confirmation data.
 *
 * A confirmation email is available only in the confirmation-required view,
 * preventing its nullable storage representation from leaking to templates.
 */
export type SignUpView =
  | { readonly kind: 'form'; readonly isSubmitting: boolean }
  | {
      readonly kind: 'confirmation-required';
      readonly email: string;
      readonly isResending: boolean;
      readonly wasResent: boolean;
    };

/**
 * Safe error representation rendered by Angular.
 */
export interface AuthenticationPresentationError {
  readonly message: string;
}

/**
 * State owned by the root authentication store.
 *
 * NgRx exposes each state property as an independently writable signal, so
 * cross-property correlation is enforced by store transitions and projected
 * into discriminated presentation models for readers.
 */
export interface AuthenticationState {
  readonly status: AuthenticationStatus;

  readonly session: AuthenticationSession | null;

  readonly signInStatus: AuthenticationOperationStatus;

  readonly signUpStatus: SignUpStatus;

  readonly confirmationEmail: string | null;

  readonly confirmationEmailResendStatus: ConfirmationEmailResendStatus;

  readonly signOutStatus: AuthenticationOperationStatus;

  readonly passwordResetRequestStatus: PasswordResetRequestStatus;

  readonly passwordRecoveryStatus: PasswordRecoveryStatus;

  readonly error: AuthenticationPresentationError | null;
}

/**
 * Initial state used before session restoration completes.
 */
export const initialAuthenticationState: AuthenticationState = {
  status: 'initializing',
  session: null,
  signInStatus: 'idle',
  signUpStatus: 'idle',
  confirmationEmail: null,
  confirmationEmailResendStatus: 'idle',
  signOutStatus: 'idle',
  passwordResetRequestStatus: 'idle',
  passwordRecoveryStatus: 'idle',
  error: null,
};
