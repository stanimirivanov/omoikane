-- Append immutable human review facts without mutating model-produced output.

CREATE TABLE public.analysis_decision_review_events (
    analysis_decision_review_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_decision_candidate_id UUID NOT NULL UNIQUE
        REFERENCES public.analysis_decision_candidates(analysis_decision_candidate_id)
        ON DELETE RESTRICT,
    reviewer_user_id UUID NOT NULL
        REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
    review_action TEXT NOT NULL CHECK (review_action IN ('confirm', 'reject')),
    reason TEXT CHECK (
        reason IS NULL OR (
            length(reason) BETWEEN 1 AND 500
            AND reason = btrim(reason)
            AND reason !~ E'[\\r\\n]'
        )
    ),
    occurred_at TIMESTAMPTZ NOT NULL
);

CREATE TRIGGER analysis_decision_review_events_are_immutable
BEFORE UPDATE OR DELETE ON public.analysis_decision_review_events
FOR EACH ROW EXECUTE FUNCTION private.reject_analysis_output_mutation();

ALTER TABLE public.analysis_decision_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analysis_decision_review_events
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.build_analysis_review_projection(
    p_review public.analysis_decision_review_events
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'id', p_review.analysis_decision_review_event_id,
        'candidateId', p_review.analysis_decision_candidate_id,
        'reviewerId', p_review.reviewer_user_id,
        'action', p_review.review_action,
        'reason', p_review.reason,
        'occurredAt', p_review.occurred_at
    );
$$;

CREATE FUNCTION private.apply_analysis_review_projection(p_result JSONB)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT CASE
        WHEN p_result->>'kind' IS DISTINCT FROM 'decision-forensics' THEN p_result
        ELSE jsonb_set(
            p_result,
            '{candidates}',
            coalesce((
                SELECT jsonb_agg(
                    candidate.value || jsonb_build_object(
                        'status', CASE review.review_action
                            WHEN 'confirm' THEN 'confirmed'
                            WHEN 'reject' THEN 'rejected'
                            ELSE 'proposed'
                        END,
                        'review', CASE
                            WHEN review.analysis_decision_review_event_id IS NULL
                                THEN 'null'::JSONB
                            ELSE private.build_analysis_review_projection(review)
                        END
                    ) ORDER BY candidate.ordinality
                )
                FROM jsonb_array_elements(p_result->'candidates')
                    WITH ORDINALITY AS candidate(value, ordinality)
                LEFT JOIN public.analysis_decision_review_events AS review
                    ON review.analysis_decision_candidate_id =
                        (candidate.value->>'id')::UUID
            ), '[]'::JSONB)
        )
    END;
$$;

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
        private.apply_analysis_review_projection(
            private.build_analysis_result_projection(result.analysis_result_id)
        ),
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

CREATE FUNCTION public.review_analysis_decision_candidate(
    p_workspace_id UUID,
    p_analysis_run_id UUID,
    p_candidate_id UUID,
    p_reviewer_user_id UUID,
    p_action TEXT,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    operation_time TIMESTAMPTZ := clock_timestamp();
    normalized_reason TEXT := nullif(btrim(p_reason), '');
    target_candidate public.analysis_decision_candidates%ROWTYPE;
    existing_review public.analysis_decision_review_events%ROWTYPE;
    created_review public.analysis_decision_review_events%ROWTYPE;
BEGIN
    IF p_workspace_id IS NULL
       OR p_analysis_run_id IS NULL
       OR p_candidate_id IS NULL
       OR p_reviewer_user_id IS NULL
       OR p_action NOT IN ('confirm', 'reject')
       OR (p_reason IS NOT NULL AND (
            p_reason IS DISTINCT FROM normalized_reason
            OR length(normalized_reason) > 500
            OR normalized_reason ~ E'[\\r\\n]'
       ))
    THEN
        RAISE EXCEPTION 'Decision review command is invalid.' USING ERRCODE = '22023';
    END IF;

    IF NOT private.can_request_analysis_run(p_workspace_id, p_reviewer_user_id) THEN
        RAISE EXCEPTION 'Decision candidate is not accessible.' USING ERRCODE = 'P0002';
    END IF;

    SELECT candidate.* INTO target_candidate
    FROM public.analysis_decision_candidates AS candidate
    INNER JOIN public.analysis_results AS result
        ON result.analysis_result_id = candidate.analysis_result_id
    INNER JOIN public.analysis_runs AS run
        ON run.analysis_run_id = result.analysis_run_id
    WHERE candidate.analysis_decision_candidate_id = p_candidate_id
      AND run.analysis_run_id = p_analysis_run_id
      AND run.workspace_id = p_workspace_id
    FOR UPDATE OF candidate;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Decision candidate is not accessible.' USING ERRCODE = 'P0002';
    END IF;

    SELECT review.* INTO existing_review
    FROM public.analysis_decision_review_events AS review
    WHERE review.analysis_decision_candidate_id = p_candidate_id;

    IF FOUND THEN
        IF existing_review.reviewer_user_id = p_reviewer_user_id
           AND existing_review.review_action = p_action
           AND existing_review.reason IS NOT DISTINCT FROM normalized_reason
        THEN
            RETURN private.build_analysis_review_projection(existing_review);
        END IF;
        RAISE EXCEPTION 'Decision candidate already has a human review.'
            USING ERRCODE = 'P0006';
    END IF;

    INSERT INTO public.analysis_decision_review_events (
        analysis_decision_candidate_id,
        reviewer_user_id,
        review_action,
        reason,
        occurred_at
    ) VALUES (
        p_candidate_id,
        p_reviewer_user_id,
        p_action,
        normalized_reason,
        operation_time
    ) RETURNING * INTO STRICT created_review;

    RETURN private.build_analysis_review_projection(created_review);
END;
$$;

REVOKE ALL ON FUNCTION private.build_analysis_review_projection(
    public.analysis_decision_review_events
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.apply_analysis_review_projection(JSONB)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.review_analysis_decision_candidate(
    UUID, UUID, UUID, UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_analysis_decision_candidate(
    UUID, UUID, UUID, UUID, TEXT, TEXT
) TO service_role;

COMMENT ON TABLE public.analysis_decision_review_events IS
    'Immutable human confirmation or rejection facts; model output remains unchanged.';
COMMENT ON FUNCTION public.review_analysis_decision_candidate(
    UUID, UUID, UUID, UUID, TEXT, TEXT
) IS 'Appends the first authorized human review for a Decision Forensics candidate and idempotently observes an exact replay.';
