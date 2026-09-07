BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(18);

SELECT has_table(
    'public',
    'analysis_run_lifecycle_events',
    'Analysis Run lifecycle events are persisted'
);
SELECT has_table(
    'public',
    'analysis_run_outbox_events',
    'Analysis Run outbox events are persisted'
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

SELECT lives_ok(
    format(
        'SELECT public.start_analysis_run(%L, %L, %L, %L, %L, %L, %L)',
        :'workspace_workspace_id'::UUID,
        :'channel_channel_id'::UUID,
        clock_timestamp() - INTERVAL '7 days',
        clock_timestamp(),
        '10000000-0000-4000-8000-000000000001'::UUID,
        '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        'omoikane=test'
    ),
    'The start command atomically accepts processing correlation metadata'
);

RESET ROLE;

SELECT analysis_run_id
FROM public.analysis_runs
WHERE workspace_id = :'workspace_workspace_id'
ORDER BY created_at DESC
LIMIT 1
\gset analysis_

SELECT is(
    (
        SELECT count(*)
        FROM public.analysis_run_lifecycle_events
        WHERE analysis_run_id = :'analysis_analysis_run_id'
    ),
    1::BIGINT,
    'Starting a run creates exactly one lifecycle event'
);

SELECT results_eq(
    format(
        'SELECT sequence_number, state FROM public.analysis_run_lifecycle_events WHERE analysis_run_id = %L',
        :'analysis_analysis_run_id'::UUID
    ),
    $$VALUES (1::BIGINT, 'created'::TEXT)$$,
    'The initial lifecycle event is the first created fact'
);

SELECT is(
    (
        SELECT count(*)
        FROM public.analysis_run_outbox_events
        WHERE analysis_run_id = :'analysis_analysis_run_id'
    ),
    1::BIGINT,
    'Starting a run creates exactly one outbox event'
);

SELECT results_eq(
    format(
        'SELECT event_name, event_version, traceparent, tracestate FROM public.analysis_run_outbox_events WHERE analysis_run_id = %L',
        :'analysis_analysis_run_id'::UUID
    ),
    $$VALUES (
        'analysis_run.requested'::TEXT,
        1::SMALLINT,
        '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'::TEXT,
        'omoikane=test'::TEXT
    )$$,
    'The outbox event stores only the versioned intent and trace carrier'
);

SELECT is(
    (
        SELECT workspace_id
        FROM public.analysis_run_outbox_events
        WHERE analysis_run_id = :'analysis_analysis_run_id'
    ),
    :'workspace_workspace_id'::UUID,
    'The outbox event retains authoritative workspace scope'
);

SELECT throws_ok(
    format(
        'UPDATE public.analysis_run_lifecycle_events SET occurred_at = now() WHERE analysis_run_id = %L',
        :'analysis_analysis_run_id'::UUID
    ),
    '55000',
    'Analysis Run lifecycle events are immutable.',
    'Lifecycle events cannot be updated'
);

SELECT throws_ok(
    format(
        'DELETE FROM public.analysis_run_lifecycle_events WHERE analysis_run_id = %L',
        :'analysis_analysis_run_id'::UUID
    ),
    '55000',
    'Analysis Run lifecycle events are immutable.',
    'Lifecycle events cannot be deleted'
);

SELECT throws_ok(
    format(
        'INSERT INTO public.analysis_run_outbox_events (analysis_run_id, workspace_id, traceparent) VALUES (%L, %L, %L)',
        :'analysis_analysis_run_id'::UUID,
        :'workspace_workspace_id'::UUID,
        '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    ),
    '23505',
    NULL,
    'One event version can be emitted only once for a run'
);

SELECT count(*) AS run_count_before_invalid_trace
FROM public.analysis_runs
WHERE workspace_id = :'workspace_workspace_id'
\gset before_

SET LOCAL ROLE service_role;

SELECT throws_ok(
    format(
        'SELECT public.start_analysis_run(%L, %L, %L, %L, %L, %L, NULL)',
        :'workspace_workspace_id'::UUID,
        :'channel_channel_id'::UUID,
        clock_timestamp() - INTERVAL '7 days',
        clock_timestamp(),
        '10000000-0000-4000-8000-000000000001'::UUID,
        'not-a-traceparent'
    ),
    '23514',
    NULL,
    'Malformed trace correlation rejects the complete start transaction'
);

RESET ROLE;

SELECT is(
    (
        SELECT count(*)
        FROM public.analysis_runs
        WHERE workspace_id = :'workspace_workspace_id'
    ),
    :'before_run_count_before_invalid_trace'::BIGINT,
    'A rejected outbox write rolls back the Analysis Run record'
);

SET LOCAL ROLE anon;

SELECT throws_ok(
    'SELECT * FROM public.analysis_run_lifecycle_events',
    '42501',
    'permission denied for table analysis_run_lifecycle_events',
    'Anonymous callers cannot read lifecycle internals'
);

SELECT throws_ok(
    'SELECT * FROM public.analysis_run_outbox_events',
    '42501',
    'permission denied for table analysis_run_outbox_events',
    'Anonymous callers cannot read outbox internals'
);

RESET ROLE;
SET LOCAL ROLE authenticated;

SELECT throws_ok(
    'SELECT * FROM public.analysis_run_lifecycle_events',
    '42501',
    'permission denied for table analysis_run_lifecycle_events',
    'Authenticated browser callers cannot read lifecycle internals'
);

SELECT throws_ok(
    'SELECT * FROM public.analysis_run_outbox_events',
    '42501',
    'permission denied for table analysis_run_outbox_events',
    'Authenticated browser callers cannot read outbox internals'
);

RESET ROLE;
SET LOCAL ROLE service_role;

SELECT throws_ok(
    'SELECT * FROM public.analysis_run_outbox_events',
    '42501',
    'permission denied for table analysis_run_outbox_events',
    'The service role must use narrow commands instead of direct outbox access'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
