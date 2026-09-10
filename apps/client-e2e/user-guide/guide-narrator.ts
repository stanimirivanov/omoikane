import type { Locator } from '@playwright/test';

export interface GuideStepDefinition {
  readonly body: string;
  readonly title: string;
}

export interface GuideNarrator {
  action(
    target: Locator,
    step: GuideStepDefinition,
    perform: () => Promise<void>
  ): Promise<void>;
  result(target: Locator, step: GuideStepDefinition): Promise<void>;
}

export const performDocumentedAction = async (
  narrator: GuideNarrator | undefined,
  target: Locator,
  step: GuideStepDefinition,
  perform: () => Promise<void>
): Promise<void> => {
  if (narrator === undefined) {
    await perform();
    return;
  }

  await narrator.action(target, step, perform);
};

export const documentResult = async (
  narrator: GuideNarrator | undefined,
  target: Locator,
  step: GuideStepDefinition
): Promise<void> => {
  await narrator?.result(target, step);
};
