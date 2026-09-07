BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(29);

CREATE FUNCTION pg_temp.test_analysis_result()
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
    SELECT '{"kind":"workspace-message-inventory","processorVersion":"analysis.deterministic.v1","providerKind":"deterministic","model":null,"evaluationVersion":"workspace-message-inventory.v1","sourceCount":0,"sourceTruncated":false,"sources":[],"summary":"Analyzed 0 active messages from 0 participants.","finding":{"kind":"workspace-message-inventory","status":"proposed","title":"Workspace message inventory","summary":"Analyzed 0 active messages from 0 participants.","confidence":1}}'::JSONB
$$;

SELECT has_function(
    'public',
    'acquire_analysis_job',
    ARRAY['text', 'text', 'integer'],
    'Analysis jobs have a narrow acquisition command'
);
SELECT has_function(
    'public',
    'complete_analysis_job_success',
    ARRAY['uuid', 'uuid', 'uuid', 'text', 'integer', 'jsonb'],
    'Analysis attempts have a lease-fenced success command'
);
SELECT has_function(
    'public',
    'check_analysis_worker_ready',
    ARRAY[]::TEXT[],
    'The worker has a non-mutating readiness command'
);

SELECT workspace_id
FROM public.workspaces
WHERE created_by = '10000000-0000-4000-8000-000000000001'
ORDER BY created_at
LIMIT 1
\gset workspace_

SELECT channel_id
FROM public.channel_heads
WHERE workspace_id = :'workspace_workspace_id'::UUID
  AND channel_status = 'active'
ORDER BY channel_id
LIMIT 1
\gset channel_

SET LOCAL ROLE service_role;

SELECT analysis_run_id
FROM public.start_analysis_run(
    :'workspace_workspace_id'::UUID,
    :'channel_channel_id'::UUID,
    clock_timestamp() - INTERVAL '7 days',
    clock_timestamp(),
    '10000000-0000-4000-8000-000000000001'::UUID,
    '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    'omoikane=execute'
)
\gset run_

SELECT analysis_run_outbox_event_id, claim_token
FROM public.claim_analysis_run_outbox_event('dispatcher-1')
\gset outbox_

SELECT analysis_job_id
FROM public.dispatch_analysis_run_outbox_event(
    :'outbox_analysis_run_outbox_event_id'::UUID,
    :'outbox_claim_token'::UUID
)
\gset dispatched_

SELECT *
FROM public.acquire_analysis_job('worker-1', 'analysis.deterministic.v1', 60)
\gset attempt_

SELECT is(
    :'attempt_analysis_job_id'::UUID,
    :'dispatched_analysis_job_id'::UUID,
    'The available dispatched job is acquired'
);
SELECT is(
    :'attempt_attempt_number'::INTEGER,
    1,
    'The first acquisition creates attempt one'
);
SELECT is(
    :'attempt_processor_version'::TEXT,
    'analysis.deterministic.v1'::TEXT,
    'The attempt records the fixed processor version'
);
SELECT ok(
    :'attempt_lease_token'::UUID IS NOT NULL,
    'Acquisition returns an opaque job fencing token'
);
SELECT is(
    (
        SELECT count(*)
        FROM public.acquire_analysis_job(
            'worker-2',
            'analysis.deterministic.v1',
            60
        )
    ),
    0::BIGINT,
    'An active job lease excludes another worker'
);

RESET ROLE;

SELECT results_eq(
    format(
        'SELECT attempt_number, processor_version, outcome FROM public.analysis_job_attempts WHERE analysis_job_id = %L',
        :'attempt_analysis_job_id'::UUID
    ),
    $$VALUES (1, 'analysis.deterministic.v1'::TEXT, NULL::TEXT)$$,
    'Acquisition atomically persists the active attempt'
);
SELECT results_eq(
    format(
        'SELECT sequence_number, state FROM public.analysis_run_lifecycle_events WHERE analysis_run_id = %L ORDER BY sequence_number',
        :'run_analysis_run_id'::UUID
    ),
    $$VALUES (1::BIGINT, 'created'::TEXT), (2::BIGINT, 'queued'::TEXT), (3::BIGINT, 'running'::TEXT)$$,
    'Acquisition appends running after created and queued'
);

