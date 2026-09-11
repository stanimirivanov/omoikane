import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const guideOutputRoot = fileURLToPath(
  new URL('../../dist/user-guide/', import.meta.url)
);
const guideStylesheet = fileURLToPath(
  new URL('./assets/guide.css', import.meta.url)
);
const guideSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const fail = (manifestPath, detail) => {
  throw new Error(`Invalid guide manifest ${manifestPath}: ${detail}`);
};

const requiredString = (value, field, manifestPath) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(manifestPath, `${field} must be a non-empty string`);
  }

  return value.trim();
};

const safeAssetPath = (value, field, manifestPath) => {
  const assetPath = requiredString(value, field, manifestPath);

  if (
    path.isAbsolute(assetPath) ||
    assetPath.split(/[\\/]/u).some((segment) => segment === '..')
  ) {
    fail(manifestPath, `${field} must stay inside its guide directory`);
  }

  return assetPath.replaceAll('\\', '/');
};

const requireArtifact = async (manifestPath, assetPath, field) => {
  try {
    const artifact = await stat(
      path.join(path.dirname(manifestPath), assetPath)
    );
    if (!artifact.isFile()) {
      fail(manifestPath, `${field} must identify a file`);
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      fail(manifestPath, `${field} does not exist: ${assetPath}`);
    }
    throw error;
  }
};

const parseManifest = async (manifestPath) => {
  const parsed = JSON.parse(await readFile(manifestPath, 'utf8'));

  if (parsed === null || typeof parsed !== 'object') {
    fail(manifestPath, 'root must be an object');
  }
  if (parsed.schemaVersion !== 1) {
    fail(manifestPath, 'schemaVersion must be 1');
  }
  if (!Number.isSafeInteger(parsed.order) || parsed.order < 0) {
    fail(manifestPath, 'order must be a non-negative integer');
  }

  const slug = requiredString(parsed.slug, 'slug', manifestPath);
  if (!guideSlugPattern.test(slug)) {
    fail(
      manifestPath,
      'slug must contain lowercase words separated by hyphens'
    );
  }
  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    fail(manifestPath, 'steps must be a non-empty array');
  }

  const guide = {
    order: parsed.order,
    slug,
    steps: parsed.steps.map((step, index) => {
      if (step === null || typeof step !== 'object') {
        fail(manifestPath, `steps[${index}] must be an object`);
      }

      return {
        body: requiredString(step.body, `steps[${index}].body`, manifestPath),
        image: safeAssetPath(step.image, `steps[${index}].image`, manifestPath),
        title: requiredString(
          step.title,
          `steps[${index}].title`,
          manifestPath
        ),
      };
    }),
    summary: requiredString(parsed.summary, 'summary', manifestPath),
    title: requiredString(parsed.title, 'title', manifestPath),
    video: safeAssetPath(parsed.video, 'video', manifestPath),
  };

  await requireArtifact(manifestPath, guide.video, 'video');
  await Promise.all(
    guide.steps.map((step, index) =>
      requireArtifact(manifestPath, step.image, `steps[${index}].image`)
    )
  );

  return guide;
};

const renderGuide = (guide) => {
  const renderedSteps = guide.steps
    .map(
      (step, index) =>
        `## ${index + 1}. ${step.title}\n\n${step.body}\n\n![${step.title}](./${step.image})`
    )
    .join('\n\n');

  return `# ${guide.title}\n\n${guide.summary}\n\n<video controls src="./${guide.video}">\n  Your browser does not support embedded video.\n</video>\n\n${renderedSteps}\n`;
};

const escapeHtml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const renderNavigation = (guides, currentSlug, fromGuide) =>
  guides
    .map((guide) => {
      const href = fromGuide ? `../${guide.slug}/` : `./${guide.slug}/`;
      const current = guide.slug === currentSlug ? ' aria-current="page"' : '';
      return `<li><a href="${href}"${current}>${escapeHtml(guide.title)}</a></li>`;
    })
    .join('\n');

