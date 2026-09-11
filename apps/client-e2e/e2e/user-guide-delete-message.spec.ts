import { expect, test } from '@playwright/test';
import { seededOwner } from '../fixtures/seeded-collaboration';
import { ChannelMessagesPage } from '../pages/channel-messages.page';
import { startChannelGuide } from '../user-guide/start-channel-guide';

const disposableMessage =
  'Welcome to the local Omoikane development workspace.';

test(
  'delete a channel message',
  { tag: '@user-guide' },
  async ({ baseURL, browser }) => {
    const guide = await startChannelGuide(browser, {
      baseURL: baseURL ?? 'http://127.0.0.1:4200',
      credentials: seededOwner,
      order: 110,
      slug: 'delete-message',
      summary: 'Remove a message while retaining an auditable deletion marker.',
      title: 'Delete a message',
    });
    try {
      const messages = new ChannelMessagesPage(guide.page, guide);
      await expect(messages.message(disposableMessage)).toBeVisible();
      await messages.deleteMessage(disposableMessage);
      await expect(
        guide.page.getByText('Message deleted', { exact: true })
      ).toBeVisible();
      await messages.documentDeletedMessage();
      await guide.finish();
    } catch (error: unknown) {
      await guide.abort();
      throw error;
    }
  }
);
