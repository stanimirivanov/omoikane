BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(32);

CREATE FUNCTION pg_temp.test_analysis_result()
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
    SELECT '{"kind":"workspace-message-inventory","processorVersion":"analysis.deterministic.v1","providerKind":"deterministic","model":null,"evaluationVersion":"workspace-message-inventory.v1","sourceCount":0,"sourceTruncated":false,"sources":[],"summary":"Analyzed 0 active messages from 0 participants.","finding":{"kind":"workspace-message-inventory","status":"proposed","title":"Workspace message inventory","summary":"Analyzed 0 active messages from 0 participants.","confidence":1}}'::JSONB
$$;

SELECT has_function(
    'public',
    'complete_analysis_job_failure',
    ARRAY['uuid', 'uuid', 'uuid', 'text', 'boolean', 'integer'],
    'Analysis jobs have one narrow failed-completion command'
);
SELECT has_function(
    'private',
    'analysis_job_retry_delay_seconds',
    ARRAY['uuid', 'integer'],
    'Retry delay policy remains a database-owned helper'
);
SELECT has_column(
    'public',
    'analysis_job_attempts',
    'retry_available_at',
    'Attempts retain the retry schedule for replay safety'
);
SELECT is(
    private.analysis_job_retry_delay_seconds(
        '60000000-0000-4000-8000-000000000001'::UUID,
        2
    ),
    private.analysis_job_retry_delay_seconds(
        '60000000-0000-4000-8000-000000000001'::UUID,
        2
    ),
    'Retry jitter is deterministic for one job attempt'
);
SELECT ok(
    private.analysis_job_retry_delay_seconds(
        '60000000-0000-4000-8000-000000000001'::UUID,
        1
    ) BETWEEN 5 AND 6,
    'The first retry delay is five seconds plus at most twenty percent jitter'
);
SELECT ok(
    private.analysis_job_retry_delay_seconds(
        '60000000-0000-4000-8000-000000000001'::UUID,
        5
    ) BETWEEN 80 AND 96,
    'The fifth-attempt delay remains within the bounded exponential policy'
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
    'omoikane=retry'
)
\gset run_

SELECT analysis_run_outbox_event_id, claim_token
FROM public.claim_analysis_run_outbox_event('retry-dispatcher')
\gset outbox_

SELECT analysis_job_id
FROM public.dispatch_analysis_run_outbox_event(
    :'outbox_analysis_run_outbox_event_id'::UUID,
    :'outbox_claim_token'::UUID
)
\gset job_

SELECT *
FROM public.acquire_analysis_job(
    'retry-worker-1',
    'analysis.deterministic.v1',
    60
)
\gset first_

SELECT *
FROM public.complete_analysis_job_failure(
    :'first_analysis_job_id'::UUID,
    :'first_analysis_job_attempt_id'::UUID,
    :'first_lease_token'::UUID,
    'provider.unavailable',
    TRUE,
    12
)
\gset retry_

SELECT is(
    :'retry_completion_outcome'::TEXT,
    'retry_scheduled'::TEXT,
    'A retryable failure schedules another attempt'
);
SELECT ok(
    :'retry_next_available_at'::TIMESTAMPTZ > now(),
    'A retry is unavailable until its deterministic delay elapses'
);

RESET ROLE;

SELECT is(
    outcome,
    'retryable_failure',
    'The failed attempt records its retryable outcome'
)
FROM public.analysis_job_attempts
WHERE analysis_job_attempt_id = :'first_analysis_job_attempt_id'::UUID;
SELECT is(
    retry_available_at,
    :'retry_next_available_at'::TIMESTAMPTZ,
    'The attempt retains the exact retry schedule'
)
FROM public.analysis_job_attempts
WHERE analysis_job_attempt_id = :'first_analysis_job_attempt_id'::UUID;
SELECT ok(
    lease_token IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL,
    'Scheduling a retry releases the failed lease'
)
FROM public.analysis_jobs
WHERE analysis_job_id = :'job_analysis_job_id'::UUID;
SELECT is(
    terminal_outcome,
    NULL::TEXT,
    'A retryable non-exhausted job remains non-terminal'
)
FROM public.analysis_jobs
WHERE analysis_job_id = :'job_analysis_job_id'::UUID;
SELECT is(
    (
        SELECT state || ':' || attempt_id::TEXT
        FROM public.analysis_run_lifecycle_events
        WHERE analysis_run_id = :'run_analysis_run_id'::UUID
        ORDER BY sequence_number DESC
        LIMIT 1
    ),
    'queued:' || :'first_analysis_job_attempt_id',
    'Retry scheduling appends a queued lifecycle fact for the failed attempt'
);

