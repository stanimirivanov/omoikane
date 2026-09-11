import { expect, test } from '@playwright/test';
import { seededOwner, seededWorkspace } from '../fixtures/seeded-collaboration';
import { WorkspaceNavigationPage } from '../pages/workspace-navigation.page';
import { startAuthenticatedGuide } from '../user-guide/start-authenticated-guide';

const applicationURL = (baseURL: string | undefined) =>
  baseURL ?? 'http://127.0.0.1:4200';

test(
  'open an accessible workspace',
  { tag: '@user-guide' },
  async ({ baseURL, browser }) => {
    const guide = await startAuthenticatedGuide(browser, {
      baseURL: applicationURL(baseURL),
      credentials: seededOwner,
      order: 20,
      slug: 'open-workspace',
      summary:
        'Choose an accessible workspace and enter its collaboration context.',
      title: 'Open a workspace',
    });

    try {
      await guide.page.goto('/', { waitUntil: 'domcontentloaded' });

      const workspaces = new WorkspaceNavigationPage(guide.page, guide);
      await expect(workspaces.workspace(seededWorkspace)).toBeVisible();
      await workspaces.selectWorkspace(seededWorkspace);
      await expect(workspaces.heading(seededWorkspace)).toBeVisible();
      await expect(workspaces.channelSelectionPrompt()).toBeVisible();
      await workspaces.documentSelectedWorkspace(seededWorkspace);

      await guide.finish();
    } catch (error: unknown) {
      await guide.abort();
      throw error;
    }
  }
);
