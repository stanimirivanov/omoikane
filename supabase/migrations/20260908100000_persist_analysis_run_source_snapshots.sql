-- Phase 5 source acquisition: freeze the exact historical message revisions
-- selected for an Analysis Run before later provider execution is introduced.

CREATE TABLE public.analysis_run_source_snapshots (
    analysis_run_id UUID PRIMARY KEY
        REFERENCES public.analysis_runs(analysis_run_id) ON DELETE RESTRICT,
    source_count INTEGER NOT NULL CHECK (source_count BETWEEN 0 AND 100),
    source_truncated BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT analysis_run_source_snapshot_truncation_valid CHECK (
        NOT source_truncated OR source_count = 100
    )
);

CREATE TABLE public.analysis_run_source_snapshot_items (
    analysis_run_id UUID NOT NULL
        REFERENCES public.analysis_run_source_snapshots(analysis_run_id)
        ON DELETE RESTRICT,
    ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 100),
    message_id UUID NOT NULL,
    message_version_id UUID NOT NULL,
    PRIMARY KEY (analysis_run_id, ordinal),
    UNIQUE (analysis_run_id, message_id),
    UNIQUE (analysis_run_id, message_version_id),
    FOREIGN KEY (message_id, message_version_id)
        REFERENCES public.message_versions(message_id, message_version_id)
        ON DELETE RESTRICT
);

CREATE FUNCTION private.reject_analysis_source_snapshot_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Analysis source snapshots are immutable.'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER analysis_run_source_snapshots_are_immutable
BEFORE UPDATE OR DELETE ON public.analysis_run_source_snapshots
FOR EACH ROW EXECUTE FUNCTION private.reject_analysis_source_snapshot_mutation();

CREATE TRIGGER analysis_run_source_snapshot_items_are_immutable
BEFORE UPDATE OR DELETE ON public.analysis_run_source_snapshot_items
FOR EACH ROW EXECUTE FUNCTION private.reject_analysis_source_snapshot_mutation();

ALTER TABLE public.analysis_run_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_run_source_snapshot_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.analysis_run_source_snapshots
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.analysis_run_source_snapshot_items
FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION public.load_analysis_job_sources(UUID, UUID, UUID);

