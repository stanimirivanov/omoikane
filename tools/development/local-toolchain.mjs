import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const packageMetadata = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
);

export const expectedPnpmVersion = packageMetadata.packageManager.replace(
  'pnpm@',
  ''
);
export const verifyNodeVersionPath = fileURLToPath(
  new URL('./verify-node-version.mjs', import.meta.url)
);
export const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
export const dockerCommand =
  process.platform === 'win32' ? 'docker.exe' : 'docker';

export const runCommand = (
  command,
  args,
  stdio = 'pipe',
  environment = process.env
) => {
  const isWindowsCommandScript =
    process.platform === 'win32' && command.endsWith('.cmd');

  return spawnSync(
    isWindowsCommandScript ? (process.env.ComSpec ?? 'cmd.exe') : command,
    isWindowsCommandScript ? ['/d', '/s', '/c', command, ...args] : args,
    {
      encoding: 'utf8',
      stdio,
      env: environment,
      windowsHide: true,
    }
  );
};

const firstOutputLine = (result) =>
  [result.stderr, result.stdout]
    .flatMap((output) => (output ?? '').split(/\r?\n/u))
    .map((line) => line.trim())
    .find(Boolean);

export const commandFailure = (result) =>
  result.error?.code === 'ENOENT'
    ? 'command not found'
    : (firstOutputLine(result) ?? result.error?.message ?? 'command failed');
