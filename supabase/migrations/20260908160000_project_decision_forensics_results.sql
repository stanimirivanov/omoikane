-- Extend the existing authorized Analysis Run read model with normalized
-- Decision Forensics output. Internal tables remain inaccessible directly.

CREATE FUNCTION private.build_analysis_result_projection(
    p_analysis_result_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT CASE result.result_kind
        WHEN 'workspace-message-inventory' THEN
            jsonb_build_object(
                'id', result.analysis_result_id,
                'analysisRunId', result.analysis_run_id,
                'kind', result.result_kind,
                'processorVersion', result.processor_version,
                'providerKind', result.provider_kind,
                'model', result.model,
                'evaluationVersion', result.evaluation_version,
                'sourceCount', result.source_count,
                'sourceTruncated', result.source_truncated,
                'sources', coalesce(sources.items, '[]'::JSONB),
                'finding', jsonb_build_object(
                    'kind', finding.finding_kind,
                    'status', finding.finding_status,
                    'title', finding.title,
                    'summary', finding.summary,
                    'confidence', finding.confidence
                ),
                'createdAt', result.created_at
            )
        WHEN 'decision-forensics' THEN
            jsonb_build_object(
                'id', result.analysis_result_id,
                'analysisRunId', result.analysis_run_id,
                'kind', result.result_kind,
                'processorVersion', result.processor_version,
                'providerKind', result.provider_kind,
                'model', result.model,
                'resultSchemaVersion', manifest.result_schema_version,
                'promptVersion', manifest.prompt_version,
                'promptDigest', manifest.prompt_digest,
                'evaluationVersion', result.evaluation_version,
                'generationPolicy', manifest.generation_policy,
                'usage', jsonb_build_object(
                    'inputUnits', result.input_units,
                    'outputUnits', result.output_units
                ),
                'sourceCount', result.source_count,
                'sourceTruncated', result.source_truncated,
                'sources', coalesce(sources.items, '[]'::JSONB),
                'summary', result.summary,
                'candidates', coalesce(candidates.items, '[]'::JSONB),
                'createdAt', result.created_at
            )
    END
    FROM public.analysis_results AS result
    LEFT JOIN public.analysis_findings AS finding
        ON finding.analysis_result_id = result.analysis_result_id
    LEFT JOIN public.analysis_execution_manifests AS manifest
        ON manifest.analysis_run_id = result.analysis_run_id
    LEFT JOIN LATERAL (
        SELECT jsonb_agg(
            jsonb_build_object(
                'messageId', source.message_id,
                'messageRevisionId', source.message_version_id
            ) ORDER BY source.ordinal
        ) AS items
        FROM public.analysis_result_sources AS source
        WHERE source.analysis_result_id = result.analysis_result_id
    ) AS sources ON TRUE
    LEFT JOIN LATERAL (
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', candidate.analysis_decision_candidate_id,
                'status', 'proposed',
                'title', candidate.title,
                'summary', candidate.summary,
                'disposition', candidate.disposition,
                'confidence', candidate.confidence,
                'claims', coalesce(claims.items, '[]'::JSONB),
                'assumptions', coalesce(assumptions.items, '[]'::JSONB),
                'participants', coalesce(participants.items, '[]'::JSONB)
            ) ORDER BY candidate.ordinal
        ) AS items
        FROM public.analysis_decision_candidates AS candidate
        LEFT JOIN LATERAL (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'text', assertion.assertion_text,
                    'evidence', coalesce(evidence.items, '[]'::JSONB)
                ) ORDER BY assertion.ordinal
            ) AS items
            FROM public.analysis_decision_assertions AS assertion
            LEFT JOIN LATERAL (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'messageId', evidence_source.message_id,
                        'messageRevisionId', evidence_source.message_version_id
                    ) ORDER BY evidence_source.evidence_ordinal
                ) AS items
                FROM public.analysis_decision_assertion_sources AS evidence_source
                WHERE evidence_source.analysis_decision_candidate_id =
                        assertion.analysis_decision_candidate_id
                  AND evidence_source.assertion_kind = assertion.assertion_kind
                  AND evidence_source.assertion_ordinal = assertion.ordinal
            ) AS evidence ON TRUE
            WHERE assertion.analysis_decision_candidate_id =
                    candidate.analysis_decision_candidate_id
              AND assertion.assertion_kind = 'claim'
        ) AS claims ON TRUE
        LEFT JOIN LATERAL (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'text', assertion.assertion_text,
                    'evidence', coalesce(evidence.items, '[]'::JSONB)
                ) ORDER BY assertion.ordinal
            ) AS items
            FROM public.analysis_decision_assertions AS assertion
            LEFT JOIN LATERAL (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'messageId', evidence_source.message_id,
                        'messageRevisionId', evidence_source.message_version_id
                    ) ORDER BY evidence_source.evidence_ordinal
                ) AS items
                FROM public.analysis_decision_assertion_sources AS evidence_source
                WHERE evidence_source.analysis_decision_candidate_id =
                        assertion.analysis_decision_candidate_id
                  AND evidence_source.assertion_kind = assertion.assertion_kind
                  AND evidence_source.assertion_ordinal = assertion.ordinal
            ) AS evidence ON TRUE
            WHERE assertion.analysis_decision_candidate_id =
                    candidate.analysis_decision_candidate_id
              AND assertion.assertion_kind = 'assumption'
        ) AS assumptions ON TRUE
        LEFT JOIN LATERAL (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'profileId', participant.profile_id,
                    'role', participant.participant_role,
                    'evidence', coalesce(evidence.items, '[]'::JSONB)
                ) ORDER BY participant.ordinal
            ) AS items
            FROM public.analysis_decision_participants AS participant
            LEFT JOIN LATERAL (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'messageId', evidence_source.message_id,
                        'messageRevisionId', evidence_source.message_version_id
                    ) ORDER BY evidence_source.evidence_ordinal
                ) AS items
                FROM public.analysis_decision_participant_sources AS evidence_source
                WHERE evidence_source.analysis_decision_candidate_id =
                        participant.analysis_decision_candidate_id
                  AND evidence_source.participant_ordinal = participant.ordinal
            ) AS evidence ON TRUE
            WHERE participant.analysis_decision_candidate_id =
                    candidate.analysis_decision_candidate_id
        ) AS participants ON TRUE
        WHERE candidate.analysis_result_id = result.analysis_result_id
    ) AS candidates ON TRUE
    WHERE result.analysis_result_id = p_analysis_result_id;
