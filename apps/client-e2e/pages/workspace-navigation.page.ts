import type { Locator, Page } from '@playwright/test';
import {
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
}
