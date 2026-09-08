BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(43);

SELECT has_table('public', 'analysis_decision_candidates', 'Decision candidates are durable');
SELECT has_table('public', 'analysis_decision_assertions', 'Claims and assumptions are durable');
SELECT has_table('public', 'analysis_decision_assertion_sources', 'Assertion evidence is durable');
SELECT has_table('public', 'analysis_decision_participants', 'Participant roles are durable');
SELECT has_table('public', 'analysis_decision_participant_sources', 'Participant evidence is durable');
SELECT has_function('public', 'complete_decision_forensics_job_success', ARRAY['uuid','uuid','uuid','text','integer','jsonb'], 'Decision completion has a dedicated atomic command');
SELECT ok(NOT has_function_privilege('authenticated', 'public.complete_decision_forensics_job_success(uuid,uuid,uuid,text,integer,jsonb)', 'EXECUTE'), 'Browser callers cannot complete Decision Forensics jobs');
SELECT ok(NOT has_table_privilege('service_role', 'public.analysis_decision_candidates', 'SELECT'), 'Workers cannot read candidate tables directly');
SELECT ok(NOT has_function_privilege('service_role', 'private.build_analysis_result_projection(uuid)', 'EXECUTE'), 'The internal result mapper is not an independent worker capability');
SELECT has_table('public', 'analysis_decision_review_events', 'Human reviews are durable');
SELECT has_function('public', 'review_analysis_decision_candidate', ARRAY['uuid','uuid','uuid','uuid','text','text'], 'Human review has one focused command');
SELECT ok(NOT has_function_privilege('authenticated', 'public.review_analysis_decision_candidate(uuid,uuid,uuid,uuid,text,text)', 'EXECUTE'), 'Browser callers cannot write review facts directly');
SELECT ok(NOT has_table_privilege('service_role', 'public.analysis_decision_review_events', 'SELECT'), 'Trusted runtimes cannot bypass the review command');

SELECT workspace_id FROM public.workspaces
WHERE created_by = '10000000-0000-4000-8000-000000000001' ORDER BY created_at LIMIT 1
\gset workspace_
SELECT channel_id FROM public.channel_heads
WHERE workspace_id = :'workspace_workspace_id' AND channel_status = 'active' ORDER BY channel_id LIMIT 1
\gset channel_

INSERT INTO public.messages (message_id, workspace_id, channel_id, author_user_id, created_at)
VALUES ('b0000000-0000-4000-8000-000000000001', :'workspace_workspace_id', :'channel_channel_id',
        '10000000-0000-4000-8000-000000000001', '2026-02-01T10:00:00Z');
INSERT INTO public.message_versions (message_version_id, message_id, version_number, content, created_by, created_at)
VALUES ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 1,
        'We agreed to release on Friday.', '10000000-0000-4000-8000-000000000001', '2026-02-01T10:00:00Z');
INSERT INTO public.message_heads (message_id, workspace_id, channel_id, latest_message_version_id, latest_version_number, message_status)
VALUES ('b0000000-0000-4000-8000-000000000001', :'workspace_workspace_id', :'channel_channel_id',
        'b1000000-0000-4000-8000-000000000001', 1, 'active');

SET LOCAL ROLE service_role;
SELECT analysis_run_id FROM public.start_analysis_run(
    :'workspace_workspace_id', :'channel_channel_id', '2026-02-01T00:00:00Z', '2026-02-02T00:00:00Z',
    '10000000-0000-4000-8000-000000000001', '00-11111111111111111111111111111111-2222222222222222-01', NULL
) \gset run_
SELECT analysis_run_outbox_event_id, claim_token FROM public.claim_analysis_run_outbox_event('decision-dispatcher') \gset outbox_
SELECT analysis_job_id FROM public.dispatch_analysis_run_outbox_event(:'outbox_analysis_run_outbox_event_id', :'outbox_claim_token') \gset job_
SELECT * FROM public.acquire_analysis_job('decision-worker', 'analysis.decision-forensics.v1', 60) \gset attempt_
SELECT public.load_analysis_job_extraction_input(:'attempt_analysis_job_id', :'attempt_analysis_job_attempt_id', :'attempt_lease_token');

