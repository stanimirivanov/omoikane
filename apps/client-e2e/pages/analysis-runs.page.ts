import type { Locator, Page } from '@playwright/test';
import {
  documentResult,
  performDocumentedAction,
  type GuideNarrator,
} from '../user-guide/guide-narrator';

export class AnalysisRunsPage {
  constructor(
    private readonly page: Page,
    private readonly narrator?: GuideNarrator
  ) {}

  section(): Locator {
    return this.page.locator('app-analysis-runs');
  }

  async open(): Promise<this> {
    const disclosure = this.page
      .locator('details.analysis-disclosure')
      .locator('summary');
    await performDocumentedAction(
      this.narrator,
      disclosure,
      {
        body: 'Open Decision Forensics for the selected channel.',
        title: 'Open Decision Forensics',
      },
      () => disclosure.click()
    );
    return this;
  }

  async documentScope(): Promise<void> {
    await documentResult(
      this.narrator,
      this.section().getByRole('group', { name: 'Analysis period' }),
      {
        body: 'Choose a past period of up to 31 days. Start is included and end is excluded.',
        title: 'Define the evidence period',
      }
    );
  }
}
