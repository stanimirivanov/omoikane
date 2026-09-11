import { expect, test } from '@playwright/test';
import { seededOwner } from '../fixtures/seeded-collaboration';
import { AnalysisRunsPage } from '../pages/analysis-runs.page';
import { startChannelGuide } from '../user-guide/start-channel-guide';

test(
  'configure a Decision Forensics analysis',
  { tag: '@user-guide' },
  async ({ baseURL, browser }) => {
    const guide = await startChannelGuide(browser, {
      baseURL: baseURL ?? 'http://127.0.0.1:4200',
      credentials: seededOwner,
      order: 130,
      slug: 'configure-decision-forensics',
      summary:
        'Open Decision Forensics and understand its bounded evidence period.',
      title: 'Configure Decision Forensics',
    });
    try {
      const analysis = new AnalysisRunsPage(guide.page, guide);
      await analysis.open();
      await expect(analysis.section()).toBeVisible();
      await analysis.documentScope();
      await guide.finish();
    } catch (error: unknown) {
      await guide.abort();
      throw error;
    }
  }
);