SELECT '{"providerKind":"ollama","model":"qwen3:8b","processorVersion":"analysis.decision-forensics.v1","resultSchemaVersion":"decision-forensics.result.v1","promptVersion":"decision-forensics.extract.v1","promptDigest":"d0b179cc79776914ad559aef19e9060dd13bff3946200bbc6f7914a980e9fff1","evaluationVersion":"decision-forensics.evaluation.v1","generationPolicy":{"temperature":0,"maxOutputTokens":8192,"tools":false,"repairAttempts":0}}'::JSONB AS configuration
\gset fixture_
SELECT public.pin_analysis_job_execution_manifest(:'attempt_analysis_job_id', :'attempt_analysis_job_attempt_id', :'attempt_lease_token', :'fixture_configuration');

SELECT jsonb_build_object(
    'kind', 'decision-forensics', 'processorVersion', 'analysis.decision-forensics.v1',
    'providerKind', 'ollama', 'model', 'qwen3:8b',
    'resultSchemaVersion', 'decision-forensics.result.v1',
    'promptVersion', 'decision-forensics.extract.v1',
    'promptDigest', 'd0b179cc79776914ad559aef19e9060dd13bff3946200bbc6f7914a980e9fff1',
    'evaluationVersion', 'decision-forensics.evaluation.v1',
    'generationPolicy', '{"temperature":0,"maxOutputTokens":8192,"tools":false,"repairAttempts":0}'::JSONB,
    'usage', jsonb_build_object('inputUnits', 42, 'outputUnits', 17),
    'sourceCount', 1, 'sourceTruncated', FALSE, 'summary', 'Extracted 1 proposed decision candidate.',
    'sources', jsonb_build_array(jsonb_build_object(
        'messageId', 'b0000000-0000-4000-8000-000000000001',
        'messageRevisionId', 'b1000000-0000-4000-8000-000000000001')),
    'candidates', jsonb_build_array(jsonb_build_object(
        'title', 'Release timing', 'summary', 'The release will happen Friday.',
        'disposition', 'made', 'confidence', 0.9,
        'claims', jsonb_build_array(jsonb_build_object(
            'text', 'Release on Friday.', 'evidence', jsonb_build_array(jsonb_build_object(
                'messageId', 'b0000000-0000-4000-8000-000000000001',
                'messageRevisionId', 'b1000000-0000-4000-8000-000000000001')))),
        'assumptions', jsonb_build_array(jsonb_build_object(
            'text', 'Friday refers to the upcoming Friday.',
            'evidence', jsonb_build_array(jsonb_build_object(
                'messageId', 'b0000000-0000-4000-8000-000000000001',
                'messageRevisionId', 'b1000000-0000-4000-8000-000000000001')))),
        'participants', jsonb_build_array(jsonb_build_object(
            'profileId', '10000000-0000-4000-8000-000000000001', 'role', 'decision-maker',
            'evidence', jsonb_build_array(jsonb_build_object(
                'messageId', 'b0000000-0000-4000-8000-000000000001',
                'messageRevisionId', 'b1000000-0000-4000-8000-000000000001'))))))
) AS result
\gset fixture_

SELECT throws_ok(format(
    'SELECT public.complete_decision_forensics_job_success(%L,%L,%L,%L,12,%L)',
    :'attempt_analysis_job_id', :'attempt_analysis_job_attempt_id', :'attempt_lease_token', 'decision-fingerprint-v1',
    :'fixture_result'::JSONB || '{"model":"other-model"}'::JSONB
), '22023', 'Decision Forensics result payload is invalid.', 'Completion rejects metadata that differs from the pinned manifest');

SELECT throws_ok(format(
    'SELECT public.complete_decision_forensics_job_success(%L,%L,%L,%L,12,%L)',
    :'attempt_analysis_job_id', :'attempt_analysis_job_attempt_id', :'attempt_lease_token', 'decision-fingerprint-v1',
    jsonb_set(:'fixture_result'::JSONB, '{candidates,0,claims,0,evidence,0,messageRevisionId}', '"b1000000-0000-4000-8000-000000000099"')
), '22023', 'Decision Forensics result payload is invalid.', 'Completion rejects evidence outside the frozen result sources');

