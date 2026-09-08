-- Content stays in immutable message_versions. This worker-only capability
-- reuses snapshot acquisition's lease and current-access checks on every call.
CREATE FUNCTION public.load_analysis_job_extraction_input(
    p_job_id UUID,
    p_attempt_id UUID,
    p_lease_token UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    snapshot public.analysis_run_source_snapshots%ROWTYPE;
    source_content JSONB;
BEGIN
    -- Execute before reading content, including when the snapshot already exists.
    PERFORM public.load_analysis_job_sources(p_job_id, p_attempt_id, p_lease_token);

    SELECT stored.*
    INTO STRICT snapshot
    FROM public.analysis_run_source_snapshots AS stored
    INNER JOIN public.analysis_jobs AS job
        ON job.analysis_run_id = stored.analysis_run_id
    WHERE job.analysis_job_id = p_job_id;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'messageId', item.message_id,
        'messageRevisionId', item.message_version_id,
        'authorUserId', message.author_user_id,
        'content', version.content
    ) ORDER BY item.ordinal), '[]'::JSONB)
    INTO source_content
    FROM public.analysis_run_source_snapshot_items AS item
    INNER JOIN public.message_versions AS version
        ON version.message_id = item.message_id
       AND version.message_version_id = item.message_version_id
    INNER JOIN public.messages AS message
        ON message.message_id = item.message_id
    WHERE item.analysis_run_id = snapshot.analysis_run_id;

    IF jsonb_array_length(source_content) <> snapshot.source_count THEN
        RAISE EXCEPTION 'Analysis snapshot content is incomplete.'
            USING ERRCODE = 'P0005';
    END IF;

    RETURN jsonb_build_object(
        'analysisRunId', snapshot.analysis_run_id,
        'sourceTruncated', snapshot.source_truncated,
        'sources', source_content
    );
END;
$$;

REVOKE ALL ON FUNCTION public.load_analysis_job_extraction_input(UUID, UUID, UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_analysis_job_extraction_input(UUID, UUID, UUID)
TO service_role;

COMMENT ON FUNCTION public.load_analysis_job_extraction_input(UUID, UUID, UUID) IS
    'Returns exact snapshotted revision content to the current authorized worker lease; never selects current message heads for content.';