SET LOCAL ROLE service_role;
SELECT is_empty(
    $$SELECT * FROM public.acquire_analysis_job(
        'early-worker', 'analysis.deterministic.v1', 60
    )$$,
    'A delayed retry cannot be acquired early'
);
RESET ROLE;

UPDATE public.analysis_jobs
SET available_at = clock_timestamp() - interval '1 second'
WHERE analysis_job_id = :'job_analysis_job_id'::UUID;

SET LOCAL ROLE service_role;
SELECT *
FROM public.acquire_analysis_job(
    'retry-worker-2',
    'analysis.deterministic.v1',
    60
)
\gset second_

SELECT is(
    :'second_attempt_number'::INTEGER,
    2,
    'The retry receives the next immutable attempt number'
);
SELECT is(
    (
        SELECT completion_outcome
        FROM public.complete_analysis_job_failure(
            :'first_analysis_job_id'::UUID,
            :'first_analysis_job_attempt_id'::UUID,
            :'first_lease_token'::UUID,
            'provider.unavailable',
            TRUE,
            12
        )
    ),
    'retry_scheduled'::TEXT,
    'A superseded attempt can only replay its already-committed retry receipt'
);

SELECT *
FROM public.complete_analysis_job_failure(
    :'second_analysis_job_id'::UUID,
    :'second_analysis_job_attempt_id'::UUID,
    :'second_lease_token'::UUID,
    'input.unsupported',
    FALSE,
    8
)
\gset terminal_

SELECT is(
    :'terminal_completion_outcome'::TEXT,
    'dead_lettered'::TEXT,
    'A terminal processor failure dead-letters immediately'
);
RESET ROLE;

SELECT ok(
    terminal_outcome = 'failed'
        AND completed_at IS NOT NULL
        AND last_failure_category = 'input.unsupported',
    'Dead-lettering records the bounded terminal job outcome'
)
FROM public.analysis_jobs
WHERE analysis_job_id = :'job_analysis_job_id'::UUID;
SELECT ok(
    outcome = 'terminal_failure'
        AND failure_category = 'input.unsupported'
        AND retry_available_at IS NULL,
    'The terminal attempt is completed without another schedule'
)
FROM public.analysis_job_attempts
WHERE analysis_job_attempt_id = :'second_analysis_job_attempt_id'::UUID;
SELECT is(
    (
        SELECT state || ':' || failure_category
        FROM public.analysis_run_lifecycle_events
        WHERE analysis_run_id = :'run_analysis_run_id'::UUID
        ORDER BY sequence_number DESC
        LIMIT 1
    ),
    'failed:input.unsupported',
    'Dead-lettering appends the terminal failed lifecycle fact'
);
SELECT is(
    (
        SELECT count(*)::INTEGER
        FROM public.analysis_run_lifecycle_events
        WHERE analysis_run_id = :'run_analysis_run_id'::UUID
          AND state = 'failed'
    ),
    1,
    'A run has one failed lifecycle fact'
);

SET LOCAL ROLE service_role;
SELECT is(
    (
        SELECT completion_outcome
        FROM public.complete_analysis_job_failure(
            :'second_analysis_job_id'::UUID,
            :'second_analysis_job_attempt_id'::UUID,
            :'second_lease_token'::UUID,
            'input.unsupported',
            FALSE,
            8
        )
    ),
    'dead_lettered',
    'Replaying the same terminal receipt returns its committed outcome'
);
SELECT throws_ok(
    format(
        'SELECT public.complete_analysis_job_success(%L, %L, %L, %L, 8, pg_temp.test_analysis_result())',
        :'second_analysis_job_id',
        :'second_analysis_job_attempt_id',
        :'second_lease_token',
        'late-success'
    ),
    'P0003',
    'Analysis job lease is stale.',
    'A dead-lettered attempt cannot later commit success'
);
RESET ROLE;

