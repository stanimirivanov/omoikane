import { pnpmCommand, runCommand } from './local-toolchain.mjs';

const fail = (detail) => {
  console.error(`[error] Server integration: ${detail}`);
  process.exit(1);
};

const statusResult = runCommand(pnpmCommand, [
  'exec',
  'supabase',
  'status',
  '-o',
  'json',
]);

if (statusResult.status !== 0) {
  fail('local Supabase is unavailable; run pnpm dev:up first.');
}

let localEnvironment;
try {
  localEnvironment = JSON.parse(statusResult.stdout ?? '');
} catch {
  fail('Supabase CLI returned an invalid status document.');
}

const secretKey =
  localEnvironment.SECRET_KEY ?? localEnvironment.SERVICE_ROLE_KEY;
if (typeof secretKey !== 'string' || secretKey.trim().length === 0) {
  fail('Supabase CLI did not return a local server key.');
}

const result = runCommand(
  pnpmCommand,
  ['exec', 'nx', 'run', 'server:integration'],
  'inherit',
  {
    ...process.env,
    SUPABASE_SECRET_KEY: secretKey,
  }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
