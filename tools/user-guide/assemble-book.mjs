import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const guideOutputRoot = fileURLToPath(
  new URL('../../dist/user-guide/', import.meta.url)
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

  return {
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

const entries = await readdir(guideOutputRoot, { withFileTypes: true });
const guides = [];

for (const entry of entries) {
  if (!entry.isDirectory()) {
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
}

const navigation = guides
  .map((guide) => `- [${guide.title}](./${guide.slug}/README.md)`)
  .join('\n');
await writeFile(
  path.join(guideOutputRoot, 'README.md'),
  `# Omoikane User Guide\n\nThis book is generated from executable Playwright scenarios.\n\n${navigation}\n`,
  'utf8'
);

console.log(`[ok] Assembled ${guides.length} user-guide page(s)`);