SELECT is(
    (
        SELECT count(*)::INTEGER
        FROM public.analysis_run_lifecycle_events
        WHERE analysis_run_id = :'run_analysis_run_id'::UUID
          AND state = 'failed'
    ),
    1,
    'Terminal replay does not duplicate the failed lifecycle fact'
);
SELECT throws_ok(
    format(
        'UPDATE public.analysis_job_attempts SET duration_milliseconds = 9 WHERE analysis_job_attempt_id = %L',
        :'second_analysis_job_attempt_id'
    ),
    '55000',
    'Completed Analysis job attempts are immutable.',
    'Completed failed attempts remain immutable'
);

SET LOCAL ROLE service_role;
SELECT analysis_run_id
FROM public.start_analysis_run(
    :'workspace_workspace_id'::UUID,
    :'channel_channel_id'::UUID,
    clock_timestamp() - INTERVAL '7 days',
    clock_timestamp(),
    '10000000-0000-4000-8000-000000000001'::UUID,
    '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    'omoikane=exhaustion'
)
\gset exhausted_run_
SELECT analysis_run_outbox_event_id, claim_token
FROM public.claim_analysis_run_outbox_event('exhaustion-dispatcher')
\gset exhausted_outbox_
SELECT analysis_job_id
FROM public.dispatch_analysis_run_outbox_event(
    :'exhausted_outbox_analysis_run_outbox_event_id'::UUID,
    :'exhausted_outbox_claim_token'::UUID
)
\gset exhausted_job_
RESET ROLE;

UPDATE public.analysis_jobs
SET attempt_count = 4
WHERE analysis_job_id = :'exhausted_job_analysis_job_id'::UUID;

SET LOCAL ROLE service_role;
SELECT *
FROM public.acquire_analysis_job(
    'exhaustion-worker',
    'analysis.deterministic.v1',
    60
)
\gset exhausted_attempt_
SELECT is(
    :'exhausted_attempt_attempt_number'::INTEGER,
    5,
    'The final allowed acquisition is attempt five'
);
SELECT *
FROM public.complete_analysis_job_failure(
    :'exhausted_attempt_analysis_job_id'::UUID,
    :'exhausted_attempt_analysis_job_attempt_id'::UUID,
    :'exhausted_attempt_lease_token'::UUID,
    'provider.timeout',
    TRUE,
    21
)
\gset exhausted_
SELECT is(
    :'exhausted_completion_outcome'::TEXT,
    'dead_lettered'::TEXT,
    'A retryable fifth failure is dead-lettered'
);
RESET ROLE;

SELECT ok(
    outcome = 'retryable_failure' AND retry_available_at IS NULL,
    'The exhausted attempt retains its retryable classification without a schedule'
)
FROM public.analysis_job_attempts
WHERE analysis_job_attempt_id = :'exhausted_attempt_analysis_job_attempt_id'::UUID;
SELECT is(
    terminal_outcome,
    'failed',
    'Exhausting attempts makes the job terminal'
)
FROM public.analysis_jobs
WHERE analysis_job_id = :'exhausted_job_analysis_job_id'::UUID;
SELECT is(
    (
        SELECT state
        FROM public.analysis_run_lifecycle_events
        WHERE analysis_run_id = :'exhausted_run_analysis_run_id'::UUID
        ORDER BY sequence_number DESC
        LIMIT 1
    ),
    'failed',
    'Attempt exhaustion makes the Analysis Run failed'
);

SET LOCAL ROLE authenticated;
SELECT throws_ok(
    format(
        'SELECT public.complete_analysis_job_failure(%L, %L, %L, %L, TRUE, 1)',
        :'exhausted_attempt_analysis_job_id',
        :'exhausted_attempt_analysis_job_attempt_id',
        :'exhausted_attempt_lease_token',
        'provider.timeout'
    ),
    '42501',
    NULL,
    'Authenticated clients cannot complete worker failures'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok(
    format(
        'SELECT public.complete_analysis_job_failure(%L, %L, %L, %L, TRUE, 1)',
        :'exhausted_attempt_analysis_job_id',
        :'exhausted_attempt_analysis_job_attempt_id',
        :'exhausted_attempt_lease_token',
        'provider.timeout'
    ),
    '42501',
    NULL,
    'Anonymous clients cannot complete worker failures'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
