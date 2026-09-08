BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(18);

SELECT has_table(
    'public',
    'analysis_run_source_snapshots',
    'Analysis Run source snapshot metadata is durable'
);
SELECT has_table(
    'public',
    'analysis_run_source_snapshot_items',
    'Analysis Run source identities are durable'
);
SELECT has_function(
    'public',
    'load_analysis_job_sources',
    ARRAY['uuid', 'uuid', 'uuid'],
    'Workers create or observe a source snapshot through one lease-fenced command'
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

INSERT INTO public.messages (
    message_id,
    workspace_id,
    channel_id,
    author_user_id,
    created_at
)
VALUES
    ('a0000000-0000-4000-8000-000000000001', :'workspace_workspace_id', :'channel_channel_id', '10000000-0000-4000-8000-000000000001', '2026-01-02T09:00:00Z'),
    ('a0000000-0000-4000-8000-000000000002', :'workspace_workspace_id', :'channel_channel_id', '10000000-0000-4000-8000-000000000001', '2026-01-03T09:00:00Z'),
    ('a0000000-0000-4000-8000-000000000003', :'workspace_workspace_id', :'channel_channel_id', '10000000-0000-4000-8000-000000000001', '2026-01-04T09:00:00Z'),
    ('a0000000-0000-4000-8000-000000000004', :'workspace_workspace_id', :'channel_channel_id', '10000000-0000-4000-8000-000000000001', '2025-12-31T09:00:00Z');

INSERT INTO public.message_versions (
    message_version_id,
    message_id,
    version_number,
    content,
    created_by,
    created_at
)
VALUES
    ('a1000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000001', 1, 'first revision', '10000000-0000-4000-8000-000000000001', '2026-01-02T09:00:00Z'),
    ('a1000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000001', 2, 'revision before the boundary', '10000000-0000-4000-8000-000000000001', '2026-01-05T09:00:00Z'),
    ('a1000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000001', 3, 'revision after the boundary', '10000000-0000-4000-8000-000000000001', '2026-01-12T09:00:00Z'),
    ('a1000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-000000000002', 1, 'deleted before the boundary', '10000000-0000-4000-8000-000000000001', '2026-01-03T09:00:00Z'),
    ('a1000000-0000-4000-8000-000000000031', 'a0000000-0000-4000-8000-000000000003', 1, 'deleted after the boundary', '10000000-0000-4000-8000-000000000001', '2026-01-04T09:00:00Z'),
    ('a1000000-0000-4000-8000-000000000041', 'a0000000-0000-4000-8000-000000000004', 1, 'created before the range', '10000000-0000-4000-8000-000000000001', '2025-12-31T09:00:00Z');

INSERT INTO public.message_heads (
    message_id,
    workspace_id,
    channel_id,
    latest_message_version_id,
    latest_version_number,
    message_status,
    deleted_by,
    deleted_at
)
VALUES
    ('a0000000-0000-4000-8000-000000000001', :'workspace_workspace_id', :'channel_channel_id', 'a1000000-0000-4000-8000-000000000013', 3, 'active', NULL, NULL),
    ('a0000000-0000-4000-8000-000000000002', :'workspace_workspace_id', :'channel_channel_id', 'a1000000-0000-4000-8000-000000000021', 1, 'deleted', '10000000-0000-4000-8000-000000000001', '2026-01-08T09:00:00Z'),
    ('a0000000-0000-4000-8000-000000000003', :'workspace_workspace_id', :'channel_channel_id', 'a1000000-0000-4000-8000-000000000031', 1, 'deleted', '10000000-0000-4000-8000-000000000001', '2026-01-12T09:00:00Z'),
    ('a0000000-0000-4000-8000-000000000004', :'workspace_workspace_id', :'channel_channel_id', 'a1000000-0000-4000-8000-000000000041', 1, 'active', NULL, NULL);

SET LOCAL ROLE service_role;

SELECT analysis_run_id
FROM public.start_analysis_run(
    :'workspace_workspace_id'::UUID,
    :'channel_channel_id'::UUID,
    '2026-01-01T00:00:00Z',
    '2026-01-10T00:00:00Z',
    '10000000-0000-4000-8000-000000000001'::UUID,
    '00-11111111111111111111111111111111-2222222222222222-01',
    NULL
)
\gset run_

SELECT analysis_run_outbox_event_id, claim_token
FROM public.claim_analysis_run_outbox_event('snapshot-dispatcher')
\gset outbox_

SELECT analysis_job_id
FROM public.dispatch_analysis_run_outbox_event(
    :'outbox_analysis_run_outbox_event_id'::UUID,
    :'outbox_claim_token'::UUID
)
\gset job_

SELECT *
FROM public.acquire_analysis_job(
    'snapshot-worker',
    'analysis.workspace-message-inventory.v1',
    60
)
\gset attempt_

SELECT results_eq(
    format(
        'SELECT message_id, message_version_id, source_truncated FROM public.load_analysis_job_sources(%L, %L, %L)',
        :'attempt_analysis_job_id'::UUID,
        :'attempt_analysis_job_attempt_id'::UUID,
        :'attempt_lease_token'::UUID
    ),
    $$VALUES
        ('a0000000-0000-4000-8000-000000000001'::UUID, 'a1000000-0000-4000-8000-000000000012'::UUID, FALSE),
        ('a0000000-0000-4000-8000-000000000003'::UUID, 'a1000000-0000-4000-8000-000000000031'::UUID, FALSE)$$,
    'The snapshot uses chronological historical revisions and deletion state at the range end'
);

RESET ROLE;

SELECT results_eq(
    format(
        'SELECT source_count, source_truncated FROM public.analysis_run_source_snapshots WHERE analysis_run_id = %L',
        :'run_analysis_run_id'::UUID
    ),
    $$VALUES (2, FALSE)$$,
    'Snapshot metadata records the complete bounded source set'
);
SELECT is(
    (
        SELECT count(*)
        FROM public.analysis_run_source_snapshot_items
        WHERE analysis_run_id = :'run_analysis_run_id'::UUID
    ),
    2::BIGINT,
    'The selected message and revision identities are persisted once'
);

INSERT INTO public.message_versions (
    message_version_id,
    message_id,
    version_number,
    content,
    created_by,
    created_at
)
VALUES (
    'a1000000-0000-4000-8000-000000000014',
    'a0000000-0000-4000-8000-000000000001',
    4,
    'backdated revision added after snapshot acquisition',
    '10000000-0000-4000-8000-000000000001',
    '2026-01-06T09:00:00Z'
);
UPDATE public.message_heads
SET latest_message_version_id = 'a1000000-0000-4000-8000-000000000014',
    latest_version_number = 4,
    updated_at = clock_timestamp()
WHERE message_id = 'a0000000-0000-4000-8000-000000000001';

SET LOCAL ROLE service_role;

SELECT *
FROM public.complete_analysis_job_failure(
    :'attempt_analysis_job_id'::UUID,
    :'attempt_analysis_job_attempt_id'::UUID,
    :'attempt_lease_token'::UUID,
    'provider.unavailable',
    TRUE,
    1
);

RESET ROLE;

UPDATE public.analysis_jobs
SET available_at = clock_timestamp() - INTERVAL '1 second'
WHERE analysis_job_id = :'job_analysis_job_id'::UUID;

SET LOCAL ROLE service_role;

SELECT *
FROM public.acquire_analysis_job(
    'snapshot-recovery-worker',
    'analysis.workspace-message-inventory.v1',
    60
)
\gset recovered_attempt_

SELECT results_eq(
    format(
        'SELECT message_id, message_version_id, source_truncated FROM public.load_analysis_job_sources(%L, %L, %L)',
        :'recovered_attempt_analysis_job_id'::UUID,
        :'recovered_attempt_analysis_job_attempt_id'::UUID,
        :'recovered_attempt_lease_token'::UUID
    ),
    $$VALUES
        ('a0000000-0000-4000-8000-000000000001'::UUID, 'a1000000-0000-4000-8000-000000000012'::UUID, FALSE),
        ('a0000000-0000-4000-8000-000000000003'::UUID, 'a1000000-0000-4000-8000-000000000031'::UUID, FALSE)$$,
    'A recovered attempt observes the original snapshot instead of recomputing sources'
);

RESET ROLE;

SELECT throws_ok(
    format(
        $sql$
            INSERT INTO public.analysis_results (
                analysis_run_id,
                result_kind,
                processor_version,
                provider_kind,
                model,
                evaluation_version,
                result_fingerprint,
                source_count,
                source_truncated,
                summary
            )
            VALUES (
                %L,
                'workspace-message-inventory',
                'analysis.workspace-message-inventory.v1',
                'deterministic',
                NULL,
                'workspace-message-inventory.v1',
                'invalid-snapshot-metadata',
                1,
                FALSE,
                'Invalid snapshot metadata test.'
            )
        $sql$,
        :'run_analysis_run_id'::UUID
    ),
    '22023',
    'Analysis result source metadata does not match its snapshot.',
    'An inventory result must preserve snapshot count and truncation metadata'
);

INSERT INTO public.analysis_results (
    analysis_result_id,
    analysis_run_id,
    result_kind,
    processor_version,
    provider_kind,
    model,
    evaluation_version,
    result_fingerprint,
    source_count,
    source_truncated,
    summary
)
VALUES (
    'a2000000-0000-4000-8000-000000000001',
    :'run_analysis_run_id',
    'workspace-message-inventory',
    'analysis.workspace-message-inventory.v1',
    'deterministic',
    NULL,
    'workspace-message-inventory.v1',
    'snapshot-scope-test',
    2,
    FALSE,
    'Snapshot evidence scope test.'
);

SELECT throws_ok(
    $$
        INSERT INTO public.analysis_result_sources (
            analysis_result_id,
            ordinal,
            message_id,
            message_version_id
        )
        VALUES (
            'a2000000-0000-4000-8000-000000000001',
            1,
            'a0000000-0000-4000-8000-000000000001',
            'a1000000-0000-4000-8000-000000000014'
        )
    $$,
    '22023',
    'Analysis result contains an invalid source reference.',
    'A result cannot cite a valid revision outside its frozen snapshot'
);

SELECT throws_ok(
    format(
        'UPDATE public.analysis_run_source_snapshots SET source_count = 0 WHERE analysis_run_id = %L',
        :'run_analysis_run_id'::UUID
    ),
    '55000',
    'Analysis source snapshots are immutable.',
    'Snapshot metadata cannot be rewritten'
);
SELECT throws_ok(
    format(
        'DELETE FROM public.analysis_run_source_snapshot_items WHERE analysis_run_id = %L',
        :'run_analysis_run_id'::UUID
    ),
    '55000',
    'Analysis source snapshots are immutable.',
    'Snapshot source identities cannot be deleted'
);

SET LOCAL ROLE authenticated;

SELECT throws_ok(
    $$SELECT * FROM public.analysis_run_source_snapshots$$,
    '42501',
    'permission denied for table analysis_run_source_snapshots',
    'Browser callers cannot read snapshot metadata directly'
);
SELECT throws_ok(
    $$SELECT * FROM public.analysis_run_source_snapshot_items$$,
    '42501',
    'permission denied for table analysis_run_source_snapshot_items',
    'Browser callers cannot read snapshot identities directly'
);

RESET ROLE;

CREATE TEMPORARY TABLE bulk_snapshot_sources AS
SELECT
    sequence_number,
    gen_random_uuid() AS message_id,
    gen_random_uuid() AS message_version_id,
    '2026-02-01T00:00:00Z'::TIMESTAMPTZ
        + sequence_number * INTERVAL '1 minute' AS created_at
FROM generate_series(1, 101) AS sequence_number;

INSERT INTO public.messages (
    message_id,
    workspace_id,
    channel_id,
    author_user_id,
    created_at
)
SELECT
    message_id,
    :'workspace_workspace_id',
    :'channel_channel_id',
    '10000000-0000-4000-8000-000000000001',
    created_at
FROM bulk_snapshot_sources;

INSERT INTO public.message_versions (
    message_version_id,
    message_id,
    version_number,
    content,
    created_by,
    created_at
)
SELECT
    message_version_id,
    message_id,
    1,
    format('bulk source %s', sequence_number),
    '10000000-0000-4000-8000-000000000001',
    created_at
FROM bulk_snapshot_sources;

INSERT INTO public.message_heads (
    message_id,
    workspace_id,
    channel_id,
    latest_message_version_id,
    latest_version_number
)
SELECT
    message_id,
    :'workspace_workspace_id',
    :'channel_channel_id',
    message_version_id,
    1
FROM bulk_snapshot_sources;

SET LOCAL ROLE service_role;

SELECT analysis_run_id
FROM public.start_analysis_run(
    :'workspace_workspace_id'::UUID,
    :'channel_channel_id'::UUID,
    '2026-02-01T00:00:00Z',
    '2026-02-02T00:00:00Z',
    '10000000-0000-4000-8000-000000000001'::UUID,
    '00-33333333333333333333333333333333-4444444444444444-01',
    NULL
)
\gset bulk_run_

SELECT analysis_run_outbox_event_id, claim_token
FROM public.claim_analysis_run_outbox_event('bulk-snapshot-dispatcher')
\gset bulk_outbox_

SELECT analysis_job_id
FROM public.dispatch_analysis_run_outbox_event(
    :'bulk_outbox_analysis_run_outbox_event_id'::UUID,
    :'bulk_outbox_claim_token'::UUID
)
\gset bulk_job_

SELECT *
FROM public.acquire_analysis_job(
    'bulk-snapshot-worker',
    'analysis.workspace-message-inventory.v1',
    60
)
\gset bulk_attempt_

CREATE TEMPORARY TABLE loaded_bulk_snapshot AS
SELECT *
FROM public.load_analysis_job_sources(
    :'bulk_attempt_analysis_job_id'::UUID,
    :'bulk_attempt_analysis_job_attempt_id'::UUID,
    :'bulk_attempt_lease_token'::UUID
);

RESET ROLE;

SELECT is(
    (SELECT count(*) FROM loaded_bulk_snapshot),
    100::BIGINT,
    'A snapshot contains at most 100 source identities'
);
SELECT ok(
    (SELECT bool_and(source_truncated) FROM loaded_bulk_snapshot),
    'Every returned row carries the persisted truncation state'
);
SELECT results_eq(
    format(
        'SELECT source_count, source_truncated FROM public.analysis_run_source_snapshots WHERE analysis_run_id = %L',
        :'bulk_run_analysis_run_id'::UUID
    ),
    $$VALUES (100, TRUE)$$,
    'A snapshot records that additional eligible sources were truncated'
);
SELECT ok(
    NOT EXISTS (
        SELECT 1
        FROM public.analysis_run_source_snapshot_items AS item
        INNER JOIN bulk_snapshot_sources AS source
            ON source.message_id = item.message_id
        WHERE item.analysis_run_id = :'bulk_run_analysis_run_id'::UUID
          AND source.sequence_number = 1
    ),
    'The oldest eligible source is excluded when the interval contains 101 messages'
);
SELECT results_eq(
    format(
        'SELECT source.sequence_number FROM public.analysis_run_source_snapshot_items AS item INNER JOIN bulk_snapshot_sources AS source ON source.message_id = item.message_id WHERE item.analysis_run_id = %L ORDER BY item.ordinal',
        :'bulk_run_analysis_run_id'::UUID
    ),
    $$SELECT generate_series(2, 101)$$,
    'The selected newest sources are persisted in chronological order'
);

SELECT * FROM finish();
ROLLBACK;
