import { setTimeout as delay } from 'node:timers/promises';
import {
  commandFailure,
  pnpmCommand,
  runCommand,
} from '../development/local-toolchain.mjs';

const readinessTimeoutMilliseconds = 45_000;
const stableProbeCount = 3;

const statusResult = runCommand(pnpmCommand, [
  'exec',
  'supabase',
  'status',
  '-o',
  'json',
]);

if (statusResult.status !== 0) {
  throw new Error(
    `Cannot inspect local Supabase: ${commandFailure(statusResult)}`
  );
}

let localEnvironment;
try {
  const statusOutput = `${statusResult.stdout ?? ''}\n${statusResult.stderr ?? ''}`;
  const documentStart = statusOutput.indexOf('{');
  const documentEnd = statusOutput.lastIndexOf('}');

  if (documentStart < 0 || documentEnd <= documentStart) {
    throw new Error('missing JSON object');
  }

  localEnvironment = JSON.parse(
    statusOutput.slice(documentStart, documentEnd + 1)
  );
} catch {
  throw new Error('Supabase CLI returned an invalid status document.');
}

const apiUrl = localEnvironment.API_URL;
const publishableKey =
  localEnvironment.PUBLISHABLE_KEY ?? localEnvironment.ANON_KEY;

if (typeof apiUrl !== 'string' || typeof publishableKey !== 'string') {
  throw new Error(
    'Supabase status did not provide its local API configuration.'
  );
}

const parsedApiUrl = new URL(apiUrl);
if (
  parsedApiUrl.protocol !== 'http:' ||
  !['127.0.0.1', 'localhost'].includes(parsedApiUrl.hostname)
) {
  throw new Error(`Refusing to probe a non-local Supabase URL: ${apiUrl}`);
}

const endpoints = [
  new URL('/auth/v1/health', parsedApiUrl),
  new URL('/rest/v1/', parsedApiUrl),
];

const probe = async () => {
  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      headers: { apikey: publishableKey },
      signal: AbortSignal.timeout(3_000),
    });

    if (!response.ok) {
      await response.body?.cancel();
      return false;
    }

    await response.body?.cancel();
  }

  return true;
};

const deadline = Date.now() + readinessTimeoutMilliseconds;
let consecutiveSuccesses = 0;

while (Date.now() < deadline && consecutiveSuccesses < stableProbeCount) {
  try {
    consecutiveSuccesses = (await probe()) ? consecutiveSuccesses + 1 : 0;
  } catch {
    consecutiveSuccesses = 0;
  }

  if (consecutiveSuccesses < stableProbeCount) {
    await delay(750);
  }
}

if (consecutiveSuccesses < stableProbeCount) {
  throw new Error(
    `Local Supabase Auth and REST did not become stable within ${readinessTimeoutMilliseconds / 1_000} seconds.`
  );
}

console.log('[ok] Local Supabase Auth and REST are stable');