const renderHtmlDocument = ({
  content,
  description,
  homeHref,
  navigation,
  stylesheet,
  title,
}) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="${escapeHtml(description)}">
    <title>${escapeHtml(title)} · Omoikane User Guide</title>
    <link rel="stylesheet" href="${stylesheet}">
  </head>
  <body>
    <header class="site-header">
      <a class="product" href="${homeHref}">
        <span class="product-mark" aria-hidden="true">O</span>
        <span>Omoikane User Guide</span>
      </a>
    </header>
    <div class="site-layout">
      <nav class="guide-navigation" aria-label="User-guide chapters">
        <p class="navigation-label">Guides</p>
        <ol>${navigation}</ol>
      </nav>
      <main>${content}</main>
    </div>
    <footer>Generated from executable Playwright scenarios.</footer>
  </body>
</html>
`;

const renderGuideHtml = (guide, guides) => {
  const steps = guide.steps
    .map(
      (step, index) => `<section class="guide-step" id="step-${index + 1}">
  <p class="step-number">Step ${index + 1}</p>
  <h2>${escapeHtml(step.title)}</h2>
  <p>${escapeHtml(step.body)}</p>
  <img src="./${step.image}" alt="${escapeHtml(step.title)}" loading="lazy">
</section>`
    )
    .join('\n');

  const content = `<article>
  <p class="eyebrow">Executable guide</p>
  <h1>${escapeHtml(guide.title)}</h1>
  <p class="lead">${escapeHtml(guide.summary)}</p>
  <video controls preload="metadata">
    <source src="./${guide.video}" type="video/webm">
    Your browser does not support embedded video.
  </video>
  <div class="steps">${steps}</div>
</article>`;

  return renderHtmlDocument({
    content,
    description: guide.summary,
    homeHref: '../',
    navigation: renderNavigation(guides, guide.slug, true),
    stylesheet: '../assets/guide.css',
    title: guide.title,
  });
};

const renderIndexHtml = (guides) => {
  const cards = guides
    .map(
      (guide) => `<li>
  <a class="guide-card" href="./${guide.slug}/">
    <span>${escapeHtml(guide.title)}</span>
    <small>${escapeHtml(guide.summary)}</small>
  </a>
</li>`
    )
    .join('\n');
  const content = `<section class="book-introduction">
  <p class="eyebrow">Omoikane documentation</p>
  <h1>Learn through executable workflows</h1>
  <p class="lead">Each guide is verified against the application and includes annotated steps and a complete recording.</p>
  <ol class="guide-grid">${cards}</ol>
</section>`;

  return renderHtmlDocument({
    content,
    description: 'Executable guides for Omoikane collaboration workflows.',
    homeHref: './',
    navigation: renderNavigation(guides, undefined, false),
    stylesheet: './assets/guide.css',
    title: 'Home',
  });
};

const entries = await readdir(guideOutputRoot, { withFileTypes: true });
const guides = [];

for (const entry of entries) {
  if (!entry.isDirectory() || entry.name === 'assets') {
    continue;
  }

  const manifestPath = path.join(guideOutputRoot, entry.name, 'guide.json');
  const guide = await parseManifest(manifestPath);

  if (guide.slug !== entry.name) {
    fail(manifestPath, 'slug must match its containing directory');
  }

  guides.push(guide);
}

if (guides.length === 0) {
  throw new Error(`No guide manifests found under ${guideOutputRoot}.`);
}

guides.sort(
  (left, right) =>
    left.order - right.order || left.title.localeCompare(right.title)
);

for (const guide of guides) {
  await writeFile(
    path.join(guideOutputRoot, guide.slug, 'README.md'),
    renderGuide(guide),
    'utf8'
  );
  await writeFile(
    path.join(guideOutputRoot, guide.slug, 'index.html'),
    renderGuideHtml(guide, guides),
    'utf8'
  );
}

const navigation = guides
  .map((guide) => `- [${guide.title}](./${guide.slug}/README.md)`)
  .join('\n');
await writeFile(
  path.join(guideOutputRoot, 'README.md'),
  `# Omoikane User Guide\n\nThis book is generated from executable Playwright scenarios.\n\n${navigation}\n`,
  'utf8'
);
await mkdir(path.join(guideOutputRoot, 'assets'), { recursive: true });
await copyFile(
  guideStylesheet,
  path.join(guideOutputRoot, 'assets', 'guide.css')
);
await writeFile(
  path.join(guideOutputRoot, 'index.html'),
  renderIndexHtml(guides),
  'utf8'
);

console.log(
  `[ok] Assembled ${guides.length} user-guide page(s) as Markdown and static HTML`
);
