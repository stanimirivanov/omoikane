import type { Locator, Page } from '@playwright/test';
import {
  documentResult,
  performDocumentedAction,
  type GuideNarrator,
} from '../user-guide/guide-narrator';

export class ChannelManagementPage {
  constructor(
    private readonly page: Page,
    private readonly narrator?: GuideNarrator
  ) {}

  async create(name: string, slug: string): Promise<this> {
    const create = this.page
      .getByRole('button', { name: 'Create channel' })
      .first();
    await performDocumentedAction(
      this.narrator,
      create,
      {
        body: 'Create a focused conversation area inside the selected workspace.',
        title: 'Create a channel',
      },
      () => create.click()
    );
    await this.page.getByLabel('Channel name').fill(name);
    await this.page.getByLabel('Channel URL').fill(slug);
    await this.page
      .getByLabel('Description')
      .fill('Executable guide lifecycle channel');
    await this.page
      .getByRole('button', { exact: true, name: 'Create channel' })
      .last()
      .press('Enter');
    return this;
  }

  async rename(name: string): Promise<this> {
    await this.page.getByRole('button', { name: 'Edit channel' }).click();
    const input = this.page.getByLabel('Channel name');
    await performDocumentedAction(
      this.narrator,
      input,
      {
        body: 'Rename a channel when its conversation purpose changes.',
        title: 'Rename the channel',
      },
      async () => {
        await input.fill(name);
        await input.press('Enter');
        await this.page
          .getByRole('heading', { exact: true, name })
          .waitFor({ state: 'visible' });
      }
    );
    return this;
  }

  async archive(name: string): Promise<this> {
    await this.page
      .getByRole('button', { name: 'Archive channel' })
      .press('Enter');
    const confirm = this.page.getByRole('button', { name: 'Confirm archive' });
    await performDocumentedAction(
      this.narrator,
      confirm,
      {
        body: `Archive ${name} while preserving its messages and audit history.`,
        title: 'Archive the channel',
      },
      async () => {
        await confirm.click();
        await this.archivedChannel(name).waitFor({ state: 'visible' });
      }
    );
    return this;
  }

  archivedChannel(name: string): Locator {
    return this.page
      .getByRole('list', { name: 'Archived channels' })
      .getByRole('listitem')
      .filter({ hasText: name });
  }

  async restore(name: string): Promise<this> {
    const card = this.archivedChannel(name);
    const restore = card.getByRole('button', { name: `Restore ${name}` });
    await performDocumentedAction(
      this.narrator,
      restore,
      {
        body: `Restore ${name} to active navigation while preserving its conversation history.`,
        title: 'Restore the channel',
      },
      async () => {
        await restore.click();
        await card.getByRole('button', { name: 'Confirm restoration' }).click();
        await this.archivedChannel(name).waitFor({ state: 'hidden' });
      }
    );
    return this;
  }

  async documentRestored(name: string): Promise<void> {
    await documentResult(
      this.narrator,
      this.page.getByRole('button', { name: new RegExp(`^${name}`, 'u') }),
      {
        body: `${name} is available in channel navigation again.`,
        title: 'Confirm channel restoration',
      }
    );
  }
}
