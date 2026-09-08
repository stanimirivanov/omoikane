-- Persist validated Decision Forensics output without weakening the existing
-- deterministic inventory completion contract.

ALTER TABLE public.analysis_results
    DROP CONSTRAINT analysis_result_kind_supported,
    DROP CONSTRAINT analysis_result_provider_supported,
    DROP CONSTRAINT analysis_result_evaluation_supported,
    DROP CONSTRAINT analysis_result_provider_shape;

ALTER TABLE public.analysis_results
    ADD COLUMN input_units INTEGER CHECK (input_units >= 0),
    ADD COLUMN output_units INTEGER CHECK (output_units >= 0),
    ADD CONSTRAINT analysis_result_kind_supported CHECK (
        result_kind IN ('workspace-message-inventory', 'decision-forensics')
    ),
    ADD CONSTRAINT analysis_result_provider_shape CHECK (
        (
            result_kind = 'workspace-message-inventory'
            AND provider_kind = 'deterministic'
            AND model IS NULL
            AND evaluation_version = 'workspace-message-inventory.v1'
            AND input_units IS NULL
            AND output_units IS NULL
        ) OR (
            result_kind = 'decision-forensics'
            AND provider_kind = 'ollama'
            AND model ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$'
            AND evaluation_version = 'decision-forensics.evaluation.v1'
        )
    );

ALTER TABLE public.analysis_result_sources
    ADD CONSTRAINT analysis_result_sources_result_message_revision_key
    UNIQUE (analysis_result_id, message_id, message_version_id);

CREATE TABLE public.analysis_decision_candidates (
    analysis_decision_candidate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_result_id UUID NOT NULL
        REFERENCES public.analysis_results(analysis_result_id) ON DELETE RESTRICT,
    ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 20),
    title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
    summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 1000),
    disposition TEXT NOT NULL
        CHECK (disposition IN ('made', 'deferred', 'changed', 'rejected')),
    confidence DOUBLE PRECISION NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE (analysis_result_id, ordinal),
    UNIQUE (analysis_decision_candidate_id, analysis_result_id)
);

CREATE TABLE public.analysis_decision_assertions (
    analysis_decision_candidate_id UUID NOT NULL,
    analysis_result_id UUID NOT NULL,
    assertion_kind TEXT NOT NULL CHECK (assertion_kind IN ('claim', 'assumption')),
    ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 20),
    assertion_text TEXT NOT NULL CHECK (length(assertion_text) BETWEEN 1 AND 500),
    PRIMARY KEY (analysis_decision_candidate_id, assertion_kind, ordinal),
    FOREIGN KEY (analysis_decision_candidate_id, analysis_result_id)
        REFERENCES public.analysis_decision_candidates(
            analysis_decision_candidate_id,
            analysis_result_id
        ) ON DELETE RESTRICT
);

CREATE TABLE public.analysis_decision_assertion_sources (
    analysis_decision_candidate_id UUID NOT NULL,
    analysis_result_id UUID NOT NULL,
    assertion_kind TEXT NOT NULL,
    assertion_ordinal INTEGER NOT NULL,
    evidence_ordinal INTEGER NOT NULL CHECK (evidence_ordinal BETWEEN 1 AND 100),
    message_id UUID NOT NULL,
    message_version_id UUID NOT NULL,
    PRIMARY KEY (
        analysis_decision_candidate_id,
        assertion_kind,
        assertion_ordinal,
        evidence_ordinal
    ),
    UNIQUE (
        analysis_decision_candidate_id,
        assertion_kind,
        assertion_ordinal,
        message_version_id
    ),
    FOREIGN KEY (
        analysis_decision_candidate_id,
        assertion_kind,
        assertion_ordinal
    ) REFERENCES public.analysis_decision_assertions(
        analysis_decision_candidate_id,
        assertion_kind,
        ordinal
    ) ON DELETE RESTRICT,
    FOREIGN KEY (analysis_result_id, message_id, message_version_id)
        REFERENCES public.analysis_result_sources(
            analysis_result_id,
            message_id,
            message_version_id
        ) ON DELETE RESTRICT
);

