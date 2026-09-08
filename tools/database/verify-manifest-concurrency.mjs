import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

// Isolate real concurrent PostgreSQL sessions from the user's development data.
// All writes, including fixture cleanup, target this disposable database only.
const projectId = readFileSync('supabase/config.toml', 'utf8').match(
  /^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/mu
)?.[1];
if (!projectId) throw new Error('Expected a local Supabase project ID.');
const container = `supabase_db_${projectId}`;
const database = `omoikane_manifest_test_${randomUUID().replaceAll('-', '')}`;
const docker = process.platform === 'win32' ? 'docker.exe' : 'docker';
const command = (args, input) => {
  const result = spawnSync(docker, ['exec', '-i', container, ...args], {
    input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120000,
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error(
      `Local manifest concurrency command failed: ${args[0]}. ${(result.stderr ?? '').split('\n').find((line) => line.includes('ERROR:')) ?? ''}`
    );
  return result.stdout.trim();
};
const sql = (statement) =>
  command([
    'psql',
    '-U',
    'supabase_admin',
    '-d',
    database,
    '-X',
    '-Atq',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    statement,
  ]);
const concurrentSql = (statement) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      docker,
      [
        'exec',
        '-i',
        container,
        'psql',
        '-U',
        'supabase_admin',
        '-d',
        database,
        '-X',
        '-Atq',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `SET statement_timeout = '15s'; ${statement}`,
      ],
      { windowsHide: true }
    );
    let output = '';
    child.stdout.on('data', (data) => {
      output += data;
    });
    child.stderr.resume();
    child.on('error', reject);
    child.stdin.end();
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('Concurrent manifest pin failed.'));
        return;
      }
      try {
        resolve(JSON.parse(output.trim()));
      } catch {
        reject(new Error('Concurrent manifest pin returned invalid JSON.'));
      }
    });
  });
let created = false;
try {
  const dump = command([
    'pg_dump',
    '-U',
    'supabase_admin',
    '--no-owner',
    '--no-privileges',
    'postgres',
  ]);
  command([
    'createdb',
    '-U',
    'supabase_admin',
    '--template=template0',
    database,
  ]);
  created = true;
  command(
    [
      'psql',
      '-U',
      'supabase_admin',
      '-d',
      database,
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    dump
  );
  const execution = JSON.parse(
    sql(`
    TRUNCATE public.analysis_runs CASCADE;
    DO $setup$
    DECLARE selected_workspace UUID; selected_channel UUID; claimed RECORD;
    BEGIN
      SELECT workspace_id INTO STRICT selected_workspace FROM public.workspaces
        WHERE created_by = '10000000-0000-4000-8000-000000000001' ORDER BY created_at LIMIT 1;
      SELECT channel_id INTO STRICT selected_channel FROM public.channel_heads
        WHERE workspace_id = selected_workspace AND channel_status = 'active' ORDER BY channel_id LIMIT 1;
      PERFORM public.start_analysis_run(selected_workspace, selected_channel,
        '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', '10000000-0000-4000-8000-000000000001',
        '00-11111111111111111111111111111111-2222222222222222-01', NULL);
      SELECT * INTO STRICT claimed FROM public.claim_analysis_run_outbox_event('manifest-race');
      PERFORM public.dispatch_analysis_run_outbox_event(claimed.analysis_run_outbox_event_id, claimed.claim_token);
    END;
    $setup$;
    SELECT row_to_json(execution) FROM public.acquire_analysis_job('manifest-race', 'analysis.decision-forensics.v1', 60) AS execution;
  `)
  );
  const ids = [
    execution.analysis_job_id,
    execution.analysis_job_attempt_id,
    execution.lease_token,
  ];
  for (const id of ids) assert.match(id, /^[0-9a-f-]{36}$/u);
  const fixtureText = readFileSync(
    'supabase/tests/database/analysis_execution_manifest_test.sql',
    'utf8'
  );
  const configuration = JSON.parse(
    fixtureText.match(/^SELECT '(.*)'::JSONB AS configuration/mu)[1]
  );
  const pinStatement = (model) => {
    const proposal = JSON.stringify({ ...configuration, model }).replaceAll(
      "'",
      "''"
    );
    return `BEGIN;
      SELECT public.pin_analysis_job_execution_manifest('${ids[0]}','${ids[1]}','${ids[2]}','${proposal}'::JSONB);
      DO $hold$ BEGIN PERFORM pg_sleep(0.5); END $hold$;
      COMMIT;`;
  };
  // Independent connections start together and hold the winning lock through commit.
  const results = await Promise.allSettled([
    concurrentSql(pinStatement('race-first.v1')),
    concurrentSql(pinStatement('race-second.v1')),
  ]);
  assert.ok(
    results.every((result) => result.status === 'fulfilled'),
    'Both competing pins must complete.'
  );
  const [first, second] = results.map((result) => result.value);
  assert.deepEqual(first, second);
  assert.ok(
    ['race-first.v1', 'race-second.v1'].includes(first.configuration.model)
  );
  assert.equal(
    sql('SELECT count(*) FROM public.analysis_execution_manifests'),
    '1'
  );
  console.log(
    'PASS: concurrent database sessions observe one immutable manifest.'
  );
} finally {
  if (created && /^omoikane_manifest_test_[0-9a-f]{32}$/u.test(database)) {
    command(['dropdb', '-U', 'supabase_admin', '--force', database]);
  }
}
