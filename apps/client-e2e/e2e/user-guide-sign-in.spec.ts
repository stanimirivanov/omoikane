import { expect, test } from '@playwright/test';
import { seededOwner } from '../fixtures/seeded-collaboration';
import { AuthenticatedShellPage } from '../pages/authenticated-shell.page';
import { SignInPage } from '../pages/sign-in.page';
import { UserGuideSession } from '../user-guide/user-guide-session';

test(
  'sign in with an existing account',
  { tag: '@user-guide' },
  async ({ baseURL, browser }) => {
    const guide = await UserGuideSession.start(browser, {
      baseURL: baseURL ?? 'http://127.0.0.1:4200',
      order: 10,
      slug: 'sign-in',
      summary:
        'Use an existing Omoikane account to enter the authenticated application.',
      title: 'Sign in to Omoikane',
    });

    try {
      const signIn = new SignInPage(guide.page, guide);
      await signIn.open();
      await expect(signIn.heading()).toBeVisible();
      await signIn.enterEmail(seededOwner.email);
      await signIn.enterPassword(seededOwner.password);
      await signIn.submit();

      const authenticatedShell = new AuthenticatedShellPage(guide.page, guide);
      await expect(authenticatedShell.signOutButton()).toBeVisible();
      await authenticatedShell.documentAuthenticatedSession();

      await guide.finish();
    } catch (error: unknown) {
      await guide.abort();
      throw error;
    }
  }
);
