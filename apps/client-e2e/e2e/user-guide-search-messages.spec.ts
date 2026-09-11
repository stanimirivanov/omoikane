import { expect, test } from '@playwright/test';
import { seededOwner } from '../fixtures/seeded-collaboration';
import { WorkspaceSearchPage } from '../pages/workspace-search.page';
import { startChannelGuide } from '../user-guide/start-channel-guide';

const matchingMessage = 'Angular, Effect, and Supabase foundations';

test(
  'search workspace messages',
  { tag: '@user-guide' },
  async ({ baseURL, browser }) => {
    const guide = await startChannelGuide(browser, {
      baseURL: baseURL ?? 'http://127.0.0.1:4200',
      credentials: seededOwner,
      order: 90,
      slug: 'search-messages',
      summary:
        'Find a message across the selected workspace and open its context.',
      title: 'Search workspace messages',
    });
    try {
      const search = new WorkspaceSearchPage(guide.page, guide);
      await search.open();
      await expect(search.panel()).toBeVisible();
      await search.search('Angular');
      await expect(search.result(matchingMessage)).toBeVisible();
      await search.openResult(matchingMessage);
      await expect(search.focusedResult()).toBeVisible();
      await search.documentFocusedResult();
      await guide.finish();
    } catch (error: unknown) {
      await guide.abort();
      throw error;
    }
  }
);
