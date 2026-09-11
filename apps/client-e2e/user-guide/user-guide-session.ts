import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { workspaceRoot } from '@nx/devkit';
import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Locator,
  Page,
  Video,
} from '@playwright/test';
import { browserScenarioMode } from './guide-mode';
import type { GuideNarrator, GuideStepDefinition } from './guide-narrator';

interface GuideDefinition {
  readonly order: number;
  readonly slug: string;
  readonly summary: string;
  readonly title: string;
}

interface RecordedGuideStep extends GuideStepDefinition {
  readonly image: string;
}

export interface StartGuideOptions extends GuideDefinition {
  readonly baseURL: string;
  readonly storageState?: BrowserContextOptions['storageState'];
}

const guideOutputRoot = path.join(workspaceRoot, 'dist/user-guide');
const guideViewport = { height: 900, width: 1440 } as const;

/**
 * Adds optional documentation behavior to one executable browser scenario.
 *
 * Test-only mode performs actions without delays or generated artifacts. Guide
 * mode owns a dedicated BrowserContext so start() and finish() are also the
 * exact native Playwright video boundaries.
 */
export class UserGuideSession implements GuideNarrator {
  readonly page: Page;

  private readonly context: BrowserContext;
  private readonly definition: GuideDefinition;
  private readonly guideDirectory: string;
  private readonly isGuideMode: boolean;
  private readonly steps: RecordedGuideStep[] = [];
  private readonly video: Video | null;
  private contextClosed = false;

  private constructor(
    context: BrowserContext,
    page: Page,
    definition: GuideDefinition,
    isGuideMode: boolean,
    video: Video | null
  ) {
    this.context = context;
    this.page = page;
    this.definition = definition;
    this.guideDirectory = path.join(guideOutputRoot, definition.slug);
    this.isGuideMode = isGuideMode;
    this.video = video;
  }

  static async start(
    browser: Browser,
    options: StartGuideOptions
  ): Promise<UserGuideSession> {
    const isGuideMode = browserScenarioMode() === 'user-guide';
    const guideDirectory = path.join(guideOutputRoot, options.slug);

    if (isGuideMode) {
      await rm(guideDirectory, { force: true, recursive: true });
      await mkdir(path.join(guideDirectory, 'assets'), { recursive: true });
    }

    const context = await browser.newContext({
      baseURL: options.baseURL,
      colorScheme: 'light',
      locale: 'en-US',
      reducedMotion: 'reduce',
      storageState: options.storageState,
      timezoneId: 'UTC',
      viewport: guideViewport,
      ...(isGuideMode
        ? {
            recordVideo: {
              dir: path.join(guideDirectory, 'assets'),
              size: guideViewport,
            },
          }
        : {}),
    });
    const page = await context.newPage();
    const definition: GuideDefinition = {
      order: options.order,
      slug: options.slug,
      summary: options.summary,
      title: options.title,
    };

    return new UserGuideSession(
      context,
      page,
      definition,
      isGuideMode,
      page.video()
    );
  }

  async action(
    target: Locator,
    step: GuideStepDefinition,
    perform: () => Promise<void>
  ): Promise<void> {
    if (!this.isGuideMode) {
      await perform();
      return;
    }

    await this.showAnnotation(target, step.body);
    // Intentional narration dwell time; this is not synchronization.
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await this.page.waitForTimeout(900);
    await perform();
    await this.page.mouse.move(
      guideViewport.width / 2,
      guideViewport.height / 2
    );
    await this.page
      .locator('[role="tooltip"]:visible')
      .waitFor({ state: 'hidden' });
    await this.captureStep(step);
    // Intentional narration dwell time; this is not synchronization.
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await this.page.waitForTimeout(1_600);
    await this.clearAnnotation();
  }

  async result(target: Locator, step: GuideStepDefinition): Promise<void> {
    if (!this.isGuideMode) {
      return;
    }

    await this.showAnnotation(target, step.body);
    await this.captureStep(step);
    // Intentional narration dwell time; this is not synchronization.
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await this.page.waitForTimeout(2_500);
    await this.clearAnnotation();
  }

  async finish(): Promise<void> {
    await this.closeContext();

    if (!this.isGuideMode) {
      return;
    }

    if (this.video === null) {
      throw new Error('Playwright did not create the requested guide video.');
    }

    const videoPath = path.join(
      this.guideDirectory,
      'assets',
      `${this.definition.slug}.webm`
    );
    await this.video.saveAs(videoPath);
    await this.video.delete();
    await writeFile(
      path.join(this.guideDirectory, 'guide.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          ...this.definition,
          steps: this.steps,
          video: `assets/${this.definition.slug}.webm`,
        },
        undefined,
        2
      )}\n`,
      'utf8'
    );
  }

  async abort(): Promise<void> {
    await this.closeContext();

    if (this.isGuideMode) {
      await rm(this.guideDirectory, { force: true, recursive: true });
    }
  }

  private async captureStep(step: GuideStepDefinition): Promise<void> {
    const stepNumber = this.steps.length + 1;
    const image = `assets/step-${String(stepNumber).padStart(2, '0')}.png`;
    await this.page.screenshot({
      animations: 'disabled',
      path: path.join(this.guideDirectory, image),
    });
    this.steps.push({ ...step, image });
  }

  private async showAnnotation(target: Locator, text: string): Promise<void> {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();

    if (box === null) {
      throw new Error('Cannot annotate a guide target that is not visible.');
    }

    await this.clearAnnotation();
    await this.page.evaluate(
      ({ targetBox, annotationText }) => {
        const layer = document.createElement('div');
        layer.dataset['omoikaneGuideAnnotation'] = 'true';
        layer.style.inset = '0';
        layer.style.pointerEvents = 'none';
        layer.style.position = 'fixed';
        layer.style.zIndex = '2147483647';

        const highlight = document.createElement('div');
        highlight.style.border = '3px solid #d4a72c';
        highlight.style.borderRadius = '8px';
        highlight.style.boxShadow = '0 0 0 4px rgba(212, 167, 44, 0.24)';
        highlight.style.height = `${targetBox.height + 8}px`;
        highlight.style.left = `${Math.max(4, targetBox.x - 4)}px`;
        highlight.style.position = 'fixed';
        highlight.style.top = `${Math.max(4, targetBox.y - 4)}px`;
        highlight.style.width = `${targetBox.width + 8}px`;

        const note = document.createElement('div');
        note.setAttribute('role', 'note');
        note.textContent = annotationText;
        note.style.background = '#241a2e';
        note.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        note.style.borderRadius = '10px';
        note.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.32)';
        note.style.color = '#ffffff';
        note.style.font = '600 16px/1.45 system-ui, sans-serif';
        note.style.left = `${Math.min(Math.max(12, targetBox.x), window.innerWidth - 372)}px`;
        note.style.maxWidth = '360px';
        note.style.padding = '14px 16px';
        note.style.position = 'fixed';
        note.style.top = `${Math.min(targetBox.y + targetBox.height + 16, window.innerHeight - 120)}px`;

        layer.append(highlight, note);
        document.body.append(layer);
      },
      { annotationText: text, targetBox: box }
    );
  }

  private async clearAnnotation(): Promise<void> {
    if (this.page.isClosed()) {
      return;
    }

    await this.page
      .locator('[data-omoikane-guide-annotation="true"]')
      .evaluateAll((annotations) => {
        for (const annotation of annotations) {
          annotation.remove();
        }
      });
  }

  private async closeContext(): Promise<void> {
    if (this.contextClosed) {
      return;
    }

    await this.clearAnnotation();
    await this.context.close();
    this.contextClosed = true;
  }
}
