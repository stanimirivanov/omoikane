import {
  commandFailure,
  dockerCommand,
  runCommand,
} from './local-toolchain.mjs';

const composeArguments = ['compose', '-f', 'compose.ai.yaml'];
const configuredModel =
  process.env.OMOIKANE_OLLAMA_MODEL?.trim() || 'qwen3:4b-instruct';

if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/u.test(configuredModel)) {
  console.error('[error] Ollama model: invalid OMOIKANE_OLLAMA_MODEL');
  process.exit(1);
}

const runStep = (description, args) => {
  console.log(`\n${description}`);
  const result = runCommand(
    dockerCommand,
    [...composeArguments, ...args],
    'inherit'
  );
  if (result.status !== 0) {
    console.error(`[error] ${description}: ${commandFailure(result)}`);
    process.exit(1);
  }
};

console.log('Starting the optional Omoikane local AI profile');
runStep('Starting Ollama', ['up', '-d', '--wait']);
runStep('Provisioning the configured model', [
  'exec',
  '-T',
  'ollama',
  'ollama',
  'pull',
  configuredModel,
]);

console.log(
  `\n[ok] Ollama: ${configuredModel} is ready at http://127.0.0.1:11434`
);
console.log('Run pnpm dev:ai-local:status to verify it again.');
