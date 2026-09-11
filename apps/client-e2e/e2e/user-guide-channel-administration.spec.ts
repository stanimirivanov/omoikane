import { expect, test } from '@playwright/test';
import { seededOwner, seededWorkspace } from '../fixtures/seeded-collaboration';
import { ChannelManagementPage } from '../pages/channel-management.page';
import { WorkspaceNavigationPage } from '../pages/workspace-navigation.page';
import { startAuthenticatedGuide } from '../user-guide/start-authenticated-guide';

const createdName = 'Guide Notes';
const updatedName = 'Guide Archive';

test(
  'manage a channel lifecycle',
  { tag: '@user-guide' },
  async ({ baseURL, browser }) => {
    const guide = await startAuthenticatedGuide(browser, {
      baseURL: baseURL ?? 'http://127.0.0.1:4200',
      credentials: seededOwner,
      order: 150,
      slug: 'manage-channel',
      summary: 'Create, rename, archive, and restore a workspace channel.',
      title: 'Manage a channel lifecycle',
    });
    try {
      await guide.page.goto('/', { waitUntil: 'domcontentloaded' });
      const workspaces = new WorkspaceNavigationPage(guide.page);
      await expect(workspaces.workspace(seededWorkspace)).toBeVisible();
      await workspaces.selectWorkspace(seededWorkspace);
      const management = new ChannelManagementPage(guide.page, guide);
      await management.create(createdName, 'guide-notes');
      await expect(
        guide.page.getByRole('heading', { exact: true, name: createdName })
      ).toBeVisible();
      await management.rename(updatedName);
      await expect(
        guide.page.getByRole('heading', { exact: true, name: updatedName })
      ).toBeVisible();
      await management.archive(updatedName);
      await expect(management.archivedChannel(updatedName)).toBeVisible();
      await management.restore(updatedName);
      await expect(management.archivedChannel(updatedName)).toBeHidden();
      await management.documentRestored(updatedName);
      await guide.finish();
    } catch (error: unknown) {
      await guide.abort();
      throw error;
    }
  }
);