SET LOCAL ROLE service_role;

SELECT throws_ok(
    format(
        'SELECT public.complete_analysis_job_success(%L, %L, %L, %L, 1, pg_temp.test_analysis_result())',
        :'attempt_analysis_job_id'::UUID,
        :'attempt_analysis_job_attempt_id'::UUID,
        '90000000-0000-4000-8000-000000000001'::UUID,
        'analysis.deterministic.v1/run/job'
    ),
    'P0003',
    'Analysis job lease is stale.',
    'A stale worker cannot commit success'
);

RESET ROLE;

SELECT is(
    (
        SELECT terminal_outcome
        FROM public.analysis_jobs
        WHERE analysis_job_id = :'attempt_analysis_job_id'::UUID
    ),
    NULL::TEXT,
    'Rejected completion leaves the job non-terminal'
);

SET LOCAL ROLE service_role;

SELECT analysis_job_id
FROM public.complete_analysis_job_success(
    :'attempt_analysis_job_id'::UUID,
    :'attempt_analysis_job_attempt_id'::UUID,
    :'attempt_lease_token'::UUID,
    'analysis.deterministic.v1/run/job',
    2,
    pg_temp.test_analysis_result()
)
\gset completed_

RESET ROLE;

SELECT is(
    :'completed_analysis_job_id'::UUID,
    :'attempt_analysis_job_id'::UUID,
    'The current lease commits terminal success'
);
SELECT results_eq(
    format(
        'SELECT terminal_outcome, lease_token, completed_at IS NOT NULL FROM public.analysis_jobs WHERE analysis_job_id = %L',
        :'attempt_analysis_job_id'::UUID
    ),
    $$VALUES ('succeeded'::TEXT, NULL::UUID, TRUE)$$,
    'Success makes the job terminal and releases its lease'
);
SELECT results_eq(
    format(
        'SELECT outcome, result_fingerprint, duration_milliseconds, completed_at IS NOT NULL FROM public.analysis_job_attempts WHERE analysis_job_attempt_id = %L',
        :'attempt_analysis_job_attempt_id'::UUID
    ),
    $$VALUES ('succeeded'::TEXT, 'analysis.deterministic.v1/run/job'::TEXT, 2, TRUE)$$,
    'The completed attempt retains its deterministic receipt and duration'
);
SELECT results_eq(
    format(
        'SELECT sequence_number, state FROM public.analysis_run_lifecycle_events WHERE analysis_run_id = %L ORDER BY sequence_number',
        :'run_analysis_run_id'::UUID
    ),
    $$VALUES (1::BIGINT, 'created'::TEXT), (2::BIGINT, 'queued'::TEXT), (3::BIGINT, 'running'::TEXT), (4::BIGINT, 'succeeded'::TEXT)$$,
    'Success appends one terminal lifecycle fact'
);

SET LOCAL ROLE service_role;

SELECT is(
    (
        SELECT analysis_job_id
        FROM public.complete_analysis_job_success(
            :'attempt_analysis_job_id'::UUID,
            :'attempt_analysis_job_attempt_id'::UUID,
            :'attempt_lease_token'::UUID,
            'analysis.deterministic.v1/run/job',
            2,
            pg_temp.test_analysis_result()
        )
    ),
    :'attempt_analysis_job_id'::UUID,
    'Replaying the same completion returns the committed job'
);

RESET ROLE;

SELECT is(
    (
        SELECT count(*)
        FROM public.analysis_run_lifecycle_events
        WHERE analysis_run_id = :'run_analysis_run_id'::UUID
          AND state = 'succeeded'
    ),
    1::BIGINT,
    'Completion replay does not duplicate terminal history'
);
SELECT throws_ok(
    format(
        'UPDATE public.analysis_job_attempts SET duration_milliseconds = 3 WHERE analysis_job_attempt_id = %L',
        :'attempt_analysis_job_attempt_id'::UUID
    ),
    '55000',
    'Completed Analysis job attempts are immutable.',
    'Completed attempt audit data cannot be rewritten'
);

