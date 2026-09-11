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

  editHistory(content: string): Locator {
    return this.message(content).getByRole('region', {
      name: 'Message edit history',
    });
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

  async editMessage(content: string, replacement: string): Promise<this> {
    const message = this.message(content);
    const edit = message.getByRole('button', { exact: true, name: 'Edit' });
    await performDocumentedAction(
      this.narrator,
      edit,
      {
        body: 'Open a message you authored when its wording needs correction.',
        title: 'Edit your message',
      },
      () => edit.press('Enter')
    );

    // Once edit mode replaces the paragraph with a textarea, the row no longer
    // has the original text content used to locate it.
    const input = this.page.getByLabel('Edit message');
    await performDocumentedAction(
      this.narrator,
      input,
      {
        body: 'Replace the message text while keeping its place in the conversation.',
        title: 'Revise the message',
      },
      () => input.fill(replacement)
    );

    const save = this.page.getByRole('button', { exact: true, name: 'Save' });
    await performDocumentedAction(
      this.narrator,
      save,
      {
        body: 'Save the revision. Omoikane retains its audit history.',
        title: 'Save the revision',
      },
      () => save.click()
    );
    return this;
  }

  async openEditHistory(content: string): Promise<this> {
    const button = this.message(content).getByRole('button', {
      name: 'View edit history',
    });
    await performDocumentedAction(
      this.narrator,
      button,
      {
        body: 'Open the revision history to inspect what the message said before.',
        title: 'View edit history',
      },
      async () => {
        await button.press('Enter');
        await this.editHistory(content).waitFor({ state: 'visible' });
      }
    );
    return this;
  }

  async documentEditHistory(content: string): Promise<void> {
    await documentResult(this.narrator, this.editHistory(content), {
      body: 'The audit trail preserves the previous content and revision time.',
      title: 'Inspect the revision trail',
    });
  }

  async deleteMessage(content: string): Promise<this> {
    const message = this.message(content);
    const remove = message.getByRole('button', { exact: true, name: 'Delete' });
    await performDocumentedAction(
      this.narrator,
      remove,
      {
        body: 'Begin deleting a message that should no longer remain visible.',
        title: 'Delete a message',
      },
      () => remove.press('Enter')
    );
    const confirm = message.getByRole('button', {
      exact: true,
      name: 'Confirm',
    });
    await performDocumentedAction(
      this.narrator,
      confirm,
      {
        body: 'Confirm the destructive action. Its audit record remains preserved.',
        title: 'Confirm deletion',
      },
      () => confirm.click()
    );
    return this;
  }

  async documentDeletedMessage(): Promise<void> {
    await documentResult(
      this.narrator,
      this.page.getByText('Message deleted', { exact: true }).last(),
      {
        body: 'The conversation now shows a deletion marker instead of the original content.',
        title: 'Confirm the deleted message',
      }
    );
  }
}
