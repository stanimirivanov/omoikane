import {
  commandFailure,
  pnpmCommand,
  runCommand,
} from '../development/local-toolchain.mjs';

const runStep = (description, args, environment = process.env) => {
  console.log(`\n${description}`);
  const result = runCommand(pnpmCommand, args, 'inherit', environment);

  if (result.status !== 0) {
    console.error(`[error] ${description}: ${commandFailure(result)}`);
    process.exit(result.status ?? 1);
  }
};

runStep('Preparing the deterministic local database', ['db:prepare']);
runStep('Installing the guide browser', ['e2e:install']);
runStep(
  'Generating the executable user guide',
  ['exec', 'nx', 'e2e', 'client-e2e', '--grep', '@user-guide'],
  { ...process.env, OMOIKANE_E2E_MODE: 'user-guide' }
);

console.log('\n[ok] User guide generated under dist/user-guide');
