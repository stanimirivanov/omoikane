export type BrowserScenarioMode = 'test-only' | 'user-guide';

const modeEnvironmentVariable = 'OMOIKANE_E2E_MODE';

export const browserScenarioMode = (): BrowserScenarioMode => {
  const configuredMode = process.env[modeEnvironmentVariable]?.trim();

  if (configuredMode === undefined || configuredMode === 'test-only') {
    return 'test-only';
  }

  if (configuredMode === 'user-guide') {
    return configuredMode;
  }

  throw new Error(
    `${modeEnvironmentVariable} must be either "test-only" or "user-guide".`
  );
};
