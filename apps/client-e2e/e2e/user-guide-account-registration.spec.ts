import { expect, test } from '@playwright/test';
import { AccountAccessPage } from '../pages/account-access.page';
import { UserGuideSession } from '../user-guide/user-guide-session';

test(
  'request a new account',
  { tag: '@user-guide' },
  async ({ baseURL, browser }) => {
    const guide = await UserGuideSession.start(browser, {
      baseURL: baseURL ?? 'http://127.0.0.1:4200',
      order: 20,
      slug: 'create-account',
      summary: 'Create an Omoikane account and request its confirmation email.',
      title: 'Create an account',
    });

    try {
      const account = new AccountAccessPage(guide.page, guide);
      await account.open();
      await account.chooseSignUp();
      await expect(account.signUpForm()).toBeVisible();
      await account.register(
        'guide-reader@omoikane.local',
        'GuidePassword123!'
      );
      await expect(
        account.signUpForm().getByRole('heading', { name: 'Check your email' })
      ).toBeVisible();
      await account.documentConfirmationRequest();
      await guide.finish();
    } catch (error: unknown) {
      await guide.abort();
      throw error;
    }
  }
);
