-- Phase 5 time boundary: every new Analysis Run selects a bounded historical
-- UTC interval. Historical pre-range runs remain readable with null bounds.

ALTER TABLE public.analysis_runs
ADD COLUMN time_range_start TIMESTAMPTZ,
ADD COLUMN time_range_end TIMESTAMPTZ;

-- NOT VALID preserves truthful historical rows while enforcing the invariant
-- for every row created after this migration.
ALTER TABLE public.analysis_runs
ADD CONSTRAINT analysis_runs_time_range_required
CHECK (time_range_start IS NOT NULL AND time_range_end IS NOT NULL)
NOT VALID;

ALTER TABLE public.analysis_runs
ADD CONSTRAINT analysis_runs_time_range_valid
CHECK (
    time_range_start < time_range_end
    AND time_range_end - time_range_start <= INTERVAL '31 days'
)
NOT VALID;

DROP FUNCTION public.start_analysis_run(UUID, UUID, UUID, TEXT, TEXT);

CREATE FUNCTION public.start_analysis_run(
    p_workspace_id UUID,
    p_channel_id UUID,
    p_time_range_start TIMESTAMPTZ,
    p_time_range_end TIMESTAMPTZ,
    p_requested_by UUID,
    p_traceparent TEXT,
    p_tracestate TEXT DEFAULT NULL
)
RETURNS SETOF public.analysis_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    operation_time TIMESTAMPTZ := clock_timestamp();
    created_run public.analysis_runs%ROWTYPE;
BEGIN
    IF NOT private.can_request_channel_analysis(
        p_workspace_id,
        p_channel_id,
        p_requested_by
    ) THEN
        RAISE EXCEPTION 'Analysis Run resource is not accessible.'
            USING ERRCODE = 'P0002';
    END IF;

    IF p_time_range_start IS NULL
       OR p_time_range_end IS NULL
       OR p_time_range_start >= p_time_range_end
       OR p_time_range_end - p_time_range_start > INTERVAL '31 days'
       OR p_time_range_end > operation_time
    THEN
        RAISE EXCEPTION 'Analysis Run time range is invalid.'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.analysis_runs (
        workspace_id,
        channel_id,
        time_range_start,
        time_range_end,
        requested_by
    )
    VALUES (
        p_workspace_id,
        p_channel_id,
        p_time_range_start,
        p_time_range_end,
        p_requested_by
    )
    RETURNING * INTO STRICT created_run;

    INSERT INTO public.analysis_run_lifecycle_events (
        analysis_run_id,
        sequence_number,
        state
    )
    VALUES (created_run.analysis_run_id, 1, 'created');

    INSERT INTO public.analysis_run_outbox_events (
        analysis_run_id,
        workspace_id,
        traceparent,
        tracestate
    )
    VALUES (
        created_run.analysis_run_id,
        created_run.workspace_id,
        p_traceparent,
        p_tracestate
    );

    RETURN NEXT created_run;
END;
$$;

CREATE OR REPLACE FUNCTION public.load_analysis_job_sources(
    p_job_id UUID,
    p_attempt_id UUID,
    p_lease_token UUID
)
RETURNS TABLE (
    message_id UUID,
    message_version_id UUID,
    author_user_id UUID
)
LANGUAGE plpgsql
STABLE
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

    RETURN QUERY
    SELECT
        message.message_id,
        head.latest_message_version_id,
        message.author_user_id
    FROM public.message_heads AS head
    INNER JOIN public.messages AS message
        ON message.message_id = head.message_id
       AND message.workspace_id = head.workspace_id
       AND message.channel_id = head.channel_id
    INNER JOIN public.channel_heads AS channel_head
        ON channel_head.channel_id = message.channel_id
       AND channel_head.workspace_id = message.workspace_id
    WHERE head.workspace_id = accepted_run.workspace_id
      AND head.channel_id = accepted_run.channel_id
      AND head.message_status = 'active'
      AND channel_head.channel_status = 'active'
      AND message.created_at >= accepted_run.time_range_start
      AND message.created_at < accepted_run.time_range_end
    ORDER BY message.created_at DESC, message.message_id DESC
    LIMIT 101;
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
        INNER JOIN public.analysis_runs AS run
            ON run.analysis_run_id = result.analysis_run_id
        INNER JOIN public.messages AS message
            ON message.message_id = NEW.message_id
           AND message.workspace_id = run.workspace_id
           AND message.channel_id = run.channel_id
           AND message.created_at >= run.time_range_start
           AND message.created_at < run.time_range_end
        WHERE result.analysis_result_id = NEW.analysis_result_id
    ) THEN
        RAISE EXCEPTION 'Analysis result contains an invalid source reference.'
            USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
