import { expect, test } from '@playwright/test';
import { seededOwner } from '../fixtures/seeded-collaboration';
import { WorkspaceManagementPage } from '../pages/workspace-management.page';
import { startAuthenticatedGuide } from '../user-guide/start-authenticated-guide';

const createdName = 'Guide Planning';
const updatedName = 'Guide Planning Archive';

test(
  'manage a workspace lifecycle',
  { tag: '@user-guide' },
  async ({ baseURL, browser }) => {
    const guide = await startAuthenticatedGuide(browser, {
      baseURL: baseURL ?? 'http://127.0.0.1:4200',
      credentials: seededOwner,
      order: 140,
      slug: 'manage-workspace',
      summary: 'Create, rename, and archive a workspace.',
      title: 'Create and archive a workspace',
    });
    try {
      await guide.page.goto('/', { waitUntil: 'domcontentloaded' });
      const management = new WorkspaceManagementPage(guide.page, guide);
      await management.open();
      await expect(management.panel()).toBeVisible();
      await management.create(
        createdName,
        'guide-planning',
        'Planning space created by the executable guide.'
      );
      await expect(
        guide.page.getByRole('heading', { exact: true, name: createdName })
      ).toBeVisible();
      await management.editName(updatedName);
      await expect(
        guide.page.getByRole('heading', { exact: true, name: updatedName })
      ).toBeVisible();
      await management.archive(updatedName);
      await expect(
        guide.page.getByRole('heading', { name: 'Your workspaces' })
      ).toBeVisible();
      await management.documentArchived();
      await guide.finish();
    } catch (error: unknown) {
      await guide.abort();
      throw error;
    }
  }
);