CREATE FUNCTION public.load_analysis_job_sources(
    p_job_id UUID,
    p_attempt_id UUID,
    p_lease_token UUID
)
RETURNS TABLE (
    message_id UUID,
    message_version_id UUID,
    author_user_id UUID,
    source_truncated BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    operation_time TIMESTAMPTZ := clock_timestamp();
    leased_job public.analysis_jobs%ROWTYPE;
    accepted_run public.analysis_runs%ROWTYPE;
BEGIN
    SELECT job.*
    INTO leased_job
    FROM public.analysis_jobs AS job
    INNER JOIN public.analysis_job_attempts AS attempt
        ON attempt.analysis_job_id = job.analysis_job_id
       AND attempt.analysis_job_attempt_id = p_attempt_id
       AND attempt.lease_token = p_lease_token
       AND attempt.outcome IS NULL
    WHERE job.analysis_job_id = p_job_id
      AND job.terminal_outcome IS NULL
      AND job.lease_token = p_lease_token
      AND job.lease_expires_at > operation_time;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Analysis job lease is stale.'
            USING ERRCODE = 'P0003';
    END IF;

    SELECT run.*
    INTO STRICT accepted_run
    FROM public.analysis_runs AS run
    WHERE run.analysis_run_id = leased_job.analysis_run_id
      AND run.workspace_id = leased_job.workspace_id;

    IF accepted_run.channel_id IS NULL
       OR accepted_run.time_range_start IS NULL
       OR accepted_run.time_range_end IS NULL
       OR NOT private.can_request_channel_analysis(
            accepted_run.workspace_id,
            accepted_run.channel_id,
            accepted_run.requested_by
       )
    THEN
        RAISE EXCEPTION 'Analysis source access was revoked.'
            USING ERRCODE = 'P0004';
    END IF;

    WITH candidate_sources AS MATERIALIZED (
        SELECT
            message.message_id,
            version.message_version_id,
            message.created_at AS message_created_at
        FROM public.messages AS message
        INNER JOIN public.message_heads AS head
            ON head.message_id = message.message_id
           AND head.workspace_id = message.workspace_id
           AND head.channel_id = message.channel_id
        CROSS JOIN LATERAL (
            SELECT historical_version.message_version_id
            FROM public.message_versions AS historical_version
            WHERE historical_version.message_id = message.message_id
              AND historical_version.created_at < accepted_run.time_range_end
            ORDER BY
                historical_version.created_at DESC,
                historical_version.version_number DESC
            LIMIT 1
        ) AS version
        WHERE message.workspace_id = accepted_run.workspace_id
          AND message.channel_id = accepted_run.channel_id
          AND message.created_at >= accepted_run.time_range_start
          AND message.created_at < accepted_run.time_range_end
          AND (
              head.deleted_at IS NULL
              OR head.deleted_at >= accepted_run.time_range_end
          )
        ORDER BY message.created_at DESC, message.message_id DESC
        LIMIT 101
    ), selected_sources AS MATERIALIZED (
        SELECT
            selected.message_id,
            selected.message_version_id,
            row_number() OVER (
                ORDER BY selected.message_created_at, selected.message_id
            )::INTEGER AS ordinal
        FROM (
            SELECT candidate.*
            FROM candidate_sources AS candidate
            ORDER BY candidate.message_created_at DESC, candidate.message_id DESC
            LIMIT 100
        ) AS selected
    ), inserted_snapshot AS (
        INSERT INTO public.analysis_run_source_snapshots (
            analysis_run_id,
            source_count,
            source_truncated
        )
        SELECT
            accepted_run.analysis_run_id,
            (SELECT count(*) FROM selected_sources),
            (SELECT count(*) > 100 FROM candidate_sources)
        ON CONFLICT (analysis_run_id) DO NOTHING
        RETURNING analysis_run_id
    )
    INSERT INTO public.analysis_run_source_snapshot_items (
        analysis_run_id,
        ordinal,
        message_id,
        message_version_id
    )
    SELECT
        inserted_snapshot.analysis_run_id,
        selected.ordinal,
        selected.message_id,
        selected.message_version_id
    FROM inserted_snapshot
    CROSS JOIN selected_sources AS selected;

    RETURN QUERY
    SELECT
        item.message_id,
        item.message_version_id,
        message.author_user_id,
        snapshot.source_truncated
    FROM public.analysis_run_source_snapshots AS snapshot
    INNER JOIN public.analysis_run_source_snapshot_items AS item
        ON item.analysis_run_id = snapshot.analysis_run_id
    INNER JOIN public.messages AS message
        ON message.message_id = item.message_id
    WHERE snapshot.analysis_run_id = accepted_run.analysis_run_id
    ORDER BY item.ordinal;
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_analysis_result_source_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.analysis_results AS result
        INNER JOIN public.analysis_run_source_snapshot_items AS source
            ON source.analysis_run_id = result.analysis_run_id
           AND source.message_id = NEW.message_id
           AND source.message_version_id = NEW.message_version_id
        WHERE result.analysis_result_id = NEW.analysis_result_id
    ) THEN
        RAISE EXCEPTION 'Analysis result contains an invalid source reference.'
            USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
END;
$$;

CREATE FUNCTION private.enforce_analysis_result_snapshot_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.result_kind = 'workspace-message-inventory'
       AND NOT EXISTS (
            SELECT 1
            FROM public.analysis_run_source_snapshots AS snapshot
            WHERE snapshot.analysis_run_id = NEW.analysis_run_id
              AND snapshot.source_count = NEW.source_count
              AND snapshot.source_truncated = NEW.source_truncated
       )
    THEN
        RAISE EXCEPTION 'Analysis result source metadata does not match its snapshot.'
            USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER analysis_results_match_source_snapshot
BEFORE INSERT ON public.analysis_results
FOR EACH ROW EXECUTE FUNCTION private.enforce_analysis_result_snapshot_metadata();

REVOKE ALL ON FUNCTION public.load_analysis_job_sources(UUID, UUID, UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_analysis_job_sources(UUID, UUID, UUID)
TO service_role;

COMMENT ON TABLE public.analysis_run_source_snapshots IS
    'Immutable metadata for the historical message-revision set selected once per Analysis Run.';
COMMENT ON TABLE public.analysis_run_source_snapshot_items IS
    'Ordered immutable message and revision identities frozen for one Analysis Run.';
COMMENT ON FUNCTION public.load_analysis_job_sources(UUID, UUID, UUID) IS
    'Atomically creates or observes the lease-owned run source snapshot and returns its chronological identities.';
