import { expect, test } from '@playwright/test';
import { seededOwner } from '../fixtures/seeded-collaboration';
import { AccountAccessPage } from '../pages/account-access.page';
import { UserGuideSession } from '../user-guide/user-guide-session';

test(
  'request a password reset',
  { tag: '@user-guide' },
  async ({ baseURL, browser }) => {
    const guide = await UserGuideSession.start(browser, {
      baseURL: baseURL ?? 'http://127.0.0.1:4200',
      order: 30,
      slug: 'request-password-reset',
      summary: 'Request a private, one-time password recovery link.',
      title: 'Request a password reset',
    });

    try {
      const account = new AccountAccessPage(guide.page, guide);
      await account.open();
      await account.choosePasswordRecovery();
      await expect(account.recoveryForm()).toBeVisible();
      await account.requestPasswordReset(seededOwner.email);
      await expect(
        account
          .recoveryForm()
          .getByRole('heading', { name: 'Check your email' })
      ).toBeVisible();
      await account.documentPasswordResetRequest();
      await guide.finish();
    } catch (error: unknown) {
      await guide.abort();
      throw error;
    }
  }
);
