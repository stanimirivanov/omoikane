import { expect, test } from '@playwright/test';

test('shows startup feedback before Angular is available', async ({
  baseURL,
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: baseURL ?? 'http://127.0.0.1:4200',
    javaScriptEnabled: false,
  });
  const page = await context.newPage();

  try {
    await page.goto('/');

    await expect(page.getByRole('status')).toHaveText('Starting application…');
    await expect(page.locator('.application-startup')).toHaveAttribute(
      'aria-busy',
      'true'
    );
  } finally {
    await context.close();
  }
});

test('hands startup feedback to the activated application route', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(
    page.getByRole('main', { name: 'Loading Omoikane', exact: true })
  ).toHaveCount(0, { timeout: 60_000 });
});
