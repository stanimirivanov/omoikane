import { expect, type Browser } from '@playwright/test';
import {
  seededChannel,
  seededWorkspace,
} from '../fixtures/seeded-collaboration';
import { ChannelNavigationPage } from '../pages/channel-navigation.page';
import { WorkspaceNavigationPage } from '../pages/workspace-navigation.page';
import {
  startAuthenticatedGuide,
  type StartAuthenticatedGuideOptions,
} from './start-authenticated-guide';

/**
 * Establishes the shared collaboration context before a recorded workflow.
 * Authentication remains outside the recording; workspace and channel
 * navigation are setup actions unless the guide is specifically about them.
 */
export const startChannelGuide = async (
  browser: Browser,
  options: StartAuthenticatedGuideOptions
) => {
  const guide = await startAuthenticatedGuide(browser, options);
  await guide.page.goto('/', { waitUntil: 'domcontentloaded' });

  const workspaces = new WorkspaceNavigationPage(guide.page);
  await expect(workspaces.workspace(seededWorkspace)).toBeVisible();
  await workspaces.selectWorkspace(seededWorkspace);

  const channels = new ChannelNavigationPage(guide.page);
  await expect(channels.channel(seededChannel)).toBeVisible();
  await channels.selectChannel(seededChannel);

  return guide;
};