$$;

REVOKE ALL ON FUNCTION private.build_analysis_result_projection(UUID)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_analysis_run(
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
        private.build_analysis_result_projection(result.analysis_result_id),
        run.created_at
    FROM public.analysis_runs AS run
    INNER JOIN LATERAL (
        SELECT event.state, event.failure_category
        FROM public.analysis_run_lifecycle_events AS event
        WHERE event.analysis_run_id = run.analysis_run_id
        ORDER BY event.sequence_number DESC
        LIMIT 1
    ) AS lifecycle ON TRUE
    LEFT JOIN public.analysis_results AS result
        ON result.analysis_run_id = run.analysis_run_id
    WHERE run.analysis_run_id = p_analysis_run_id
      AND run.workspace_id = p_workspace_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Analysis Run resource is not accessible.'
            USING ERRCODE = 'P0002';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_analysis_run(UUID, UUID, UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_analysis_run(UUID, UUID, UUID)
TO service_role;

COMMENT ON FUNCTION private.build_analysis_result_projection(UUID) IS
    'Builds the normalized immutable result value consumed only by the authorized Analysis Run projection.';
COMMENT ON FUNCTION public.get_analysis_run(UUID, UUID, UUID) IS
    'Returns one currently authorized Analysis Run with its immutable inventory or Decision Forensics result projection.';
