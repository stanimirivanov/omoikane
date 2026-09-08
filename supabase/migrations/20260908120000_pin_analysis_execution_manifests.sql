CREATE TABLE public.analysis_execution_manifests (
    analysis_run_id UUID PRIMARY KEY REFERENCES public.analysis_runs(analysis_run_id) ON DELETE RESTRICT,
    provider_kind TEXT NOT NULL CHECK (provider_kind ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$'),
    model TEXT NOT NULL CHECK (model ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$'),
    processor_version TEXT NOT NULL CHECK (processor_version ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$'),
    result_schema_version TEXT NOT NULL CHECK (result_schema_version ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$'),
    prompt_version TEXT NOT NULL CHECK (prompt_version ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$'),
    prompt_digest TEXT NOT NULL CHECK (prompt_digest ~ '^[0-9a-f]{64}$'),
    evaluation_version TEXT NOT NULL CHECK (evaluation_version ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$'),
    generation_policy JSONB NOT NULL CHECK (generation_policy = '{"temperature":0,"maxOutputTokens":8192,"tools":false,"repairAttempts":0}'::JSONB),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION private.reject_analysis_execution_manifest_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    RAISE EXCEPTION 'Analysis execution manifests are immutable.' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER analysis_execution_manifests_are_immutable
BEFORE UPDATE OR DELETE ON public.analysis_execution_manifests
FOR EACH ROW EXECUTE FUNCTION private.reject_analysis_execution_manifest_mutation();
ALTER TABLE public.analysis_execution_manifests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analysis_execution_manifests FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.pin_analysis_job_execution_manifest(
    p_job_id UUID, p_attempt_id UUID, p_lease_token UUID, p_configuration JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    leased_job public.analysis_jobs%ROWTYPE;
    accepted_run public.analysis_runs%ROWTYPE;
    manifest public.analysis_execution_manifests%ROWTYPE;
BEGIN
    -- Serializes pins and prevents lease takeover until this transaction ends.
    SELECT job.* INTO leased_job
    FROM public.analysis_jobs AS job
    INNER JOIN public.analysis_job_attempts AS attempt
        ON attempt.analysis_job_id = job.analysis_job_id
       AND attempt.analysis_job_attempt_id = p_attempt_id
       AND attempt.lease_token = p_lease_token
       AND attempt.outcome IS NULL
    WHERE job.analysis_job_id = p_job_id
      AND job.terminal_outcome IS NULL
      AND job.lease_token = p_lease_token
    FOR UPDATE OF job;
    IF NOT FOUND OR leased_job.lease_expires_at <= clock_timestamp() THEN
        RAISE EXCEPTION 'Analysis job lease is stale.' USING ERRCODE = 'P0003';
    END IF;
    SELECT run.* INTO STRICT accepted_run FROM public.analysis_runs AS run
    WHERE run.analysis_run_id = leased_job.analysis_run_id AND run.workspace_id = leased_job.workspace_id;
    IF accepted_run.channel_id IS NULL OR NOT private.can_request_channel_analysis(
        accepted_run.workspace_id, accepted_run.channel_id, accepted_run.requested_by
    ) THEN
        RAISE EXCEPTION 'Analysis source access was revoked.' USING ERRCODE = 'P0004';
    END IF;
    SELECT stored.* INTO manifest FROM public.analysis_execution_manifests AS stored
    WHERE stored.analysis_run_id = accepted_run.analysis_run_id;
    IF NOT FOUND THEN
        IF jsonb_typeof(p_configuration) IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION 'Analysis execution configuration is unsupported.' USING ERRCODE = '22023';
        END IF;
        IF NOT (p_configuration ?& ARRAY['providerKind','model','processorVersion','resultSchemaVersion','promptVersion','promptDigest','evaluationVersion','generationPolicy'])
           OR p_configuration - ARRAY['providerKind','model','processorVersion','resultSchemaVersion','promptVersion','promptDigest','evaluationVersion','generationPolicy'] <> '{}'::JSONB
           OR EXISTS (SELECT 1 FROM jsonb_each(p_configuration) AS field
                WHERE field.key <> 'generationPolicy' AND jsonb_typeof(field.value) <> 'string')
           OR (p_configuration->>'processorVersion') IS DISTINCT FROM (
                SELECT processor_version FROM public.analysis_job_attempts WHERE analysis_job_attempt_id = p_attempt_id
           )
        THEN
            RAISE EXCEPTION 'Analysis execution configuration is unsupported.' USING ERRCODE = '22023';
        END IF;
        BEGIN
            INSERT INTO public.analysis_execution_manifests (
                analysis_run_id, provider_kind, model, processor_version, result_schema_version, prompt_version, prompt_digest, evaluation_version, generation_policy
            ) VALUES (
                accepted_run.analysis_run_id, p_configuration->>'providerKind', p_configuration->>'model', p_configuration->>'processorVersion', p_configuration->>'resultSchemaVersion', p_configuration->>'promptVersion', p_configuration->>'promptDigest', p_configuration->>'evaluationVersion', p_configuration->'generationPolicy'
            ) ON CONFLICT (analysis_run_id) DO NOTHING;
        EXCEPTION WHEN check_violation OR not_null_violation THEN
            RAISE EXCEPTION 'Analysis execution configuration is unsupported.' USING ERRCODE = '22023';
        END;
        SELECT stored.* INTO STRICT manifest FROM public.analysis_execution_manifests AS stored
        WHERE stored.analysis_run_id = accepted_run.analysis_run_id;
    END IF;
    RETURN jsonb_build_object(
        'analysisRunId', manifest.analysis_run_id,
        'configuration', jsonb_build_object(
            'providerKind', manifest.provider_kind,
            'model', manifest.model,
            'processorVersion', manifest.processor_version,
            'resultSchemaVersion', manifest.result_schema_version,
            'promptVersion', manifest.prompt_version,
            'promptDigest', manifest.prompt_digest,
            'evaluationVersion', manifest.evaluation_version,
            'generationPolicy', manifest.generation_policy
        )
    );
END;
$$;
REVOKE ALL ON FUNCTION public.pin_analysis_job_execution_manifest(UUID,UUID,UUID,JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pin_analysis_job_execution_manifest(UUID,UUID,UUID,JSONB) TO service_role;
COMMENT ON TABLE public.analysis_execution_manifests IS
    'Immutable model and artifact selection per run, created before model invocation and reused by every attempt.';
COMMENT ON FUNCTION public.pin_analysis_job_execution_manifest(UUID,UUID,UUID,JSONB) IS
    'Lease-fenced create-or-observe command; an existing manifest wins over newly proposed configuration.';
