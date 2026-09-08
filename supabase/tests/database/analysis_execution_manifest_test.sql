BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(19);

SELECT ok(NOT has_function_privilege('anon', 'public.pin_analysis_job_execution_manifest(uuid,uuid,uuid,jsonb)', 'EXECUTE'), 'Anonymous callers cannot pin manifests');
SELECT ok(NOT has_function_privilege('authenticated', 'public.pin_analysis_job_execution_manifest(uuid,uuid,uuid,jsonb)', 'EXECUTE'), 'Browser callers cannot pin manifests');
SELECT ok(NOT has_table_privilege('service_role', 'public.analysis_execution_manifests', 'SELECT'), 'Workers have no direct manifest table access');

SELECT workspace_id FROM public.workspaces WHERE created_by = '10000000-0000-4000-8000-000000000001' ORDER BY created_at LIMIT 1 \gset workspace_
SELECT channel_id FROM public.channel_heads WHERE workspace_id = :'workspace_workspace_id' AND channel_status = 'active' ORDER BY channel_id LIMIT 1 \gset channel_
SET LOCAL ROLE service_role;
SELECT analysis_run_id FROM public.start_analysis_run(
    :'workspace_workspace_id', :'channel_channel_id', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z',
    '10000000-0000-4000-8000-000000000001', '00-11111111111111111111111111111111-2222222222222222-01', NULL
) \gset run_
SELECT analysis_run_outbox_event_id, claim_token FROM public.claim_analysis_run_outbox_event('manifest-test') \gset outbox_
SELECT analysis_job_id FROM public.dispatch_analysis_run_outbox_event(:'outbox_analysis_run_outbox_event_id', :'outbox_claim_token') \gset job_
SELECT * FROM public.acquire_analysis_job('manifest-test', 'analysis.decision-forensics.v1', 60) \gset attempt_
SELECT '{"providerKind":"deterministic","model":"conformance.v1","processorVersion":"analysis.decision-forensics.v1","resultSchemaVersion":"decision-forensics.result.v1","promptVersion":"decision-forensics.extract.v1","promptDigest":"d0b179cc79776914ad559aef19e9060dd13bff3946200bbc6f7914a980e9fff1","evaluationVersion":"decision-forensics.evaluation.v1","generationPolicy":{"temperature":0,"maxOutputTokens":8192,"tools":false,"repairAttempts":0}}'::JSONB AS configuration \gset fixture_

SELECT throws_ok(format('SELECT public.pin_analysis_job_execution_manifest(%L,%L,%L,NULL)', :'attempt_analysis_job_id', :'attempt_analysis_job_attempt_id', :'attempt_lease_token'),
    '22023', 'Analysis execution configuration is unsupported.', 'Missing configuration cannot create a manifest');
SELECT throws_ok(format('SELECT public.pin_analysis_job_execution_manifest(%L,%L,%L,%L)', :'attempt_analysis_job_id', :'attempt_analysis_job_attempt_id', :'attempt_lease_token', :'fixture_configuration'::JSONB || '{"secret":"not-allowed"}'::JSONB),
    '22023', 'Analysis execution configuration is unsupported.', 'Unexpected fields cannot enter durable metadata');
SELECT throws_ok(format('SELECT public.pin_analysis_job_execution_manifest(%L,%L,%L,%L)', :'attempt_analysis_job_id', :'attempt_analysis_job_attempt_id', :'attempt_lease_token', :'fixture_configuration'::JSONB || '{"promptDigest":"invalid"}'::JSONB),
    '22023', 'Analysis execution configuration is unsupported.', 'Prompt digest must be lowercase SHA-256');
SELECT throws_ok(format('SELECT public.pin_analysis_job_execution_manifest(%L,%L,%L,%L)', :'attempt_analysis_job_id', :'attempt_analysis_job_attempt_id', :'attempt_lease_token', :'fixture_configuration'::JSONB || '{"processorVersion":"different.v1"}'::JSONB),
    '22023', 'Analysis execution configuration is unsupported.', 'Initial processor must match the leased attempt');
SELECT throws_ok(format('SELECT public.pin_analysis_job_execution_manifest(%L,%L,%L,%L)', :'attempt_analysis_job_id', :'attempt_analysis_job_attempt_id', :'attempt_lease_token', :'fixture_configuration'::JSONB || '{"generationPolicy":{"tools":true}}'::JSONB),
    '22023', 'Analysis execution configuration is unsupported.', 'Unsupported generation policy cannot be pinned');

