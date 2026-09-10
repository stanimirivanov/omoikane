import { expect, test } from '@playwright/test';
import {
  seededChannel,
  seededOwner,
  seededWorkspace,
} from '../fixtures/seeded-collaboration';
import { AuthenticatedShellPage } from '../pages/authenticated-shell.page';
import { ChannelMessagesPage } from '../pages/channel-messages.page';
import { ChannelNavigationPage } from '../pages/channel-navigation.page';
import { WorkspaceNavigationPage } from '../pages/workspace-navigation.page';
import { authenticatedStorageState } from '../support/authenticated-storage-state';
import { UserGuideSession } from '../user-guide/user-guide-session';

const guideMessage = 'Hello from the Omoikane user guide.';
const applicationURL = (baseURL: string | undefined) =>
  baseURL ?? 'http://127.0.0.1:4200';

test(
  'send a message to a workspace channel',
  { tag: '@user-guide' },
  async ({ baseURL, browser }) => {
    const resolvedApplicationURL = applicationURL(baseURL);
    const storageState = await authenticatedStorageState(
      browser,
      resolvedApplicationURL,
      seededOwner
    );
    const guide = await UserGuideSession.start(browser, {
      baseURL: resolvedApplicationURL,
      order: 20,
      slug: 'send-channel-message',
      storageState,
      summary:
        'Choose a workspace channel and publish a message to its conversation.',
      title: 'Send a channel message',
    });

    try {
      await guide.page.goto('/', { waitUntil: 'domcontentloaded' });
      const authenticatedShell = new AuthenticatedShellPage(guide.page);
      await expect(authenticatedShell.signOutButton()).toBeVisible();

      const workspaces = new WorkspaceNavigationPage(guide.page, guide);
      await expect(workspaces.workspace(seededWorkspace)).toBeVisible();
      await workspaces.selectWorkspace(seededWorkspace);
      await expect(workspaces.heading(seededWorkspace)).toBeVisible();

      const channels = new ChannelNavigationPage(guide.page, guide);
      await expect(channels.channel(seededChannel)).toBeVisible();
      await channels.selectChannel(seededChannel);

      const messages = new ChannelMessagesPage(guide.page, guide);
      await expect(messages.composer()).toBeVisible();
      await messages.enterMessage(guideMessage);
      await messages.sendMessage();
      await expect(messages.message(guideMessage)).toBeVisible();
      await messages.documentMessage(guideMessage);

      await guide.finish();
    } catch (error: unknown) {
      await guide.abort();
      throw error;
    }
  }
);
