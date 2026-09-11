import type { Locator, Page } from '@playwright/test';
import {
  documentResult,
  performDocumentedAction,
  type GuideNarrator,
} from '../user-guide/guide-narrator';

export class AccountAccessPage {
  constructor(
    private readonly page: Page,
    private readonly narrator?: GuideNarrator
  ) {}

  async open(): Promise<this> {
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });
    return this;
  }

  signUpForm(): Locator {
    return this.page.locator('app-sign-up');
  }

  recoveryForm(): Locator {
    return this.page.locator('app-password-recovery');
  }

  async chooseSignUp(): Promise<this> {
    const button = this.page
      .getByRole('navigation', { name: 'Account access' })
      .getByRole('button', { exact: true, name: 'Create account' });
    await performDocumentedAction(
      this.narrator,
      button,
      {
        body: 'Open account registration when you do not yet have an Omoikane identity.',
        title: 'Choose account registration',
      },
      () => button.click()
    );
    return this;
  }

  async register(email: string, password: string): Promise<this> {
    const form = this.signUpForm();
    const emailInput = form.getByLabel('Email');
    const passwordInput = form.getByLabel('Password');
    await performDocumentedAction(
      this.narrator,
      emailInput,
      {
        body: 'Enter the email address that will identify your new account.',
        title: 'Enter your email address',
      },
      () => emailInput.fill(email)
    );
    await performDocumentedAction(
      this.narrator,
      passwordInput,
      {
        body: 'Choose a strong password. Omoikane masks it while you type.',
        title: 'Choose a password',
      },
      () => passwordInput.fill(password)
    );
    const submit = form.getByRole('button', {
      exact: true,
      name: 'Create account',
    });
    await performDocumentedAction(
      this.narrator,
      submit,
      {
        body: 'Create the account and request an email-confirmation link.',
        title: 'Create the account',
      },
      () => submit.click()
    );
    return this;
  }

  async documentConfirmationRequest(): Promise<void> {
    await documentResult(
      this.narrator,
      this.signUpForm().getByRole('heading', { name: 'Check your email' }),
      {
        body: 'Registration is pending until you follow the confirmation link sent to your email address.',
        title: 'Confirm your email address',
      }
    );
  }

  async choosePasswordRecovery(): Promise<this> {
    const button = this.page.getByRole('button', { name: 'Forgot password?' });
    await performDocumentedAction(
      this.narrator,
      button,
      {
        body: 'Request a recovery link if you cannot use your current password.',
        title: 'Open password recovery',
      },
      () => button.click()
    );
    return this;
  }

  async requestPasswordReset(email: string): Promise<this> {
    const form = this.recoveryForm();
    const input = form.getByLabel('Email');
    await performDocumentedAction(
      this.narrator,
      input,
      {
        body: 'Enter your account email address. The result does not reveal whether an account exists.',
        title: 'Enter your account email',
      },
      () => input.fill(email)
    );
    const submit = form.getByRole('button', { name: 'Send reset link' });
    await performDocumentedAction(
      this.narrator,
      submit,
      {
        body: 'Request a one-time password-reset link.',
        title: 'Send the recovery request',
      },
      () => submit.click()
    );
    return this;
  }

  async documentPasswordResetRequest(): Promise<void> {
    await documentResult(
      this.narrator,
      this.recoveryForm().getByRole('heading', { name: 'Check your email' }),
      {
        body: 'For privacy, Omoikane shows the same response whether or not the address belongs to an account.',
        title: 'Check your email securely',
      }
    );
  }
}
