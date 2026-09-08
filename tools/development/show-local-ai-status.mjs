import {
  commandFailure,
  dockerCommand,
  runCommand,
} from './local-toolchain.mjs';

const configuredModel =
  process.env.OMOIKANE_OLLAMA_MODEL?.trim() || 'qwen3:4b-instruct';
const result = runCommand(dockerCommand, [
  'compose',
  '-f',
  'compose.ai.yaml',
  'exec',
  '-T',
  'ollama',
  'ollama',
  'list',
]);

if (result.status !== 0) {
  console.error(`[error] Ollama: ${commandFailure(result)}`);
  process.exit(1);
}

const models = (result.stdout ?? '')
  .split(/\r?\n/u)
  .slice(1)
  .map((line) => line.trim().split(/\s+/u)[0])
  .filter(Boolean);

if (!models.includes(configuredModel)) {
  console.error(`[error] Ollama: model ${configuredModel} is not provisioned`);
  process.exit(1);
}

console.log(`[ok] Ollama: ${configuredModel} is provisioned and reachable`);
