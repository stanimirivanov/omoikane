import type { Locator, Page } from '@playwright/test';
import type { UserGuideSession } from '../user-guide/user-guide-session';

export class AuthenticatedShellPage {
  private readonly page: Page;
  private readonly guide: UserGuideSession;

  constructor(guide: UserGuideSession) {
    this.guide = guide;
    this.page = guide.page;
  }

  signOutButton(): Locator {
    return this.page.getByRole('button', {
      exact: true,
      name: 'Sign out',
    });
  }

  async documentAuthenticatedSession(): Promise<void> {
    await this.guide.result(this.signOutButton(), {
      body: 'You are signed in. Your profile and account controls are now available in the application header.',
      title: 'Continue in the authenticated application',
    });
  }
}
