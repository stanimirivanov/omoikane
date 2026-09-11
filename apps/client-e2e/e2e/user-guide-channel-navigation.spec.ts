import { expect, test } from '@playwright/test';
import {
  seededChannel,
  seededOwner,
  seededWorkspace,
} from '../fixtures/seeded-collaboration';
import { ChannelNavigationPage } from '../pages/channel-navigation.page';
import { WorkspaceNavigationPage } from '../pages/workspace-navigation.page';
import { startAuthenticatedGuide } from '../user-guide/start-authenticated-guide';

test(
  'open a workspace channel',
  { tag: '@user-guide' },
  async ({ baseURL, browser }) => {
    const guide = await startAuthenticatedGuide(browser, {
      baseURL: baseURL ?? 'http://127.0.0.1:4200',
      credentials: seededOwner,
      order: 70,
      slug: 'open-channel',
      summary: 'Choose a channel and enter its conversation.',
      title: 'Open a channel',
    });
    try {
      await guide.page.goto('/', { waitUntil: 'domcontentloaded' });
      const workspaces = new WorkspaceNavigationPage(guide.page);
      await expect(workspaces.workspace(seededWorkspace)).toBeVisible();
      await workspaces.selectWorkspace(seededWorkspace);
      const channels = new ChannelNavigationPage(guide.page, guide);
      await expect(channels.channel(seededChannel)).toBeVisible();
      await channels.selectChannel(seededChannel);
      await expect(channels.heading(seededChannel)).toBeVisible();
      await channels.documentSelectedChannel(seededChannel);
      await guide.finish();
    } catch (error: unknown) {
      await guide.abort();
      throw error;
    }
  }
);