CREATE TABLE public.analysis_decision_participants (
    analysis_decision_candidate_id UUID NOT NULL,
    analysis_result_id UUID NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 100),
    profile_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
    participant_role TEXT NOT NULL
        CHECK (participant_role IN ('proposer', 'decision-maker', 'contributor')),
    PRIMARY KEY (analysis_decision_candidate_id, ordinal),
    UNIQUE (analysis_decision_candidate_id, profile_id, participant_role),
    FOREIGN KEY (analysis_decision_candidate_id, analysis_result_id)
        REFERENCES public.analysis_decision_candidates(
            analysis_decision_candidate_id,
            analysis_result_id
        ) ON DELETE RESTRICT
);

CREATE TABLE public.analysis_decision_participant_sources (
    analysis_decision_candidate_id UUID NOT NULL,
    analysis_result_id UUID NOT NULL,
    participant_ordinal INTEGER NOT NULL,
    evidence_ordinal INTEGER NOT NULL CHECK (evidence_ordinal BETWEEN 1 AND 100),
    message_id UUID NOT NULL,
    message_version_id UUID NOT NULL,
    PRIMARY KEY (
        analysis_decision_candidate_id,
        participant_ordinal,
        evidence_ordinal
    ),
    UNIQUE (
        analysis_decision_candidate_id,
        participant_ordinal,
        message_version_id
    ),
    FOREIGN KEY (analysis_decision_candidate_id, participant_ordinal)
        REFERENCES public.analysis_decision_participants(
            analysis_decision_candidate_id,
            ordinal
        ) ON DELETE RESTRICT,
    FOREIGN KEY (analysis_result_id, message_id, message_version_id)
        REFERENCES public.analysis_result_sources(
            analysis_result_id,
            message_id,
            message_version_id
        ) ON DELETE RESTRICT
);

CREATE TRIGGER analysis_decision_candidates_are_immutable
BEFORE UPDATE OR DELETE ON public.analysis_decision_candidates
FOR EACH ROW EXECUTE FUNCTION private.reject_analysis_output_mutation();
CREATE TRIGGER analysis_decision_assertions_are_immutable
BEFORE UPDATE OR DELETE ON public.analysis_decision_assertions
FOR EACH ROW EXECUTE FUNCTION private.reject_analysis_output_mutation();
CREATE TRIGGER analysis_decision_assertion_sources_are_immutable
BEFORE UPDATE OR DELETE ON public.analysis_decision_assertion_sources
FOR EACH ROW EXECUTE FUNCTION private.reject_analysis_output_mutation();
CREATE TRIGGER analysis_decision_participants_are_immutable
BEFORE UPDATE OR DELETE ON public.analysis_decision_participants
FOR EACH ROW EXECUTE FUNCTION private.reject_analysis_output_mutation();
CREATE TRIGGER analysis_decision_participant_sources_are_immutable
BEFORE UPDATE OR DELETE ON public.analysis_decision_participant_sources
FOR EACH ROW EXECUTE FUNCTION private.reject_analysis_output_mutation();

ALTER TABLE public.analysis_decision_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_decision_assertions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_decision_assertion_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_decision_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_decision_participant_sources ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.analysis_decision_candidates FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.analysis_decision_assertions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.analysis_decision_assertion_sources FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.analysis_decision_participants FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.analysis_decision_participant_sources FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.enforce_analysis_result_snapshot_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.analysis_run_source_snapshots AS snapshot
        WHERE snapshot.analysis_run_id = NEW.analysis_run_id
          AND snapshot.source_count = NEW.source_count
          AND snapshot.source_truncated = NEW.source_truncated
    ) THEN
        RAISE EXCEPTION 'Analysis result source metadata does not match its snapshot.'
            USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION public.complete_decision_forensics_job_success(
    p_job_id UUID,
    p_attempt_id UUID,
    p_lease_token UUID,
    p_result_fingerprint TEXT,
    p_duration_milliseconds INTEGER,
    p_result JSONB
)
RETURNS SETOF public.analysis_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    operation_time TIMESTAMPTZ := clock_timestamp();
    leased_job public.analysis_jobs%ROWTYPE;
    active_attempt public.analysis_job_attempts%ROWTYPE;
    manifest public.analysis_execution_manifests%ROWTYPE;
    created_result public.analysis_results%ROWTYPE;
    created_candidate public.analysis_decision_candidates%ROWTYPE;
    candidate_item RECORD;
    assertion_item RECORD;
    participant_item RECORD;
    next_sequence BIGINT;
    expected_count INTEGER;
    inserted_count INTEGER;
