import { expect, test } from '@playwright/test';
import { seededOwner } from '../fixtures/seeded-collaboration';
import { CurrentProfilePage } from '../pages/current-profile.page';
import { startAuthenticatedGuide } from '../user-guide/start-authenticated-guide';

test(
  'edit the current profile',
  { tag: '@user-guide' },
  async ({ baseURL, browser }) => {
    const guide = await startAuthenticatedGuide(browser, {
      baseURL: baseURL ?? 'http://127.0.0.1:4200',
      credentials: seededOwner,
      order: 50,
      slug: 'edit-profile',
      summary: 'Change the display name shown to collaborators.',
      title: 'Edit your profile',
    });

    try {
      await guide.page.goto('/', { waitUntil: 'domcontentloaded' });
      const profile = new CurrentProfilePage(guide.page, guide);
      await expect(profile.region()).toBeVisible();
      await profile.editDisplayName('Omoikane Guide Owner');
      await expect(
        profile.region().getByText('Omoikane Guide Owner', { exact: true })
      ).toBeVisible();
      await profile.documentDisplayName('Omoikane Guide Owner');
      await guide.finish();
    } catch (error: unknown) {
      await guide.abort();
      throw error;
    }
  }
);
