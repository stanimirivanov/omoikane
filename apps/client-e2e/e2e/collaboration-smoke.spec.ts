import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  seededChannel,
  seededOwner,
  seededWorkspace,
} from '../fixtures/seeded-collaboration';
import { ChannelMessagesPage } from '../pages/channel-messages.page';
import { ChannelNavigationPage } from '../pages/channel-navigation.page';
import { SignInPage } from '../pages/sign-in.page';
import { WorkspaceNavigationPage } from '../pages/workspace-navigation.page';

const signInSeededOwner = async (page: Page) => {
  const signIn = new SignInPage(page);
  await signIn.open();
  await expect(signIn.heading()).toBeVisible();
  await signIn.enterEmail(seededOwner.email);
  await signIn.enterPassword(seededOwner.password);
  await signIn.submit();

  await expect(
    page.getByRole('heading', { name: 'Workspaces', exact: true })
  ).toBeVisible();
};

const expectNoDocumentOverflow = async (page: Page) => {
  await expect
    .poll(() =>
      page
        .locator('html')
        .evaluate((element) => element.scrollWidth <= element.clientWidth)
    )
    .toBe(true);
};

test('a seeded member can collaborate through the browser and sign out', async ({
  page,
}) => {
  const message = `Browser smoke ${Date.now()}`;

  await signInSeededOwner(page);
  const workspaces = new WorkspaceNavigationPage(page);
  await workspaces.selectWorkspace(seededWorkspace);

  await expect(workspaces.heading(seededWorkspace)).toBeVisible();
  const channels = new ChannelNavigationPage(page);
  await channels.selectChannel(seededChannel);

  const messages = new ChannelMessagesPage(page);
  await expect(messages.composer()).toBeVisible();
  await messages.enterMessage(message);
  await messages.sendMessage();

  await expect(messages.message(message)).toBeVisible();

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();

  await expect(
    page.getByRole('heading', { name: 'Sign in to Omoikane', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Sign out', exact: true })
  ).toHaveCount(0);
});

test.describe('responsive and accessible application shell', () => {
  test.use({
    viewport: { width: 320, height: 720 },
  });

  test('remains keyboard-operable without horizontal overflow', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expectNoDocumentOverflow(page);

    const signIn = page.getByRole('region', { name: 'Sign in to Omoikane' });
    const email = signIn.getByLabel('Email');
    const password = signIn.getByLabel('Password');
    await email.focus();
    await page.keyboard.press('Tab');
    await expect(password).toBeFocused();
    await expect
      .poll(() =>
        password.evaluate((element) => {
          const style =
            element.ownerDocument.defaultView?.getComputedStyle(element);
          return (
            style !== undefined &&
            style.outlineStyle !== 'none' &&
            Number.parseFloat(style.outlineWidth) >= 2
          );
        })
      )
      .toBe(true);

    await email.fill(seededOwner.email);
    await password.fill(seededOwner.password);
    await signIn.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Workspaces', exact: true })
    ).toBeVisible();

    const openWorkspaces = page.getByRole('button', {
      name: 'Open workspace navigation',
    });
    await openWorkspaces.click();
    const closeWorkspaces = page.getByRole('button', {
      name: 'Close workspace navigation',
    });
    await expect
      .poll(() =>
        page
          .locator('.workspace-rail')
          .evaluate((drawer) =>
            drawer.contains(drawer.ownerDocument.activeElement)
          )
      )
      .toBe(true);

    await page.keyboard.press('Escape');
    await expect(closeWorkspaces).toBeHidden();
    await expect(openWorkspaces).toBeFocused();

    await openWorkspaces.click();
    const workspace = page
      .getByRole('navigation', { name: 'Accessible workspaces' })
      .getByRole('button', { name: 'Omoikane Development', exact: true });
    await expect
      .poll(() =>
        workspace.evaluate((element) => {
          const durations =
            element.ownerDocument.defaultView
              ?.getComputedStyle(element)
              .transitionDuration.split(',') ?? [];
          return durations.every(
            (duration: string) => Number.parseFloat(duration) <= 0.001
          );
        })
      )
      .toBe(true);
    await workspace.click();
    await expect(
      page.getByRole('heading', { name: 'Omoikane Development', exact: true })
    ).toBeVisible();

    const openChannels = page.getByRole('button', { name: 'Browse channels' });
    await expect(openChannels).toBeVisible();
    await openChannels.click();
    await expect
      .poll(() =>
        page
          .locator('.channel-sidebar')
          .evaluate((drawer) =>
            drawer.contains(drawer.ownerDocument.activeElement)
          )
      )
      .toBe(true);

    await page
      .getByRole('navigation', { name: 'Workspace channels' })
      .getByRole('button', { name: /^General/u })
      .click();
    await expect(
      page.getByRole('textbox', { name: 'Message', exact: true })
    ).toBeVisible();

    await expectNoDocumentOverflow(page);
  });
});

test.describe('coarse-pointer controls', () => {
  test.use({
    hasTouch: true,
    viewport: { width: 320, height: 720 },
  });

  test('provides minimum-size anonymous interaction targets', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'Sign in to Omoikane', exact: true })
    ).toBeVisible();

    const undersizedTargets = await page
      .locator(
        'button:visible, summary:visible, input:visible, textarea:visible'
      )
      .evaluateAll((elements) =>
        elements
          .map((element) => {
            const rectangle = element.getBoundingClientRect();
            return {
              height: rectangle.height,
              label:
                element.getAttribute('aria-label') ?? element.textContent ?? '',
              width: rectangle.width,
            };
          })
          .filter(({ height, width }) => height < 44 || width < 44)
      );
    expect(undersizedTargets).toEqual([]);
  });
});