BEGIN
    IF p_result_fingerprint IS NULL
       OR length(p_result_fingerprint) NOT BETWEEN 1 AND 256
       OR p_result_fingerprint ~ E'[\\r\\n]'
       OR p_duration_milliseconds IS NULL
       OR p_duration_milliseconds NOT BETWEEN 0 AND 86400000
       OR jsonb_typeof(p_result) IS DISTINCT FROM 'object'
       OR p_result->>'kind' IS DISTINCT FROM 'decision-forensics'
       OR p_result->>'processorVersion' IS DISTINCT FROM 'analysis.decision-forensics.v1'
       OR p_result->>'providerKind' IS DISTINCT FROM 'ollama'
       OR p_result->>'resultSchemaVersion' IS DISTINCT FROM 'decision-forensics.result.v1'
       OR p_result->>'promptVersion' IS DISTINCT FROM 'decision-forensics.extract.v1'
       OR p_result->>'evaluationVersion' IS DISTINCT FROM 'decision-forensics.evaluation.v1'
       OR p_result->>'promptDigest' !~ '^[0-9a-f]{64}$'
       OR p_result->>'model' !~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$'
       OR length(p_result->>'summary') NOT BETWEEN 1 AND 500
       OR jsonb_typeof(p_result->'generationPolicy') IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_result->'usage') IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_result->'sources') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_result->'sourceTruncated') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(p_result->'candidates') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_result->'sources') > 100
       OR jsonb_array_length(p_result->'candidates') > 20
    THEN
        RAISE EXCEPTION 'Decision Forensics result payload is invalid.' USING ERRCODE = '22023';
    END IF;

    SELECT job.* INTO leased_job
    FROM public.analysis_jobs AS job
    WHERE job.analysis_job_id = p_job_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Analysis job lease is stale.' USING ERRCODE = 'P0003';
    END IF;

    SELECT attempt.* INTO active_attempt
    FROM public.analysis_job_attempts AS attempt
    WHERE attempt.analysis_job_attempt_id = p_attempt_id
      AND attempt.analysis_job_id = p_job_id
      AND attempt.lease_token = p_lease_token;

    IF leased_job.terminal_outcome = 'succeeded' THEN
        IF FOUND
           AND active_attempt.outcome = 'succeeded'
           AND active_attempt.result_fingerprint = p_result_fingerprint
           AND EXISTS (
                SELECT 1 FROM public.analysis_results AS result
                WHERE result.analysis_run_id = leased_job.analysis_run_id
                  AND result.result_kind = 'decision-forensics'
                  AND result.result_fingerprint = p_result_fingerprint
           )
        THEN
            RETURN NEXT leased_job;
            RETURN;
        END IF;
        RAISE EXCEPTION 'Analysis job lease is stale.' USING ERRCODE = 'P0003';
    END IF;

    IF NOT FOUND
       OR leased_job.terminal_outcome IS NOT NULL
       OR leased_job.lease_token IS DISTINCT FROM p_lease_token
       OR leased_job.lease_expires_at <= operation_time
       OR active_attempt.outcome IS NOT NULL
       OR active_attempt.processor_version <> p_result->>'processorVersion'
    THEN
        RAISE EXCEPTION 'Analysis job lease is stale.' USING ERRCODE = 'P0003';
    END IF;

    SELECT stored.* INTO manifest
    FROM public.analysis_execution_manifests AS stored
    WHERE stored.analysis_run_id = leased_job.analysis_run_id;
    IF NOT FOUND
       OR manifest.provider_kind <> p_result->>'providerKind'
       OR manifest.model <> p_result->>'model'
       OR manifest.processor_version <> p_result->>'processorVersion'
       OR manifest.result_schema_version <> p_result->>'resultSchemaVersion'
       OR manifest.prompt_version <> p_result->>'promptVersion'
       OR manifest.prompt_digest <> p_result->>'promptDigest'
       OR manifest.evaluation_version <> p_result->>'evaluationVersion'
       OR manifest.generation_policy <> p_result->'generationPolicy'
    THEN
        RAISE EXCEPTION 'Decision Forensics manifest does not match the result.' USING ERRCODE = '22023';
    END IF;

    expected_count := jsonb_array_length(p_result->'sources');
    IF (p_result->>'sourceCount')::INTEGER IS DISTINCT FROM expected_count THEN
        RAISE EXCEPTION 'Decision Forensics source set is invalid.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.analysis_results (
        analysis_run_id, result_kind, processor_version, provider_kind, model,
        evaluation_version, result_fingerprint, source_count, source_truncated,
        summary, input_units, output_units, created_at
    ) VALUES (
        leased_job.analysis_run_id, 'decision-forensics', p_result->>'processorVersion',
        p_result->>'providerKind', p_result->>'model', p_result->>'evaluationVersion',
        p_result_fingerprint, expected_count, (p_result->>'sourceTruncated')::BOOLEAN,
        p_result->>'summary', (p_result->'usage'->>'inputUnits')::INTEGER,
        (p_result->'usage'->>'outputUnits')::INTEGER, operation_time
    ) RETURNING * INTO STRICT created_result;

    INSERT INTO public.analysis_result_sources (
        analysis_result_id, ordinal, message_id, message_version_id
    )
    SELECT created_result.analysis_result_id, source.ordinal::INTEGER,
           snapshot.message_id, snapshot.message_version_id
    FROM jsonb_array_elements(p_result->'sources') WITH ORDINALITY AS source(value, ordinal)
    INNER JOIN public.analysis_run_source_snapshot_items AS snapshot
        ON snapshot.analysis_run_id = leased_job.analysis_run_id
       AND snapshot.ordinal = source.ordinal
       AND snapshot.message_id = (source.value->>'messageId')::UUID
       AND snapshot.message_version_id = (source.value->>'messageRevisionId')::UUID;
    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    IF inserted_count <> expected_count THEN
        RAISE EXCEPTION 'Decision Forensics sources do not match the snapshot.' USING ERRCODE = '22023';
    END IF;

    FOR candidate_item IN
        SELECT item.value, item.ordinality::INTEGER AS ordinal
        FROM jsonb_array_elements(p_result->'candidates') WITH ORDINALITY AS item(value, ordinality)
    LOOP
        IF jsonb_typeof(candidate_item.value) IS DISTINCT FROM 'object'
           OR length(candidate_item.value->>'title') NOT BETWEEN 1 AND 120
           OR length(candidate_item.value->>'summary') NOT BETWEEN 1 AND 1000
           OR candidate_item.value->>'disposition' NOT IN ('made', 'deferred', 'changed', 'rejected')
           OR (candidate_item.value->>'confidence')::DOUBLE PRECISION NOT BETWEEN 0 AND 1
           OR jsonb_typeof(candidate_item.value->'claims') IS DISTINCT FROM 'array'
           OR jsonb_array_length(candidate_item.value->'claims') NOT BETWEEN 1 AND 20
           OR jsonb_typeof(candidate_item.value->'assumptions') IS DISTINCT FROM 'array'
           OR jsonb_array_length(candidate_item.value->'assumptions') > 20
           OR jsonb_typeof(candidate_item.value->'participants') IS DISTINCT FROM 'array'
           OR jsonb_array_length(candidate_item.value->'participants') > 100
        THEN
            RAISE EXCEPTION 'Decision candidate is invalid.' USING ERRCODE = '22023';
        END IF;

        INSERT INTO public.analysis_decision_candidates (
            analysis_result_id, ordinal, title, summary, disposition, confidence, created_at
        ) VALUES (
            created_result.analysis_result_id, candidate_item.ordinal,
            candidate_item.value->>'title', candidate_item.value->>'summary',
            candidate_item.value->>'disposition',
            (candidate_item.value->>'confidence')::DOUBLE PRECISION, operation_time
        ) RETURNING * INTO STRICT created_candidate;

        FOR assertion_item IN
            SELECT 'claim'::TEXT AS kind, item.value, item.ordinality::INTEGER AS ordinal
            FROM jsonb_array_elements(candidate_item.value->'claims') WITH ORDINALITY AS item(value, ordinality)
            UNION ALL
            SELECT 'assumption'::TEXT, item.value, item.ordinality::INTEGER
            FROM jsonb_array_elements(candidate_item.value->'assumptions') WITH ORDINALITY AS item(value, ordinality)
        LOOP
            IF jsonb_typeof(assertion_item.value) IS DISTINCT FROM 'object'
               OR length(assertion_item.value->>'text') NOT BETWEEN 1 AND 500
               OR jsonb_typeof(assertion_item.value->'evidence') IS DISTINCT FROM 'array'
               OR jsonb_array_length(assertion_item.value->'evidence') NOT BETWEEN 1 AND 100
            THEN
                RAISE EXCEPTION 'Decision assertion is invalid.' USING ERRCODE = '22023';
            END IF;
            INSERT INTO public.analysis_decision_assertions (
                analysis_decision_candidate_id, analysis_result_id,
                assertion_kind, ordinal, assertion_text
            ) VALUES (
                created_candidate.analysis_decision_candidate_id,
                created_result.analysis_result_id, assertion_item.kind,
                assertion_item.ordinal, assertion_item.value->>'text'
            );
            INSERT INTO public.analysis_decision_assertion_sources (
                analysis_decision_candidate_id, analysis_result_id, assertion_kind,
                assertion_ordinal, evidence_ordinal, message_id, message_version_id
            )
            SELECT created_candidate.analysis_decision_candidate_id,
                   created_result.analysis_result_id, assertion_item.kind,
                   assertion_item.ordinal, evidence.ordinal::INTEGER,
                   source.message_id, source.message_version_id
            FROM jsonb_array_elements(assertion_item.value->'evidence')
                 WITH ORDINALITY AS evidence(value, ordinal)
            INNER JOIN public.analysis_result_sources AS source
                ON source.analysis_result_id = created_result.analysis_result_id
               AND source.message_id = (evidence.value->>'messageId')::UUID
               AND source.message_version_id = (evidence.value->>'messageRevisionId')::UUID;
            GET DIAGNOSTICS inserted_count = ROW_COUNT;
            IF inserted_count <> jsonb_array_length(assertion_item.value->'evidence') THEN
                RAISE EXCEPTION 'Decision assertion evidence is invalid.' USING ERRCODE = '22023';
            END IF;
        END LOOP;

        FOR participant_item IN
            SELECT item.value, item.ordinality::INTEGER AS ordinal
            FROM jsonb_array_elements(candidate_item.value->'participants')
                 WITH ORDINALITY AS item(value, ordinality)
        LOOP
            IF jsonb_typeof(participant_item.value) IS DISTINCT FROM 'object'
               OR participant_item.value->>'role' NOT IN ('proposer', 'decision-maker', 'contributor')
               OR jsonb_typeof(participant_item.value->'evidence') IS DISTINCT FROM 'array'
               OR jsonb_array_length(participant_item.value->'evidence') NOT BETWEEN 1 AND 100
            THEN
                RAISE EXCEPTION 'Decision participant is invalid.' USING ERRCODE = '22023';
            END IF;
            INSERT INTO public.analysis_decision_participants (
                analysis_decision_candidate_id, analysis_result_id, ordinal,
                profile_id, participant_role
            ) VALUES (
                created_candidate.analysis_decision_candidate_id,
                created_result.analysis_result_id, participant_item.ordinal,
                (participant_item.value->>'profileId')::UUID,
                participant_item.value->>'role'
            );
            INSERT INTO public.analysis_decision_participant_sources (
                analysis_decision_candidate_id, analysis_result_id,
                participant_ordinal, evidence_ordinal, message_id, message_version_id
            )
            SELECT created_candidate.analysis_decision_candidate_id,
                   created_result.analysis_result_id, participant_item.ordinal,
                   evidence.ordinal::INTEGER, source.message_id, source.message_version_id
            FROM jsonb_array_elements(participant_item.value->'evidence')
                 WITH ORDINALITY AS evidence(value, ordinal)
            INNER JOIN public.analysis_result_sources AS source
                ON source.analysis_result_id = created_result.analysis_result_id
               AND source.message_id = (evidence.value->>'messageId')::UUID
               AND source.message_version_id = (evidence.value->>'messageRevisionId')::UUID
            INNER JOIN public.messages AS message
                ON message.message_id = source.message_id
               AND message.author_user_id = (participant_item.value->>'profileId')::UUID;
            GET DIAGNOSTICS inserted_count = ROW_COUNT;
            IF inserted_count <> jsonb_array_length(participant_item.value->'evidence') THEN
                RAISE EXCEPTION 'Decision participant evidence is invalid.' USING ERRCODE = '22023';
            END IF;
        END LOOP;
    END LOOP;

    UPDATE public.analysis_job_attempts
    SET outcome = 'succeeded', result_fingerprint = p_result_fingerprint,
        duration_milliseconds = p_duration_milliseconds, completed_at = operation_time
    WHERE analysis_job_attempt_id = active_attempt.analysis_job_attempt_id;
    UPDATE public.analysis_jobs
    SET terminal_outcome = 'succeeded', completed_at = operation_time,
        lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL,
        updated_at = operation_time
    WHERE analysis_job_id = leased_job.analysis_job_id
    RETURNING * INTO STRICT leased_job;
    SELECT coalesce(max(event.sequence_number), 0) + 1 INTO next_sequence
    FROM public.analysis_run_lifecycle_events AS event
    WHERE event.analysis_run_id = leased_job.analysis_run_id;
    INSERT INTO public.analysis_run_lifecycle_events (
        analysis_run_id, sequence_number, state, job_id, attempt_id, occurred_at
    ) VALUES (
        leased_job.analysis_run_id, next_sequence, 'succeeded',
        leased_job.analysis_job_id, active_attempt.analysis_job_attempt_id, operation_time
    );
    RETURN NEXT leased_job;
