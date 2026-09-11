import type { Browser } from '@playwright/test';
import {
  authenticatedStorageState,
  type AuthenticationCredentials,
} from '../support/authenticated-storage-state';
import { UserGuideSession, type StartGuideOptions } from './user-guide-session';

interface StartAuthenticatedGuideOptions
  extends Omit<StartGuideOptions, 'storageState'> {
  readonly credentials: AuthenticationCredentials;
}

/**
 * Performs authentication before the guide recording boundary and transfers
 * only browser storage state into the recorded context.
 */
export const startAuthenticatedGuide = async (
  browser: Browser,
  options: StartAuthenticatedGuideOptions
): Promise<UserGuideSession> => {
  const storageState = await authenticatedStorageState(
    browser,
    options.baseURL,
    options.credentials
  );

  return UserGuideSession.start(browser, {
    baseURL: options.baseURL,
    order: options.order,
    slug: options.slug,
    storageState,
    summary: options.summary,
    title: options.title,
  });
};
