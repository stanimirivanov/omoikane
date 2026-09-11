import { expect, test } from '@playwright/test';
import { seededOwner } from '../fixtures/seeded-collaboration';
import { AuthenticatedShellPage } from '../pages/authenticated-shell.page';
import { SignInPage } from '../pages/sign-in.page';
import { startAuthenticatedGuide } from '../user-guide/start-authenticated-guide';

test(
  'sign out of Omoikane',
  { tag: '@user-guide' },
  async ({ baseURL, browser }) => {
    const guide = await startAuthenticatedGuide(browser, {
      baseURL: baseURL ?? 'http://127.0.0.1:4200',
      credentials: seededOwner,
      order: 40,
      slug: 'sign-out',
      summary: 'End the current authenticated session safely.',
      title: 'Sign out of Omoikane',
    });

    try {
      await guide.page.goto('/', { waitUntil: 'domcontentloaded' });
      const shell = new AuthenticatedShellPage(guide.page, guide);
      await expect(shell.signOutButton()).toBeVisible();
      await shell.signOut();
      await expect(new SignInPage(guide.page).heading()).toBeVisible();
      await guide.finish();
    } catch (error: unknown) {
      await guide.abort();
      throw error;
    }
  }
);