SELECT throws_ok(format(
    'SELECT public.complete_decision_forensics_job_success(%L,%L,%L,%L,12,%L)',
    :'attempt_analysis_job_id', :'attempt_analysis_job_attempt_id', :'attempt_lease_token', 'decision-fingerprint-v1',
    jsonb_set(:'fixture_result'::JSONB, '{candidates,0,participants,0,profileId}', '"10000000-0000-4000-8000-000000000002"')
), '22023', 'Decision Forensics result payload is invalid.', 'A participant role requires evidence authored by that profile');

SELECT * FROM public.complete_decision_forensics_job_success(
    :'attempt_analysis_job_id', :'attempt_analysis_job_attempt_id', :'attempt_lease_token',
    'decision-fingerprint-v1', 12, :'fixture_result'
);
SELECT * FROM public.complete_decision_forensics_job_success(
    :'attempt_analysis_job_id', :'attempt_analysis_job_attempt_id', :'attempt_lease_token',
    'decision-fingerprint-v1', 12, :'fixture_result'
);
SELECT throws_ok(format(
    'SELECT public.complete_decision_forensics_job_success(%L,%L,%L,%L,12,%L)',
    :'attempt_analysis_job_id', :'attempt_analysis_job_attempt_id', :'attempt_lease_token', 'different-fingerprint', :'fixture_result'
), 'P0003', 'Analysis job lease is stale.', 'A completed attempt cannot be replayed as a different result');
RESET ROLE;