SET LOCAL ROLE service_role;

SELECT ok(
    public.check_analysis_worker_ready(),
    'The worker readiness command proves queue access without mutation'
);

SELECT analysis_run_id
FROM public.start_analysis_run(
    :'workspace_workspace_id'::UUID,
    :'channel_channel_id'::UUID,
    clock_timestamp() - INTERVAL '7 days',
    clock_timestamp(),
    '10000000-0000-4000-8000-000000000001'::UUID,
    '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01',
    NULL
)
\gset recovery_run_

SELECT analysis_run_outbox_event_id, claim_token
FROM public.claim_analysis_run_outbox_event('dispatcher-recovery')
\gset recovery_outbox_

SELECT analysis_job_id
FROM public.dispatch_analysis_run_outbox_event(
    :'recovery_outbox_analysis_run_outbox_event_id'::UUID,
    :'recovery_outbox_claim_token'::UUID
)
\gset recovery_job_

SELECT *
FROM public.acquire_analysis_job(
    'worker-before-restart',
    'analysis.deterministic.v1',
    60
)
\gset abandoned_

RESET ROLE;

UPDATE public.analysis_jobs
SET lease_expires_at = clock_timestamp() - INTERVAL '1 second'
WHERE analysis_job_id = :'recovery_job_analysis_job_id'::UUID;

SET LOCAL ROLE service_role;

SELECT *
FROM public.acquire_analysis_job(
    'worker-after-restart',
    'analysis.deterministic.v1',
    60
)
\gset recovered_

SELECT is(
    :'recovered_analysis_job_id'::UUID,
    :'recovery_job_analysis_job_id'::UUID,
    'A new worker recovers the job after lease expiry'
);
SELECT is(
    :'recovered_attempt_number'::INTEGER,
    2,
    'Restart recovery creates the next auditable attempt'
);
SELECT isnt(
    :'recovered_lease_token'::UUID,
    :'abandoned_lease_token'::UUID,
    'Restart recovery replaces the fencing token'
);
SELECT throws_ok(
    format(
        'SELECT public.complete_analysis_job_success(%L, %L, %L, %L, 1, pg_temp.test_analysis_result())',
        :'abandoned_analysis_job_id'::UUID,
        :'abandoned_analysis_job_attempt_id'::UUID,
        :'abandoned_lease_token'::UUID,
        'analysis.deterministic.v1/restart/stale'
    ),
    'P0003',
    'Analysis job lease is stale.',
    'The pre-restart worker is fenced from completion'
);

SELECT lives_ok(
    format(
        'SELECT public.complete_analysis_job_success(%L, %L, %L, %L, 1, pg_temp.test_analysis_result())',
        :'recovered_analysis_job_id'::UUID,
        :'recovered_analysis_job_attempt_id'::UUID,
        :'recovered_lease_token'::UUID,
        'analysis.deterministic.v1/restart/recovered'
    ),
    'The recovered attempt can complete successfully'
);

RESET ROLE;

SELECT is(
    (
        SELECT count(*)
        FROM public.analysis_job_attempts
        WHERE analysis_job_id = :'recovery_job_analysis_job_id'::UUID
    ),
    2::BIGINT,
    'Restart recovery preserves both attempts for audit'
);
SELECT is(
    (
        SELECT count(*)
        FROM public.analysis_run_lifecycle_events
        WHERE analysis_run_id = :'recovery_run_analysis_run_id'::UUID
          AND state = 'succeeded'
    ),
    1::BIGINT,
    'Recovered execution still commits one terminal success fact'
);

SET LOCAL ROLE anon;

SELECT throws_ok(
    $$SELECT public.check_analysis_worker_ready()$$,
    '42501',
    'permission denied for function check_analysis_worker_ready',
    'Anonymous callers cannot probe the internal worker queue'
);

RESET ROLE;
SET LOCAL ROLE authenticated;

SELECT throws_ok(
    $$SELECT * FROM public.acquire_analysis_job('browser', 'analysis.deterministic.v1', 60)$$,
    '42501',
    'permission denied for function acquire_analysis_job',
    'Authenticated browser callers cannot acquire jobs'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
