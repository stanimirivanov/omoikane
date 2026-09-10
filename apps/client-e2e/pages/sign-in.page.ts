import type { Locator, Page } from '@playwright/test';
import type { UserGuideSession } from '../user-guide/user-guide-session';

export class SignInPage {
  private readonly page: Page;
  private readonly guide: UserGuideSession;

  constructor(guide: UserGuideSession) {
    this.guide = guide;
    this.page = guide.page;
  }

  async open(): Promise<this> {
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });
    return this;
  }

  heading(): Locator {
    return this.page.getByRole('heading', {
      exact: true,
      name: 'Sign in to Omoikane',
    });
  }

  async enterEmail(email: string): Promise<this> {
    const input = this.signInRegion().getByLabel('Email');
    await this.guide.action(
      input,
      {
        body: 'Enter the email address associated with your Omoikane account.',
        title: 'Enter your email address',
      },
      () => input.fill(email)
    );
    return this;
  }

  async enterPassword(password: string): Promise<this> {
    const input = this.signInRegion().getByLabel('Password');
    await this.guide.action(
      input,
      {
        body: 'Enter your password. Omoikane masks it while you type.',
        title: 'Enter your password',
      },
      () => input.fill(password)
    );
    return this;
  }

  async submit(): Promise<void> {
    const button = this.signInRegion().getByRole('button', {
      exact: true,
      name: 'Sign in',
    });
    await this.guide.action(
      button,
      {
        body: 'Sign in to load the workspaces available to your account.',
        title: 'Sign in',
      },
      () => button.click()
    );
  }

  private signInRegion() {
    return this.page.getByRole('region', { name: 'Sign in to Omoikane' });
  }
}