EXCEPTION
    WHEN data_exception OR check_violation OR foreign_key_violation OR unique_violation THEN
        RAISE EXCEPTION 'Decision Forensics result payload is invalid.' USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION public.complete_decision_forensics_job_success(
    UUID, UUID, UUID, TEXT, INTEGER, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_decision_forensics_job_success(
    UUID, UUID, UUID, TEXT, INTEGER, JSONB
) TO service_role;

COMMENT ON TABLE public.analysis_decision_candidates IS
    'Immutable model-proposed decisions belonging to one Decision Forensics result.';
COMMENT ON TABLE public.analysis_decision_assertions IS
    'Immutable claims and assumptions extracted for a decision candidate.';
COMMENT ON TABLE public.analysis_decision_assertion_sources IS
    'Ordered frozen message-revision evidence for a decision claim or assumption.';
COMMENT ON TABLE public.analysis_decision_participants IS
    'Model-proposed participant roles; every role requires authored evidence.';
COMMENT ON TABLE public.analysis_decision_participant_sources IS
    'Ordered frozen authored evidence supporting one participant role.';
COMMENT ON FUNCTION public.complete_decision_forensics_job_success(
    UUID, UUID, UUID, TEXT, INTEGER, JSONB
) IS 'Lease-fenced atomic persistence of a manifest-matched Decision Forensics result, candidates, evidence, attempt, and lifecycle fact.';
