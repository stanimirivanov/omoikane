import type { Browser } from '@playwright/test';
import { AuthenticatedShellPage } from '../pages/authenticated-shell.page';
import { SignInPage } from '../pages/sign-in.page';

export interface AuthenticationCredentials {
  readonly email: string;
  readonly password: string;
}

export const authenticatedStorageState = async (
  browser: Browser,
  baseURL: string,
  credentials: AuthenticationCredentials
) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    const signIn = new SignInPage(page);
    await signIn.open();
    await signIn.heading().waitFor({ state: 'visible' });
    await signIn.enterEmail(credentials.email);
    await signIn.enterPassword(credentials.password);
    await signIn.submit();

    const authenticatedShell = new AuthenticatedShellPage(page);
    await authenticatedShell.signOutButton().waitFor({ state: 'visible' });
    return await context.storageState();
  } finally {
    await context.close();
  }
};
