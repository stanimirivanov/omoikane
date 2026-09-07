BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(17);

SELECT has_table('public', 'analysis_runs', 'Analysis Runs are persisted');
SELECT has_function(
    'public',
    'start_analysis_run',
    ARRAY['uuid', 'uuid', 'timestamp with time zone', 'timestamp with time zone', 'uuid', 'text', 'text'],
    'The privileged start command exists'
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
        statement_timestamp() - INTERVAL '7 days',
        statement_timestamp(),
        '10000000-0000-4000-8000-000000000001'::UUID,
        '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        'omoikane=test'
    ),
    'An active workspace member can start an Analysis Run'
);

RESET ROLE;

SELECT analysis_run_id
FROM public.analysis_runs
WHERE workspace_id = :'workspace_workspace_id'
ORDER BY created_at DESC
LIMIT 1
\gset analysis_

SELECT is(
    (SELECT status FROM public.analysis_runs WHERE analysis_run_id = :'analysis_analysis_run_id'),
    'created',
    'The deterministic run starts in created state'
);

SELECT is(
    (SELECT requested_by::text FROM public.analysis_runs WHERE analysis_run_id = :'analysis_analysis_run_id'),
    '10000000-0000-4000-8000-000000000001',
    'The command records the authenticated requester'
);

SELECT is(
    (SELECT channel_id FROM public.analysis_runs WHERE analysis_run_id = :'analysis_analysis_run_id'),
    :'channel_channel_id'::UUID,
    'The command records the selected channel as immutable request scope'
);

SELECT is(
    (
        SELECT time_range_end - time_range_start
        FROM public.analysis_runs
        WHERE analysis_run_id = :'analysis_analysis_run_id'
    ),
    INTERVAL '7 days',
    'The command records the bounded time range as immutable request scope'
);

SET LOCAL ROLE service_role;

SELECT results_eq(
    format(
        'SELECT analysis_run_id FROM public.get_analysis_run(%L, %L, %L)',
        :'workspace_workspace_id'::UUID,
        :'analysis_analysis_run_id'::UUID,
        '10000000-0000-4000-8000-000000000001'::UUID
    ),
    format('VALUES (%L::UUID)', :'analysis_analysis_run_id'),
    'An active member can observe the created run'
);

SELECT throws_ok(
    format(
        'SELECT public.start_analysis_run(%L, %L, %L, %L, %L, %L, NULL)',
        :'workspace_workspace_id'::UUID,
        :'channel_channel_id'::UUID,
        clock_timestamp() - INTERVAL '7 days',
        clock_timestamp(),
        '10000000-0000-4000-8000-000000000003'::UUID,
        '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    ),
    'P0002',
    'Analysis Run resource is not accessible.',
    'An outsider cannot start a run'
);

RESET ROLE;

SET LOCAL ROLE service_role;

SELECT throws_ok(
    format(
        'SELECT public.start_analysis_run(%L, %L, %L, %L, %L, %L, NULL)',
        :'workspace_workspace_id'::UUID,
        'ffffffff-ffff-4fff-8fff-ffffffffffff'::UUID,
        clock_timestamp() - INTERVAL '7 days',
        clock_timestamp(),
        '10000000-0000-4000-8000-000000000001'::UUID,
        '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    ),
    'P0002',
    'Analysis Run resource is not accessible.',
    'An unknown or cross-workspace channel is deliberately indistinguishable from inaccessible scope'
);

RESET ROLE;

SET LOCAL ROLE service_role;

SELECT throws_ok(
    format(
        'SELECT public.start_analysis_run(%L, %L, %L, %L, %L, %L, NULL)',
        :'workspace_workspace_id'::UUID,
        :'channel_channel_id'::UUID,
        clock_timestamp(),
        clock_timestamp() - INTERVAL '1 day',
        '10000000-0000-4000-8000-000000000001'::UUID,
        '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    ),
    '22023',
    'Analysis Run time range is invalid.',
    'A reversed time range is rejected'
);

SELECT throws_ok(
    format(
        'SELECT public.start_analysis_run(%L, %L, %L, %L, %L, %L, NULL)',
        :'workspace_workspace_id'::UUID,
        :'channel_channel_id'::UUID,
        clock_timestamp() - INTERVAL '31 days 1 second',
        clock_timestamp(),
        '10000000-0000-4000-8000-000000000001'::UUID,
        '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    ),
    '22023',
    'Analysis Run time range is invalid.',
    'A time range longer than 31 days is rejected'
);

SELECT throws_ok(
    format(
        'SELECT public.start_analysis_run(%L, %L, %L, %L, %L, %L, NULL)',
        :'workspace_workspace_id'::UUID,
        :'channel_channel_id'::UUID,
        clock_timestamp(),
        clock_timestamp() + INTERVAL '1 day',
        '10000000-0000-4000-8000-000000000001'::UUID,
        '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    ),
    '22023',
    'Analysis Run time range is invalid.',
    'A future time-range end is rejected'
);

SELECT throws_ok(
    format(
        'SELECT public.start_analysis_run(%L, %L, NULL, NULL, %L, %L, NULL)',
        :'workspace_workspace_id'::UUID,
        :'channel_channel_id'::UUID,
        '10000000-0000-4000-8000-000000000001'::UUID,
        '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    ),
    '22023',
    'Analysis Run time range is invalid.',
    'A missing time range is rejected'
);

RESET ROLE;

SELECT throws_ok(
    format(
        'INSERT INTO public.analysis_runs (workspace_id, requested_by) VALUES (%L, %L)',
        :'workspace_workspace_id'::UUID,
        '10000000-0000-4000-8000-000000000001'::UUID
    ),
    '23514',
    NULL,
    'New persistence cannot bypass the required channel scope'
);

SELECT is(
    (SELECT count(*) FROM public.analysis_runs WHERE workspace_id = :'workspace_workspace_id'),
    1::BIGINT,
    'Rejected requests do not create records'
);

SELECT throws_ok(
    format(
        'UPDATE public.analysis_runs SET status = %L WHERE analysis_run_id = %L',
        'created',
        :'analysis_analysis_run_id'
    ),
    '55000',
    'Analysis Run records are immutable.',
    'Analysis Run records cannot be updated'
);

SELECT * FROM finish();
ROLLBACK;
