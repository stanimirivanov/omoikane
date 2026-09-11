import type { Locator, Page } from '@playwright/test';
import {
  documentResult,
  performDocumentedAction,
  type GuideNarrator,
} from '../user-guide/guide-narrator';

const escapeRegularExpression = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

export class ChannelNavigationPage {
  constructor(
    private readonly page: Page,
    private readonly narrator?: GuideNarrator
  ) {}

  channel(name: string): Locator {
    return this.page
      .getByRole('navigation', { name: 'Workspace channels' })
      .getByRole('button', {
        name: new RegExp(`^${escapeRegularExpression(name)}`, 'u'),
      });
  }

  async selectChannel(name: string): Promise<this> {
    const channel = this.channel(name);
    await performDocumentedAction(
      this.narrator,
      channel,
      {
        body: `Open the ${name} channel to read and participate in its conversation.`,
        title: 'Open a channel',
      },
      () => channel.click()
    );
    return this;
  }

  heading(name: string): Locator {
    return this.page.getByRole('heading', { exact: true, name });
  }

  async documentSelectedChannel(name: string): Promise<void> {
    await documentResult(this.narrator, this.heading(name), {
      body: `The ${name} conversation is open. You can read its history and compose a message.`,
      title: 'Use the selected channel',
    });
  }
}