END;
$$;

DROP FUNCTION public.get_analysis_run(UUID, UUID, UUID);

CREATE FUNCTION public.get_analysis_run(
    p_workspace_id UUID,
    p_analysis_run_id UUID,
    p_requested_by UUID
)
RETURNS TABLE (
    analysis_run_id UUID,
    workspace_id UUID,
    channel_id UUID,
    time_range_start TIMESTAMPTZ,
    time_range_end TIMESTAMPTZ,
    requested_by UUID,
    status TEXT,
    failure_category TEXT,
    result JSONB,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT private.can_request_analysis_run(p_workspace_id, p_requested_by) THEN
        RAISE EXCEPTION 'Analysis Run resource is not accessible.'
            USING ERRCODE = 'P0002';
    END IF;

    RETURN QUERY
    SELECT
        run.analysis_run_id,
        run.workspace_id,
        run.channel_id,
        run.time_range_start,
        run.time_range_end,
        run.requested_by,
        lifecycle.state,
        lifecycle.failure_category,
        CASE WHEN analysis_result.analysis_result_id IS NULL THEN NULL ELSE
            jsonb_build_object(
                'id', analysis_result.analysis_result_id,
                'analysisRunId', run.analysis_run_id,
                'kind', analysis_result.result_kind,
                'processorVersion', analysis_result.processor_version,
                'providerKind', analysis_result.provider_kind,
                'model', analysis_result.model,
                'evaluationVersion', analysis_result.evaluation_version,
                'sourceCount', analysis_result.source_count,
                'sourceTruncated', analysis_result.source_truncated,
                'sources', coalesce(sources.items, '[]'::JSONB),
                'finding', jsonb_build_object(
                    'kind', finding.finding_kind,
                    'status', finding.finding_status,
                    'title', finding.title,
                    'summary', finding.summary,
                    'confidence', finding.confidence
                ),
                'createdAt', analysis_result.created_at
            )
        END,
        run.created_at
    FROM public.analysis_runs AS run
    INNER JOIN LATERAL (
        SELECT event.state, event.failure_category
        FROM public.analysis_run_lifecycle_events AS event
        WHERE event.analysis_run_id = run.analysis_run_id
        ORDER BY event.sequence_number DESC
        LIMIT 1
    ) AS lifecycle ON TRUE
    LEFT JOIN public.analysis_results AS analysis_result
        ON analysis_result.analysis_run_id = run.analysis_run_id
    LEFT JOIN public.analysis_findings AS finding
        ON finding.analysis_result_id = analysis_result.analysis_result_id
    LEFT JOIN LATERAL (
        SELECT jsonb_agg(
            jsonb_build_object(
                'messageId', source.message_id,
                'messageRevisionId', source.message_version_id
            ) ORDER BY source.ordinal
        ) AS items
        FROM public.analysis_result_sources AS source
        WHERE source.analysis_result_id = analysis_result.analysis_result_id
    ) AS sources ON TRUE
    WHERE run.analysis_run_id = p_analysis_run_id
      AND run.workspace_id = p_workspace_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Analysis Run resource is not accessible.'
            USING ERRCODE = 'P0002';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.start_analysis_run(
    UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_analysis_run(
    UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.get_analysis_run(UUID, UUID, UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_analysis_run(UUID, UUID, UUID)
TO service_role;

COMMENT ON COLUMN public.analysis_runs.time_range_start IS
    'Inclusive UTC source-message boundary; null only on historical pre-range runs.';
COMMENT ON COLUMN public.analysis_runs.time_range_end IS
    'Exclusive UTC source-message boundary; null only on historical pre-range runs.';
COMMENT ON FUNCTION public.start_analysis_run(
    UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT
) IS 'Atomically authorizes and persists a channel-scoped Analysis Run for a bounded historical UTC interval.';
COMMENT ON FUNCTION public.load_analysis_job_sources(UUID, UUID, UUID) IS
    'Returns at most 101 newest active revisions created inside the run channel and inclusive-start/exclusive-end time range.';
