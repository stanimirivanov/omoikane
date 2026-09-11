import { expect, test } from '@playwright/test';
import { seededOwner, seededWorkspace } from '../fixtures/seeded-collaboration';
import { WorkspaceManagementPage } from '../pages/workspace-management.page';
import { WorkspaceNavigationPage } from '../pages/workspace-navigation.page';
import { startAuthenticatedGuide } from '../user-guide/start-authenticated-guide';

test(
  'invite and cancel a workspace collaborator',
  { tag: '@user-guide' },
  async ({ baseURL, browser }) => {
    const guide = await startAuthenticatedGuide(browser, {
      baseURL: baseURL ?? 'http://127.0.0.1:4200',
      credentials: seededOwner,
      order: 160,
      slug: 'manage-invitation',
      summary:
        'Invite a collaborator by username and cancel a pending invitation.',
      title: 'Manage a workspace invitation',
    });
    try {
      await guide.page.goto('/', { waitUntil: 'domcontentloaded' });
      const workspaces = new WorkspaceNavigationPage(guide.page);
      await expect(workspaces.workspace(seededWorkspace)).toBeVisible();
      await workspaces.selectWorkspace(seededWorkspace);
      const management = new WorkspaceManagementPage(guide.page, guide);
      await management.open();
      await management.inviteAndCancel('workspace-outsider');
      await guide.finish();
    } catch (error: unknown) {
      await guide.abort();
      throw error;
    }
  }
);