SELECT public.pin_analysis_job_execution_manifest(:'attempt_analysis_job_id', :'attempt_analysis_job_attempt_id', :'attempt_lease_token', :'fixture_configuration') AS manifest \gset first_
SELECT is(:'first_manifest'::JSONB, jsonb_build_object('analysisRunId', :'run_analysis_run_id', 'configuration', :'fixture_configuration'::JSONB), 'The first pin records the full configuration');
SELECT is(public.pin_analysis_job_execution_manifest(:'attempt_analysis_job_id', :'attempt_analysis_job_attempt_id', :'attempt_lease_token', :'fixture_configuration'::JSONB || '{"model":"other-model.v2"}'::JSONB), :'first_manifest'::JSONB, 'A competing proposal observes the first selection without replacing it');
SELECT is(public.pin_analysis_job_execution_manifest(:'attempt_analysis_job_id', :'attempt_analysis_job_attempt_id', :'attempt_lease_token', NULL), :'first_manifest'::JSONB, 'Observing an existing manifest does not require a new proposal');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.analysis_execution_manifests WHERE analysis_run_id = :'run_analysis_run_id'), 1::BIGINT, 'There is exactly one manifest per run');
SELECT throws_ok(format('UPDATE public.analysis_execution_manifests SET model = %L WHERE analysis_run_id = %L', 'other-model.v2', :'run_analysis_run_id'), '55000', 'Analysis execution manifests are immutable.', 'Manifest configuration cannot be updated');
SELECT throws_ok(format('DELETE FROM public.analysis_execution_manifests WHERE analysis_run_id = %L', :'run_analysis_run_id'), '55000', 'Analysis execution manifests are immutable.', 'Manifest history cannot be deleted');

UPDATE public.analysis_jobs SET lease_expires_at = clock_timestamp() - INTERVAL '1 second' WHERE analysis_job_id = :'job_analysis_job_id';
SET LOCAL ROLE service_role;
SELECT throws_ok(format('SELECT public.pin_analysis_job_execution_manifest(%L,%L,%L,%L)', :'attempt_analysis_job_id', :'attempt_analysis_job_attempt_id', :'attempt_lease_token', :'fixture_configuration'), 'P0003', 'Analysis job lease is stale.', 'Expired leases cannot observe a manifest');
SELECT * FROM public.acquire_analysis_job('manifest-recovery', 'analysis.decision-forensics.v1', 60) \gset recovered_
SELECT is(public.pin_analysis_job_execution_manifest(:'recovered_analysis_job_id', :'recovered_analysis_job_attempt_id', :'recovered_lease_token', :'fixture_configuration'::JSONB || '{"model":"after-deployment.v2"}'::JSONB), :'first_manifest'::JSONB, 'A recovered attempt retains the original model after deployment changes');
SELECT throws_ok(format('SELECT public.pin_analysis_job_execution_manifest(%L,%L,%L,%L)', :'attempt_analysis_job_id', :'attempt_analysis_job_attempt_id', :'attempt_lease_token', :'fixture_configuration'), 'P0003', 'Analysis job lease is stale.', 'Replaced leases cannot pin or observe manifests');

RESET ROLE;
UPDATE public.channel_heads SET channel_status = 'archived' WHERE channel_id = :'channel_channel_id';
SET LOCAL ROLE service_role;
SELECT throws_ok(format('SELECT public.pin_analysis_job_execution_manifest(%L,%L,%L,%L)', :'recovered_analysis_job_id', :'recovered_analysis_job_attempt_id', :'recovered_lease_token', :'fixture_configuration'), 'P0004', 'Analysis source access was revoked.', 'Archived channels cannot observe manifests');
RESET ROLE;
UPDATE public.channel_heads SET channel_status = 'active' WHERE channel_id = :'channel_channel_id';
UPDATE public.workspace_membership_heads SET membership_status = 'removed' WHERE workspace_id = :'workspace_workspace_id' AND user_id = '10000000-0000-4000-8000-000000000001';
SET LOCAL ROLE service_role;
SELECT throws_ok(format('SELECT public.pin_analysis_job_execution_manifest(%L,%L,%L,%L)', :'recovered_analysis_job_id', :'recovered_analysis_job_attempt_id', :'recovered_lease_token', :'fixture_configuration'), 'P0004', 'Analysis source access was revoked.', 'Revocation blocks manifest access on retry');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
