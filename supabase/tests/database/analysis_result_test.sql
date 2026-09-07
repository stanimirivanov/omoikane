BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(23);

SELECT has_table('public', 'analysis_results', 'Analysis results are durable');
SELECT has_table('public', 'analysis_result_sources', 'Result evidence is durable');
SELECT has_table('public', 'analysis_findings', 'Proposed findings are durable');
SELECT has_function(
    'public',
    'load_analysis_job_sources',
    ARRAY['uuid', 'uuid', 'uuid'],
    'Workers load sources through one lease-fenced command'
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
    '00-11111111111111111111111111111111-2222222222222222-01',
    'omoikane=result'
)
\gset run_

SELECT analysis_run_outbox_event_id, claim_token
FROM public.claim_analysis_run_outbox_event('result-dispatcher')
\gset outbox_

SELECT analysis_job_id
FROM public.dispatch_analysis_run_outbox_event(
    :'outbox_analysis_run_outbox_event_id'::UUID,
    :'outbox_claim_token'::UUID
)
\gset job_

SELECT *
FROM public.acquire_analysis_job(
    'result-worker',
    'analysis.workspace-message-inventory.v1',
    60
)
\gset attempt_

CREATE TEMPORARY TABLE selected_analysis_sources AS
SELECT * FROM public.load_analysis_job_sources(
    :'attempt_analysis_job_id'::UUID,
    :'attempt_analysis_job_attempt_id'::UUID,
    :'attempt_lease_token'::UUID
);

RESET ROLE;

SELECT ok(
    (SELECT count(*) FROM selected_analysis_sources) > 0,
    'The bounded source selection returns active workspace messages'
);
SELECT ok(
    NOT EXISTS (
        SELECT 1
        FROM selected_analysis_sources AS source
        INNER JOIN public.messages AS message
            ON message.message_id = source.message_id
        WHERE message.workspace_id <> :'workspace_workspace_id'::UUID
           OR message.channel_id <> :'channel_channel_id'::UUID
    ),
    'Every selected source belongs to the run channel'
);
SELECT ok(
    NOT EXISTS (
        SELECT 1
        FROM selected_analysis_sources AS source
        INNER JOIN public.messages AS message
            ON message.message_id = source.message_id
        CROSS JOIN public.analysis_runs AS run
        WHERE run.analysis_run_id = :'run_analysis_run_id'::UUID
          AND (
              message.created_at < run.time_range_start
              OR message.created_at >= run.time_range_end
          )
    ),
    'Every selected source is inside the inclusive-start exclusive-end run range'
);
SELECT ok(
    NOT EXISTS (
        SELECT 1
        FROM selected_analysis_sources AS source
        INNER JOIN public.message_versions AS version
            ON version.message_version_id = source.message_version_id
        WHERE version.message_id <> source.message_id
    ),
    'Every selected source points to an immutable revision of its message'
);

WITH bounded AS (
    SELECT *
    FROM selected_analysis_sources
    ORDER BY message_id
    LIMIT 100
), payload AS (
    SELECT jsonb_build_object(
        'kind', 'workspace-message-inventory',
        'processorVersion', 'analysis.workspace-message-inventory.v1',
        'providerKind', 'deterministic',
        'model', NULL,
        'evaluationVersion', 'workspace-message-inventory.v1',
        'sourceCount', count(*),
        'sourceTruncated', (SELECT count(*) > 100 FROM selected_analysis_sources),
        'sources', coalesce(
            jsonb_agg(jsonb_build_object(
                'messageId', message_id,
                'messageRevisionId', message_version_id
            ) ORDER BY message_id),
            '[]'::JSONB
        ),
        'summary', format(
            'Analyzed %s active messages from %s participants.',
            count(*),
            count(DISTINCT author_user_id)
        ),
        'finding', jsonb_build_object(
            'kind', 'workspace-message-inventory',
            'status', 'proposed',
            'title', 'Workspace message inventory',
            'summary', format(
                'Analyzed %s active messages from %s participants.',
                count(*),
                count(DISTINCT author_user_id)
            ),
            'confidence', 1
        )
    ) AS value
    FROM bounded
)
SELECT value::TEXT AS result FROM payload
\gset payload_

