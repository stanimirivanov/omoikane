import type { Locator, Page } from '@playwright/test';
import {
  documentResult,
  type GuideNarrator,
} from '../user-guide/guide-narrator';

export class AuthenticatedShellPage {
  private readonly page: Page;
  private readonly narrator: GuideNarrator | undefined;

  constructor(page: Page, narrator?: GuideNarrator) {
    this.narrator = narrator;
    this.page = page;
  }

  signOutButton(): Locator {
    return this.page.getByRole('button', {
      exact: true,
      name: 'Sign out',
    });
  }

  async documentAuthenticatedSession(): Promise<void> {
    await documentResult(this.narrator, this.signOutButton(), {
      body: 'You are signed in. Your profile and account controls are now available in the application header.',
      title: 'Continue in the authenticated application',
    });
  }
}
