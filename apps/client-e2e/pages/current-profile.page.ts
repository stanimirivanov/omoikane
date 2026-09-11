import type { Locator, Page } from '@playwright/test';
import {
  documentResult,
  performDocumentedAction,
  type GuideNarrator,
} from '../user-guide/guide-narrator';

export class CurrentProfilePage {
  constructor(
    private readonly page: Page,
    private readonly narrator?: GuideNarrator
  ) {}

  region(): Locator {
    return this.page.getByRole('region', { name: 'Current profile' });
  }

  async editDisplayName(displayName: string): Promise<this> {
    const edit = this.region().getByRole('button', { name: 'Edit profile' });
    await performDocumentedAction(
      this.narrator,
      edit,
      {
        body: 'Open your profile editor from the application header.',
        title: 'Edit your profile',
      },
      () => edit.click()
    );

    const input = this.region().getByLabel('Display name');
    await performDocumentedAction(
      this.narrator,
      input,
      {
        body: 'Choose the name other workspace members should see.',
        title: 'Update your display name',
      },
      () => input.fill(displayName)
    );

    const save = this.region().getByRole('button', { name: 'Save profile' });
    await performDocumentedAction(
      this.narrator,
      save,
      {
        body: 'Save the updated public profile.',
        title: 'Save your profile',
      },
      () => save.click()
    );
    return this;
  }

  async documentDisplayName(displayName: string): Promise<void> {
    await documentResult(
      this.narrator,
      this.region().getByText(displayName, { exact: true }),
      {
        body: 'The application header now uses your updated display name.',
        title: 'Confirm the profile update',
      }
    );
  }
}