SET LOCAL ROLE service_role;

SELECT throws_ok(
    format(
        'SELECT public.complete_analysis_job_success(%L, %L, %L, %L, 5, %L::JSONB)',
        :'attempt_analysis_job_id'::UUID,
        :'attempt_analysis_job_attempt_id'::UUID,
        :'attempt_lease_token'::UUID,
        'analysis.workspace-message-inventory.v1/result-fixture',
        (:'payload_result'::JSONB - 'sourceCount')::TEXT
    ),
    '22023',
    'Analysis result source set is invalid.',
    'Completion rejects a result whose source count is missing'
);

SELECT analysis_job_id
FROM public.complete_analysis_job_success(
    :'attempt_analysis_job_id'::UUID,
    :'attempt_analysis_job_attempt_id'::UUID,
    :'attempt_lease_token'::UUID,
    'analysis.workspace-message-inventory.v1/result-fixture',
    5,
    :'payload_result'::JSONB
)
\gset completed_

RESET ROLE;

SELECT is(
    :'completed_analysis_job_id'::UUID,
    :'job_analysis_job_id'::UUID,
    'The lease owner commits its result'
);
SELECT is(
    (SELECT count(*) FROM public.analysis_results WHERE analysis_run_id = :'run_analysis_run_id'::UUID),
    1::BIGINT,
    'Completion persists exactly one result'
);
SELECT is(
    (
        SELECT count(*)
        FROM public.analysis_result_sources AS source
        INNER JOIN public.analysis_results AS result USING (analysis_result_id)
        WHERE result.analysis_run_id = :'run_analysis_run_id'::UUID
    ),
    (SELECT least(count(*), 100) FROM selected_analysis_sources),
    'Completion persists every selected immutable source reference'
);
SELECT results_eq(
    format(
        'SELECT finding_kind, finding_status, confidence FROM public.analysis_findings AS finding INNER JOIN public.analysis_results AS result USING (analysis_result_id) WHERE result.analysis_run_id = %L',
        :'run_analysis_run_id'::UUID
    ),
    $$VALUES ('workspace-message-inventory'::TEXT, 'proposed'::TEXT, 1.000::NUMERIC)$$,
    'The deterministic output creates one proposed finding'
);

SET LOCAL ROLE service_role;

SELECT results_eq(
    format(
        'SELECT status, result->>''kind'', (result->>''sourceCount'')::INTEGER FROM public.get_analysis_run(%L, %L, %L)',
        :'workspace_workspace_id'::UUID,
        :'run_analysis_run_id'::UUID,
        '10000000-0000-4000-8000-000000000001'::UUID
    ),
    format(
        $$VALUES ('succeeded'::TEXT, 'workspace-message-inventory'::TEXT, %s::INTEGER)$$,
        (SELECT least(count(*), 100) FROM selected_analysis_sources)
    ),
    'The authorized run projection includes its completed result'
);

SELECT lives_ok(
    format(
        'SELECT public.complete_analysis_job_success(%L, %L, %L, %L, 5, %L::JSONB)',
        :'attempt_analysis_job_id'::UUID,
        :'attempt_analysis_job_attempt_id'::UUID,
        :'attempt_lease_token'::UUID,
        'analysis.workspace-message-inventory.v1/result-fixture',
        :'payload_result'
    ),
    'Replaying the same completion observes the committed result'
);

RESET ROLE;

SELECT is(
    (SELECT count(*) FROM public.analysis_results WHERE analysis_run_id = :'run_analysis_run_id'::UUID),
    1::BIGINT,
    'Completion replay does not duplicate the result'
);
SELECT throws_ok(
    format(
        'UPDATE public.analysis_results SET summary = %L WHERE analysis_run_id = %L',
        'rewritten',
        :'run_analysis_run_id'::UUID
    ),
    '55000',
    'Analysis output records are immutable.',
    'A result cannot be rewritten'
);
SELECT throws_ok(
    $$DELETE FROM public.analysis_result_sources$$,
    '55000',
    'Analysis output records are immutable.',
    'Evidence references cannot be deleted'
);
SELECT throws_ok(
    $$UPDATE public.analysis_findings SET finding_status = 'confirmed'$$,
    '55000',
    'Analysis output records are immutable.',
    'A proposed finding cannot be rewritten by review'
);

