import { expect, test } from '@playwright/test';
import { seededOwner, seededWorkspace } from '../fixtures/seeded-collaboration';
import { WorkspaceManagementPage } from '../pages/workspace-management.page';
import { WorkspaceNavigationPage } from '../pages/workspace-navigation.page';
import { startAuthenticatedGuide } from '../user-guide/start-authenticated-guide';

test(
  'change a workspace member role',
  { tag: '@user-guide' },
  async ({ baseURL, browser }) => {
    const guide = await startAuthenticatedGuide(browser, {
      baseURL: baseURL ?? 'http://127.0.0.1:4200',
      credentials: seededOwner,
      order: 170,
      slug: 'change-member-role',
      summary: 'Promote a workspace member and restore their original role.',
      title: 'Change a member role',
    });
    try {
      await guide.page.goto('/', { waitUntil: 'domcontentloaded' });
      const workspaces = new WorkspaceNavigationPage(guide.page);
      await expect(workspaces.workspace(seededWorkspace)).toBeVisible();
      await workspaces.selectWorkspace(seededWorkspace);
      const management = new WorkspaceManagementPage(guide.page, guide);
      await management.open();
      await expect(management.member('Workspace Member')).toBeVisible();
      await management.promoteAndRestoreMember('Workspace Member');
      await guide.finish();
    } catch (error: unknown) {
      await guide.abort();
      throw error;
    }
  }
);