SELECT is((SELECT count(*) FROM public.analysis_results WHERE analysis_run_id = :'run_analysis_run_id'), 1::BIGINT, 'Completion is idempotent for the same fingerprint');
SELECT is((SELECT count(*) FROM public.analysis_decision_candidates), 1::BIGINT, 'One proposed candidate is persisted');
SELECT is((SELECT count(*) FROM public.analysis_decision_assertions WHERE assertion_kind = 'claim'), 1::BIGINT, 'The supported claim is persisted');
SELECT is((SELECT count(*) FROM public.analysis_decision_assertion_sources WHERE assertion_kind = 'claim'), 1::BIGINT, 'Claim evidence is persisted exactly once');
SELECT is((SELECT count(*) FROM public.analysis_decision_participants), 1::BIGINT, 'The participant role is persisted');
SELECT is((SELECT count(*) FROM public.analysis_decision_participant_sources), 1::BIGINT, 'Authored participant evidence is persisted');
SELECT results_eq(
    $$SELECT result_kind, provider_kind, model, input_units, output_units FROM public.analysis_results WHERE result_kind = 'decision-forensics'$$,
    $$VALUES ('decision-forensics'::TEXT, 'ollama'::TEXT, 'qwen3:8b'::TEXT, 42, 17)$$,
    'Provider identity and reported usage are persisted'
);
SET LOCAL ROLE service_role;
SELECT result FROM public.get_analysis_run(
    :'workspace_workspace_id', :'run_analysis_run_id',
    '10000000-0000-4000-8000-000000000001'
) \gset projected_
RESET ROLE;
SELECT is((:'projected_result'::JSONB)->>'kind', 'decision-forensics', 'The authorized projection preserves the result discriminator');
SELECT is((:'projected_result'::JSONB)->'usage', '{"inputUnits":42,"outputUnits":17}'::JSONB, 'The authorized projection includes provider usage');
SELECT is(
    ((:'projected_result'::JSONB)#>'{candidates,0}') - ARRAY['id','claims','assumptions','participants'],
    '{"status":"proposed","review":null,"title":"Release timing","summary":"The release will happen Friday.","disposition":"made","confidence":0.9}'::JSONB,
    'The authorized projection preserves candidate order and proposed state'
);
SELECT is(
    (:'projected_result'::JSONB)#>'{candidates,0,claims,0,evidence,0}',
    '{"messageId":"b0000000-0000-4000-8000-000000000001","messageRevisionId":"b1000000-0000-4000-8000-000000000001"}'::JSONB,
    'The authorized projection retains exact ordered evidence identities'
);
SELECT is(
    (:'projected_result'::JSONB)#>>'{candidates,0,assumptions,0,text}',
    'Friday refers to the upcoming Friday.',
    'The authorized projection includes assumptions'
);
SELECT is(
    ((:'projected_result'::JSONB)#>'{candidates,0,participants,0}') - 'evidence',
    '{"profileId":"10000000-0000-4000-8000-000000000001","role":"decision-maker"}'::JSONB,
    'The authorized projection includes participant identity and role'
);

SELECT analysis_decision_candidate_id FROM public.analysis_decision_candidates LIMIT 1
\gset candidate_
SET LOCAL ROLE service_role;
SELECT public.review_analysis_decision_candidate(
    :'workspace_workspace_id', :'run_analysis_run_id', :'candidate_analysis_decision_candidate_id',
    '10000000-0000-4000-8000-000000000001', 'confirm', 'Reviewed against the cited message.'
) AS review
\gset first_
SELECT public.review_analysis_decision_candidate(
    :'workspace_workspace_id', :'run_analysis_run_id', :'candidate_analysis_decision_candidate_id',
    '10000000-0000-4000-8000-000000000001', 'confirm', 'Reviewed against the cited message.'
) AS review
\gset replay_
RESET ROLE;

SELECT is((:'first_review'::JSONB)->>'action', 'confirm', 'The first review records its action');
SELECT is((:'first_review'::JSONB)->>'reason', 'Reviewed against the cited message.', 'The first review records its optional reason');
SELECT is((SELECT count(*) FROM public.analysis_decision_review_events), 1::BIGINT, 'An exact retry does not append another review fact');
SELECT is((:'replay_review'::JSONB)->>'id', (:'first_review'::JSONB)->>'id', 'An exact retry observes the original review identity');
SET LOCAL ROLE service_role;
SELECT throws_ok(format(
    'SELECT public.review_analysis_decision_candidate(%L,%L,%L,%L,%L,%L)',
    :'workspace_workspace_id', :'run_analysis_run_id', :'candidate_analysis_decision_candidate_id',
    '10000000-0000-4000-8000-000000000001', 'reject', 'A competing review.'
), 'P0006', 'Decision candidate already has a human review.', 'A competing review cannot replace the first review');
SELECT throws_ok(format(
    'SELECT public.review_analysis_decision_candidate(%L,%L,%L,%L,%L,NULL)',
    :'workspace_workspace_id', :'run_analysis_run_id', :'candidate_analysis_decision_candidate_id',
    '10000000-0000-4000-8000-000000000003', 'confirm'
), 'P0002', 'Decision candidate is not accessible.', 'An outsider cannot review a candidate');
SELECT result FROM public.get_analysis_run(
    :'workspace_workspace_id', :'run_analysis_run_id',
    '10000000-0000-4000-8000-000000000001'
) \gset reviewed_
RESET ROLE;
SELECT is((:'reviewed_result'::JSONB)#>>'{candidates,0,status}', 'confirmed', 'The current projection derives confirmed status from the review ledger');
SELECT is((:'reviewed_result'::JSONB)#>>'{candidates,0,review,action}', 'confirm', 'The current projection includes the immutable review fact');
SELECT is((SELECT count(*) FROM public.analysis_decision_candidates), 1::BIGINT, 'Review does not rewrite or replace model candidates');
SELECT throws_ok('UPDATE public.analysis_decision_review_events SET review_action = ''reject''', '55000', 'Analysis output records are immutable.', 'Review facts cannot be rewritten');
SELECT throws_ok('DELETE FROM public.analysis_decision_review_events', '55000', 'Analysis output records are immutable.', 'Review facts cannot be deleted');
SELECT throws_ok('UPDATE public.analysis_decision_candidates SET title = ''changed''', '55000', 'Analysis output records are immutable.', 'Candidates cannot be rewritten');
SELECT throws_ok('DELETE FROM public.analysis_decision_assertion_sources', '55000', 'Analysis output records are immutable.', 'Candidate evidence cannot be deleted');

SELECT * FROM finish();
ROLLBACK;