SET LOCAL ROLE authenticated;

SELECT throws_ok(
    $$SELECT * FROM public.analysis_results$$,
    '42501',
    'permission denied for table analysis_results',
    'Browser callers cannot read internal result rows directly'
);
SELECT throws_ok(
    format(
        'SELECT * FROM public.load_analysis_job_sources(%L, %L, %L)',
        :'attempt_analysis_job_id'::UUID,
        :'attempt_analysis_job_attempt_id'::UUID,
        :'attempt_lease_token'::UUID
    ),
    '42501',
    'permission denied for function load_analysis_job_sources',
    'Browser callers cannot load worker sources'
);

RESET ROLE;

SET LOCAL ROLE service_role;

SELECT analysis_run_id
FROM public.start_analysis_run(
    :'workspace_workspace_id'::UUID,
    :'channel_channel_id'::UUID,
    clock_timestamp() - INTERVAL '7 days',
    clock_timestamp(),
    '10000000-0000-4000-8000-000000000002'::UUID,
    '00-33333333333333333333333333333333-4444444444444444-01',
    NULL
)
\gset revoked_run_

SELECT analysis_run_outbox_event_id, claim_token
FROM public.claim_analysis_run_outbox_event('revoked-dispatcher')
\gset revoked_outbox_

SELECT analysis_job_id
FROM public.dispatch_analysis_run_outbox_event(
    :'revoked_outbox_analysis_run_outbox_event_id'::UUID,
    :'revoked_outbox_claim_token'::UUID
)
\gset revoked_job_

SELECT *
FROM public.acquire_analysis_job(
    'revoked-worker',
    'analysis.workspace-message-inventory.v1',
    60
)
\gset revoked_attempt_

RESET ROLE;

UPDATE public.workspace_membership_heads
SET membership_status = 'removed'
WHERE workspace_id = :'workspace_workspace_id'::UUID
  AND user_id = '10000000-0000-4000-8000-000000000002'::UUID;

SET LOCAL ROLE service_role;

SELECT throws_ok(
    format(
        'SELECT * FROM public.load_analysis_job_sources(%L, %L, %L)',
        :'revoked_attempt_analysis_job_id'::UUID,
        :'revoked_attempt_analysis_job_attempt_id'::UUID,
        :'revoked_attempt_lease_token'::UUID
    ),
    'P0004',
    'Analysis source access was revoked.',
    'The worker cannot read content after requester access is revoked'
);

SELECT analysis_run_id
FROM public.start_analysis_run(
    :'workspace_workspace_id'::UUID,
    :'channel_channel_id'::UUID,
    clock_timestamp() - INTERVAL '7 days',
    clock_timestamp(),
    '10000000-0000-4000-8000-000000000001'::UUID,
    '00-55555555555555555555555555555555-6666666666666666-01',
    NULL
)
\gset archived_run_

SELECT analysis_run_outbox_event_id, claim_token
FROM public.claim_analysis_run_outbox_event('archived-channel-dispatcher')
\gset archived_outbox_

SELECT analysis_job_id
FROM public.dispatch_analysis_run_outbox_event(
    :'archived_outbox_analysis_run_outbox_event_id'::UUID,
    :'archived_outbox_claim_token'::UUID
)
\gset archived_job_

SELECT *
FROM public.acquire_analysis_job(
    'archived-channel-worker',
    'analysis.workspace-message-inventory.v1',
    60
)
\gset archived_attempt_

RESET ROLE;

UPDATE public.channel_heads
SET channel_status = 'archived'
WHERE channel_id = :'channel_channel_id'::UUID;

SET LOCAL ROLE service_role;

SELECT throws_ok(
    format(
        'SELECT * FROM public.load_analysis_job_sources(%L, %L, %L)',
        :'archived_attempt_analysis_job_id'::UUID,
        :'archived_attempt_analysis_job_attempt_id'::UUID,
        :'archived_attempt_lease_token'::UUID
    ),
    'P0004',
    'Analysis source access was revoked.',
    'The worker cannot select messages after the run channel is archived'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
