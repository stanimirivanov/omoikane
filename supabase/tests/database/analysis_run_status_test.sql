BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(12);

CREATE FUNCTION pg_temp.test_analysis_result()
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
    SELECT '{"kind":"workspace-message-inventory","processorVersion":"analysis.deterministic.v1","providerKind":"deterministic","model":null,"evaluationVersion":"workspace-message-inventory.v1","sourceCount":0,"sourceTruncated":false,"sources":[],"summary":"Analyzed 0 active messages from 0 participants.","finding":{"kind":"workspace-message-inventory","status":"proposed","title":"Workspace message inventory","summary":"Analyzed 0 active messages from 0 participants.","confidence":1}}'::JSONB
$$;

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
    'omoikane=status'
)
\gset run_

SELECT is(
    (
        SELECT status
        FROM public.get_analysis_run(
            :'workspace_workspace_id'::UUID,
            :'run_analysis_run_id'::UUID,
            '10000000-0000-4000-8000-000000000001'::UUID
        )
    ),
    'created'::TEXT,
    'A newly accepted run projects created status'
);
SELECT is(
    (
        SELECT failure_category
        FROM public.get_analysis_run(
            :'workspace_workspace_id'::UUID,
            :'run_analysis_run_id'::UUID,
            '10000000-0000-4000-8000-000000000001'::UUID
        )
    ),
    NULL::TEXT,
    'A non-failed run exposes no failure category'
);

SELECT analysis_run_outbox_event_id, claim_token
FROM public.claim_analysis_run_outbox_event('status-dispatcher')
\gset outbox_
SELECT analysis_job_id
FROM public.dispatch_analysis_run_outbox_event(
    :'outbox_analysis_run_outbox_event_id'::UUID,
    :'outbox_claim_token'::UUID
)
\gset job_

SELECT is(
    (
        SELECT status
        FROM public.get_analysis_run(
            :'workspace_workspace_id'::UUID,
            :'run_analysis_run_id'::UUID,
            '10000000-0000-4000-8000-000000000001'::UUID
        )
    ),
    'queued'::TEXT,
    'Dispatch projects queued status'
);

SELECT *
FROM public.acquire_analysis_job(
    'status-worker-1',
    'analysis.deterministic.v1',
    60
)
\gset first_

SELECT is(
    (
        SELECT status
        FROM public.get_analysis_run(
            :'workspace_workspace_id'::UUID,
            :'run_analysis_run_id'::UUID,
            '10000000-0000-4000-8000-000000000001'::UUID
        )
    ),
    'running'::TEXT,
    'Acquisition projects running status'
);

SELECT *
FROM public.complete_analysis_job_failure(
    :'first_analysis_job_id'::UUID,
    :'first_analysis_job_attempt_id'::UUID,
    :'first_lease_token'::UUID,
    'provider.timeout',
    TRUE,
    5
)
\gset retry_

SELECT is(
    (
        SELECT status
        FROM public.get_analysis_run(
            :'workspace_workspace_id'::UUID,
            :'run_analysis_run_id'::UUID,
            '10000000-0000-4000-8000-000000000001'::UUID
        )
    ),
    'queued'::TEXT,
    'Retry scheduling projects queued status again'
);

RESET ROLE;
UPDATE public.analysis_jobs
SET available_at = clock_timestamp() - interval '1 second'
WHERE analysis_job_id = :'job_analysis_job_id'::UUID;
SET LOCAL ROLE service_role;

SELECT *
FROM public.acquire_analysis_job(
    'status-worker-2',
    'analysis.deterministic.v1',
    60
)
\gset second_
SELECT *
FROM public.complete_analysis_job_failure(
    :'second_analysis_job_id'::UUID,
    :'second_analysis_job_attempt_id'::UUID,
    :'second_lease_token'::UUID,
    'input.unsupported',
    FALSE,
    7
)
\gset terminal_

SELECT is(
    (
        SELECT status
        FROM public.get_analysis_run(
            :'workspace_workspace_id'::UUID,
            :'run_analysis_run_id'::UUID,
            '10000000-0000-4000-8000-000000000001'::UUID
        )
    ),
    'failed'::TEXT,
    'Terminal completion projects failed status'
);
SELECT is(
    (
        SELECT failure_category
        FROM public.get_analysis_run(
            :'workspace_workspace_id'::UUID,
            :'run_analysis_run_id'::UUID,
            '10000000-0000-4000-8000-000000000001'::UUID
        )
    ),
    'input.unsupported'::TEXT,
    'Failed status includes only its bounded failure category'
);

SELECT analysis_run_id
FROM public.start_analysis_run(
    :'workspace_workspace_id'::UUID,
    :'channel_channel_id'::UUID,
    clock_timestamp() - INTERVAL '7 days',
    clock_timestamp(),
    '10000000-0000-4000-8000-000000000001'::UUID,
    '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    'omoikane=status-success'
)
\gset success_run_
SELECT analysis_run_outbox_event_id, claim_token
FROM public.claim_analysis_run_outbox_event('status-success-dispatcher')
\gset success_outbox_
SELECT analysis_job_id
FROM public.dispatch_analysis_run_outbox_event(
    :'success_outbox_analysis_run_outbox_event_id'::UUID,
    :'success_outbox_claim_token'::UUID
)
\gset success_job_
SELECT *
FROM public.acquire_analysis_job(
    'status-success-worker',
    'analysis.deterministic.v1',
    60
)
\gset success_attempt_
SELECT *
FROM public.complete_analysis_job_success(
    :'success_attempt_analysis_job_id'::UUID,
    :'success_attempt_analysis_job_attempt_id'::UUID,
    :'success_attempt_lease_token'::UUID,
    'analysis.deterministic.v1/status-success',
    3,
    pg_temp.test_analysis_result()
)
\gset success_

SELECT is(
    (
        SELECT status
        FROM public.get_analysis_run(
            :'workspace_workspace_id'::UUID,
            :'success_run_analysis_run_id'::UUID,
            '10000000-0000-4000-8000-000000000001'::UUID
        )
    ),
    'succeeded'::TEXT,
    'Successful completion projects succeeded status'
);
SELECT is(
    (
        SELECT failure_category
        FROM public.get_analysis_run(
            :'workspace_workspace_id'::UUID,
            :'success_run_analysis_run_id'::UUID,
            '10000000-0000-4000-8000-000000000001'::UUID
        )
    ),
    NULL::TEXT,
    'Succeeded status exposes no failure category'
);

SELECT throws_ok(
    format(
        'SELECT public.get_analysis_run(%L, %L, %L)',
        :'workspace_workspace_id',
        :'run_analysis_run_id',
        '10000000-0000-4000-8000-000000000003'
    ),
    'P0002',
    'Analysis Run resource is not accessible.',
    'The projection preserves workspace membership authorization'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT throws_ok(
    format(
        'SELECT public.get_analysis_run(%L, %L, %L)',
        :'workspace_workspace_id',
        :'run_analysis_run_id',
        '10000000-0000-4000-8000-000000000001'
    ),
    '42501',
    NULL,
    'Authenticated clients cannot invoke the privileged projection directly'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok(
    format(
        'SELECT public.get_analysis_run(%L, %L, %L)',
        :'workspace_workspace_id',
        :'run_analysis_run_id',
        '10000000-0000-4000-8000-000000000001'
    ),
    '42501',
    NULL,
    'Anonymous clients cannot invoke the privileged projection directly'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
