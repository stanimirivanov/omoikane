import type { Locator, Page } from '@playwright/test';
import {
  documentResult,
  performDocumentedAction,
  type GuideNarrator,
} from '../user-guide/guide-narrator';

export class WorkspaceNavigationPage {
  constructor(
    private readonly page: Page,
    private readonly narrator?: GuideNarrator
  ) {}

  heading(name: string): Locator {
    return this.page.getByRole('heading', { exact: true, name });
  }

  channelSelectionPrompt(): Locator {
    return this.page.getByRole('heading', { name: 'Select a channel' });
  }

  workspace(name: string): Locator {
    return this.page
      .getByRole('navigation', { name: 'Accessible workspaces' })
      .getByRole('button', { exact: true, name });
  }

  async selectWorkspace(name: string): Promise<this> {
    const workspace = this.workspace(name);
    await performDocumentedAction(
      this.narrator,
      workspace,
      {
        body: `Choose ${name} to see its channels and current collaboration context.`,
        title: 'Choose a workspace',
      },
      () => workspace.click()
    );
    return this;
  }

  async documentSelectedWorkspace(name: string): Promise<this> {
    await documentResult(this.narrator, this.channelSelectionPrompt(), {
      body: `${name} is now selected. Choose one of its channels to continue into a conversation.`,
      title: 'Use the selected workspace',
    });
    return this;
  }
}
