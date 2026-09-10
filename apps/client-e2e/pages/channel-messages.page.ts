import type { Locator, Page } from '@playwright/test';
import {
  documentResult,
  performDocumentedAction,
  type GuideNarrator,
} from '../user-guide/guide-narrator';

export class ChannelMessagesPage {
  constructor(
    private readonly page: Page,
    private readonly narrator?: GuideNarrator
  ) {}

  composer(): Locator {
    return this.page.getByRole('textbox', { exact: true, name: 'Message' });
  }

  message(content: string): Locator {
    return this.page.getByRole('listitem').filter({ hasText: content }).last();
  }

  async enterMessage(content: string): Promise<this> {
    const composer = this.composer();
    await performDocumentedAction(
      this.narrator,
      composer,
      {
        body: 'Write the message you want to share with everyone in this channel.',
        title: 'Write a message',
      },
      () => composer.fill(content)
    );
    return this;
  }

  async sendMessage(): Promise<this> {
    const send = this.page.getByRole('button', { exact: true, name: 'Send' });
    await performDocumentedAction(
      this.narrator,
      send,
      {
        body: 'Send the completed message to the channel.',
        title: 'Send the message',
      },
      () => send.click()
    );
    return this;
  }

  async documentMessage(content: string): Promise<void> {
    await documentResult(this.narrator, this.message(content), {
      body: 'The message now appears in the conversation and is available to other channel members.',
      title: 'Confirm the published message',
    });
  }
}
