import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const openAnonymousSignIn = async (
  page: Page,
  viewport: { readonly width: number; readonly height: number }
) => {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: 'Sign in to Omoikane', exact: true })
  ).toBeVisible();
};

test.describe('anonymous visual contract', () => {
  test('matches the desktop sign-in baseline', async ({ page }) => {
    await openAnonymousSignIn(page, { width: 1440, height: 900 });

    await expect(page).toHaveScreenshot(
      `anonymous-sign-in-desktop-${process.platform}.png`,
      {
        fullPage: true,
      }
    );
  });

  test('matches the mobile sign-in baseline', async ({ page }) => {
    await openAnonymousSignIn(page, { width: 390, height: 844 });

    await expect(page).toHaveScreenshot('anonymous-sign-in-mobile.png', {
      fullPage: true,
    });
  });
});
