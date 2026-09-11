import type { Locator, Page } from '@playwright/test';
import {
  documentResult,
  performDocumentedAction,
  type GuideNarrator,
} from '../user-guide/guide-narrator';

export class WorkspaceSearchPage {
  constructor(
    private readonly page: Page,
    private readonly narrator?: GuideNarrator
  ) {}

  panel(): Locator {
    return this.page.locator('#workspace-context-panel');
  }

  async open(): Promise<this> {
    const button = this.page.getByRole('button', {
      name: 'Search workspace messages',
    });
    await performDocumentedAction(
      this.narrator,
      button,
      {
        body: 'Open workspace search to find messages across accessible channels.',
        title: 'Open message search',
      },
      () => button.click()
    );
    return this;
  }

  async search(query: string): Promise<this> {
    const input = this.panel().getByLabel('Search this workspace');
    await performDocumentedAction(
      this.narrator,
      input,
      {
        body: `Search for messages containing “${query}”.`,
        title: 'Enter a search phrase',
      },
      () => input.fill(query)
    );
    const button = this.panel().getByRole('button', {
      exact: true,
      name: 'Search',
    });
    await performDocumentedAction(
      this.narrator,
      button,
      {
        body: 'Run the search within the selected workspace.',
        title: 'Search the workspace',
      },
      () => button.click()
    );
    return this;
  }

  result(content: string): Locator {
    return this.panel().getByRole('button').filter({ hasText: content });
  }

  async openResult(content: string): Promise<this> {
    const result = this.result(content);
    await documentResult(this.narrator, result, {
      body: 'Search results show the source channel, date, and matching message text.',
      title: 'Review the matching messages',
    });
    await performDocumentedAction(
      this.narrator,
      result,
      {
        body: 'Open a result to return to its channel and focus the source message.',
        title: 'Open a search result',
      },
      () => result.click()
    );
    return this;
  }

  focusedResult(): Locator {
    return this.page.getByText('Selected search result', { exact: true });
  }

  async documentFocusedResult(): Promise<void> {
    await documentResult(this.narrator, this.focusedResult(), {
      body: 'The source message is focused above the channel history so you can inspect its context.',
      title: 'Inspect the source message',
    });
  }
}
