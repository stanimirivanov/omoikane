import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  commandFailure,
  pnpmCommand,
  runCommand,
} from '../development/local-toolchain.mjs';

const guideOutputRoot = fileURLToPath(
  new URL('../../dist/user-guide/', import.meta.url)
);

const runStep = (description, command, args, environment = process.env) => {
  console.log(`\n${description}`);
  const result = runCommand(command, args, 'inherit', environment);

  if (result.status !== 0) {
    console.error(`[error] ${description}: ${commandFailure(result)}`);
    process.exit(result.status ?? 1);
  }
};

rmSync(guideOutputRoot, { force: true, recursive: true });

runStep('Preparing the deterministic local database', pnpmCommand, [
  'db:prepare',
]);
runStep('Waiting for the local platform', process.execPath, [
  fileURLToPath(new URL('./wait-for-local-platform.mjs', import.meta.url)),
]);
runStep('Installing the guide browser', pnpmCommand, ['e2e:install']);
runStep(
  'Generating the executable user guide',
  pnpmCommand,
  ['exec', 'nx', 'e2e', 'client-e2e', '--grep', '@user-guide'],
  { ...process.env, OMOIKANE_E2E_MODE: 'user-guide' }
);
runStep('Assembling the user-guide book', process.execPath, [
  fileURLToPath(new URL('./assemble-book.mjs', import.meta.url)),
]);

console.log('\n[ok] User guide generated under dist/user-guide');
