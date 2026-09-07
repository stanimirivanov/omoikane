BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(24);

SELECT has_table('public', 'analysis_jobs', 'Analysis jobs are durable');
SELECT has_table(
    'public',
    'analysis_job_attempts',
    'Analysis job attempts have a dedicated audit table'
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
    'omoikane=dispatch'
)
\gset run_

SELECT analysis_run_outbox_event_id, claim_token, attempt_count
FROM public.claim_analysis_run_outbox_event(
    'dispatcher-1',
    30
)
\gset claim_

RESET ROLE;

SELECT ok(
    :'claim_analysis_run_outbox_event_id'::UUID IS NOT NULL,
    'The oldest available requested event is claimed'
);
SELECT ok(
    :'claim_claim_token'::UUID IS NOT NULL,
    'A claim returns an opaque fencing token'
);
SELECT is(
    :'claim_attempt_count'::INTEGER,
    1,
    'Claiming records the acquisition attempt'
);

SET LOCAL ROLE service_role;

SELECT is(
    (
        SELECT count(*)
        FROM public.claim_analysis_run_outbox_event(
            'dispatcher-2',
            30
        )
    ),
    0::BIGINT,
    'An active lease prevents the same event from being claimed again'
);

SELECT throws_ok(
    format(
        'SELECT public.dispatch_analysis_run_outbox_event(%L, %L)',
        :'claim_analysis_run_outbox_event_id'::UUID,
        '70000000-0000-4000-8000-000000000001'::UUID
    ),
    'P0003',
    'Analysis Run outbox claim is stale.',
    'A stale fencing token cannot dispatch work'
);

RESET ROLE;

SELECT is(
    (SELECT count(*) FROM public.analysis_jobs),
    0::BIGINT,
    'A rejected dispatch leaves no partial job'
);
SELECT is(
    (
        SELECT published_at
        FROM public.analysis_run_outbox_events
        WHERE analysis_run_outbox_event_id =
            :'claim_analysis_run_outbox_event_id'::UUID
    ),
    NULL::TIMESTAMPTZ,
    'A rejected dispatch leaves the event unpublished'
);

SET LOCAL ROLE service_role;

SELECT analysis_job_id
FROM public.dispatch_analysis_run_outbox_event(
    :'claim_analysis_run_outbox_event_id'::UUID,
    :'claim_claim_token'::UUID
)
\gset job_

RESET ROLE;

SELECT is(
    (SELECT count(*) FROM public.analysis_jobs WHERE analysis_run_id = :'run_analysis_run_id'::UUID),
    1::BIGINT,
    'Dispatch creates exactly one job for the run'
);
SELECT results_eq(
    format(
        'SELECT job_kind, job_version, attempt_count, max_attempts FROM public.analysis_jobs WHERE analysis_job_id = %L',
        :'job_analysis_job_id'::UUID
    ),
    $$VALUES ('analysis.execute'::TEXT, 1::SMALLINT, 0, 5)$$,
    'The job catalogue entry is versioned and starts unattempted'
);
SELECT results_eq(
    format(
        'SELECT traceparent, tracestate FROM public.analysis_jobs WHERE analysis_job_id = %L',
        :'job_analysis_job_id'::UUID
    ),
    $$VALUES (
        '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'::TEXT,
        'omoikane=dispatch'::TEXT
    )$$,
    'Dispatch preserves the originating W3C trace carrier'
);
SELECT results_eq(
    format(
        'SELECT sequence_number, state, job_id FROM public.analysis_run_lifecycle_events WHERE analysis_run_id = %L ORDER BY sequence_number',
        :'run_analysis_run_id'::UUID
    ),
    format(
        $$VALUES (1::BIGINT, 'created'::TEXT, NULL::UUID), (2::BIGINT, 'queued'::TEXT, %L::UUID)$$,
        :'job_analysis_job_id'::UUID
    ),
    'Dispatch appends one queued lifecycle fact after created'
);
SELECT ok(
    (
        SELECT published_at
        FROM public.analysis_run_outbox_events
        WHERE analysis_run_outbox_event_id =
            :'claim_analysis_run_outbox_event_id'::UUID
    ) IS NOT NULL,
    'The source event is published in the dispatch transaction'
);

SET LOCAL ROLE service_role;

SELECT is(
    (
        SELECT analysis_job_id
        FROM public.dispatch_analysis_run_outbox_event(
            :'claim_analysis_run_outbox_event_id'::UUID,
            :'claim_claim_token'::UUID
        )
    ),
    :'job_analysis_job_id'::UUID,
    'Replaying the successful lease returns the existing job'
);

RESET ROLE;

SELECT is(
    (SELECT count(*) FROM public.analysis_jobs WHERE analysis_run_id = :'run_analysis_run_id'::UUID),
    1::BIGINT,
    'Replay does not duplicate the job'
);
SELECT is(
    (
        SELECT count(*)
        FROM public.analysis_run_lifecycle_events
        WHERE analysis_run_id = :'run_analysis_run_id'::UUID
          AND state = 'queued'
    ),
    1::BIGINT,
    'Replay does not duplicate queued lifecycle history'
);
SELECT is(
    (SELECT count(*) FROM public.analysis_job_attempts),
    0::BIGINT,
    'Dispatch does not start a worker attempt'
);

SET LOCAL ROLE anon;

SELECT throws_ok(
    'SELECT * FROM public.analysis_jobs',
    '42501',
    'permission denied for table analysis_jobs',
    'Anonymous callers cannot read durable jobs'
);
SELECT throws_ok(
    $$SELECT public.claim_analysis_run_outbox_event('browser')$$,
    '42501',
    'permission denied for function claim_analysis_run_outbox_event',
    'Anonymous callers cannot claim outbox events'
);

RESET ROLE;
SET LOCAL ROLE authenticated;

SELECT throws_ok(
    'SELECT * FROM public.analysis_job_attempts',
    '42501',
    'permission denied for table analysis_job_attempts',
    'Authenticated browser callers cannot read attempt internals'
);
SELECT throws_ok(
    format(
        'SELECT public.dispatch_analysis_run_outbox_event(%L, %L)',
        :'claim_analysis_run_outbox_event_id'::UUID,
        :'claim_claim_token'::UUID
    ),
    '42501',
    'permission denied for function dispatch_analysis_run_outbox_event',
    'Authenticated browser callers cannot dispatch work'
);

RESET ROLE;
SET LOCAL ROLE service_role;

SELECT throws_ok(
    'SELECT * FROM public.analysis_jobs',
    '42501',
    'permission denied for table analysis_jobs',
    'The service role must use narrow job commands'
);
SELECT throws_ok(
    'SELECT * FROM public.analysis_job_attempts',
    '42501',
    'permission denied for table analysis_job_attempts',
    'The service role cannot mutate attempt storage directly'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
