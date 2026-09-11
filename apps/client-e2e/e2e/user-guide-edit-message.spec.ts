import { expect, test } from '@playwright/test';
import { seededOwner } from '../fixtures/seeded-collaboration';
import { ChannelMessagesPage } from '../pages/channel-messages.page';
import { startChannelGuide } from '../user-guide/start-channel-guide';

const original = 'This message was created by the workspace owner.';
const replacement =
  'This message was created by the workspace owner and later clarified.';

test(
  'edit a message and inspect its history',
  { tag: '@user-guide' },
  async ({ baseURL, browser }) => {
    const guide = await startChannelGuide(browser, {
      baseURL: baseURL ?? 'http://127.0.0.1:4200',
      credentials: seededOwner,
      order: 100,
      slug: 'edit-message',
      summary: 'Correct a message and inspect its preserved revision history.',
      title: 'Edit a message',
    });
    try {
      const messages = new ChannelMessagesPage(guide.page, guide);
      await expect(messages.message(original)).toBeVisible();
      await messages.editMessage(original, replacement);
      await expect(messages.message(replacement)).toBeVisible();
      await messages.openEditHistory(replacement);
      await guide.finish();
    } catch (error: unknown) {
      await guide.abort();
      throw error;
    }
  }
);
