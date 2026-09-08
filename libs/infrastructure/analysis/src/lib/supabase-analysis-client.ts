import { createClient, type PostgrestError } from '@supabase/supabase-js';
import { Context, Layer } from 'effect';
import type { Database } from '@omoikane/shared/database';

type AnalysisRunRow = Database['public']['Tables']['analysis_runs']['Row'];
type AnalysisOutboxRow =
  Database['public']['Tables']['analysis_run_outbox_events']['Row'];
type AnalysisJobRow = Database['public']['Tables']['analysis_jobs']['Row'];
type StartArgs = Database['public']['Functions']['start_analysis_run']['Args'];
type GetArgs = Database['public']['Functions']['get_analysis_run']['Args'];
type GetRow =
  Database['public']['Functions']['get_analysis_run']['Returns'][number];
type GeneratedReviewCandidateArgs =
  Database['public']['Functions']['review_analysis_decision_candidate']['Args'];
type ReviewCandidateArgs = Omit<GeneratedReviewCandidateArgs, 'p_reason'> & {
  readonly p_reason: string | null;
};
type ClaimOutboxArgs =
  Database['public']['Functions']['claim_analysis_run_outbox_event']['Args'];
type DispatchOutboxArgs =
  Database['public']['Functions']['dispatch_analysis_run_outbox_event']['Args'];
type AcquireJobArgs =
  Database['public']['Functions']['acquire_analysis_job']['Args'];
type AcquireJobRow =
  Database['public']['Functions']['acquire_analysis_job']['Returns'][number];
type LoadSourcesArgs =
  Database['public']['Functions']['load_analysis_job_sources']['Args'];
type LoadSourceRow =
  Database['public']['Functions']['load_analysis_job_sources']['Returns'][number];
type LoadExtractionInputArgs =
  Database['public']['Functions']['load_analysis_job_extraction_input']['Args'];
type PinManifestArgs =
  Database['public']['Functions']['pin_analysis_job_execution_manifest']['Args'];
export interface SupabaseAnalysisExecutionManifestResult {
  readonly data:
    | Database['public']['Functions']['pin_analysis_job_execution_manifest']['Returns']
    | null;
  readonly error: PostgrestError | null;
}

export interface SupabaseAnalysisJobExtractionInputResult {
  readonly data:
    | Database['public']['Functions']['load_analysis_job_extraction_input']['Returns']
    | null;
  readonly error: PostgrestError | null;
}
type CompleteJobArgs =
  Database['public']['Functions']['complete_analysis_job_success']['Args'];
type CompleteDecisionJobArgs =
  Database['public']['Functions']['complete_decision_forensics_job_success']['Args'];
type FailJobArgs =
  Database['public']['Functions']['complete_analysis_job_failure']['Args'];
type FailJobRow =
  Database['public']['Functions']['complete_analysis_job_failure']['Returns'][number];

export interface SupabaseAnalysisRunResult {
  readonly data: AnalysisRunRow[] | null;
  readonly error: PostgrestError | null;
}

export interface SupabaseAnalysisRunProjectionResult {
  readonly data: GetRow[] | null;
  readonly error: PostgrestError | null;
}

export interface SupabaseAnalysisDecisionReviewResult {
  readonly data:
    | Database['public']['Functions']['review_analysis_decision_candidate']['Returns']
    | null;
  readonly error: PostgrestError | null;
}

export interface SupabaseAnalysisOutboxResult {
  readonly data: AnalysisOutboxRow[] | null;
  readonly error: PostgrestError | null;
}

export interface SupabaseAnalysisJobResult {
  readonly data: AnalysisJobRow[] | null;
  readonly error: PostgrestError | null;
}

export interface SupabaseAnalysisJobAcquisitionResult {
  readonly data: AcquireJobRow[] | null;
  readonly error: PostgrestError | null;
}

export interface SupabaseAnalysisJobSourcesResult {
  readonly data: LoadSourceRow[] | null;
  readonly error: PostgrestError | null;
}

export interface SupabaseAnalysisJobFailureResult {
  readonly data: FailJobRow[] | null;
  readonly error: PostgrestError | null;
}

export interface SupabaseAnalysisWorkerReadyResult {
  readonly data: boolean | null;
  readonly error: PostgrestError | null;
}

/** Focused RPC projection used by the privileged Analysis Run adapter. */
export interface SupabaseAnalysisClient {
  readonly pinJobExecutionManifest: (
    args: PinManifestArgs
  ) => PromiseLike<SupabaseAnalysisExecutionManifestResult>;
  readonly start: (args: StartArgs) => PromiseLike<SupabaseAnalysisRunResult>;
  readonly get: (
    args: GetArgs
  ) => PromiseLike<SupabaseAnalysisRunProjectionResult>;
  readonly reviewDecisionCandidate: (
    args: ReviewCandidateArgs
  ) => PromiseLike<SupabaseAnalysisDecisionReviewResult>;
  readonly claimNextOutboxEvent: (
    args: ClaimOutboxArgs
  ) => PromiseLike<SupabaseAnalysisOutboxResult>;
  readonly dispatchOutboxEvent: (
    args: DispatchOutboxArgs
  ) => PromiseLike<SupabaseAnalysisJobResult>;
  readonly checkWorkerReady: () => PromiseLike<SupabaseAnalysisWorkerReadyResult>;
  readonly acquireNextJob: (
    args: AcquireJobArgs
  ) => PromiseLike<SupabaseAnalysisJobAcquisitionResult>;
  readonly loadJobSources: (
    args: LoadSourcesArgs
  ) => PromiseLike<SupabaseAnalysisJobSourcesResult>;
  readonly loadJobExtractionInput: (
    args: LoadExtractionInputArgs
  ) => PromiseLike<SupabaseAnalysisJobExtractionInputResult>;
  readonly completeJobSuccess: (
    args: CompleteJobArgs
  ) => PromiseLike<SupabaseAnalysisJobResult>;
  readonly completeDecisionJobSuccess: (
    args: CompleteDecisionJobArgs
  ) => PromiseLike<SupabaseAnalysisJobResult>;
  readonly completeJobFailure: (
    args: FailJobArgs
  ) => PromiseLike<SupabaseAnalysisJobFailureResult>;
}

export const SupabaseAnalysisClientTag =
  Context.GenericTag<SupabaseAnalysisClient>(
    '@omoikane/infrastructure/analysis/SupabaseAnalysisClient'
  );

export interface SupabaseAnalysisClientConfig {
  readonly url: string;
  /** Trusted server key; never expose this credential to a browser runtime. */
  readonly secretKey: string;
}

/**
 * Creates the narrowly projected privileged client used only by atomic
 * Analysis Run RPCs. The service-role credential never leaves server runtime
 * composition and is never used to establish caller identity.
 */
export const makeSupabaseAnalysisClient = (
  config: SupabaseAnalysisClientConfig
): SupabaseAnalysisClient => {
  const client = createClient<Database>(config.url, config.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return {
    pinJobExecutionManifest: (args) =>
      client.rpc('pin_analysis_job_execution_manifest', args),
    start: (args) => client.rpc('start_analysis_run', args),
    get: (args) => client.rpc('get_analysis_run', args),
    reviewDecisionCandidate: (args) =>
      client.rpc(
        'review_analysis_decision_candidate',
        args as GeneratedReviewCandidateArgs
      ),
    claimNextOutboxEvent: (args) =>
      client.rpc('claim_analysis_run_outbox_event', args),
    dispatchOutboxEvent: (args) =>
      client.rpc('dispatch_analysis_run_outbox_event', args),
    checkWorkerReady: () => client.rpc('check_analysis_worker_ready'),
    acquireNextJob: (args) => client.rpc('acquire_analysis_job', args),
    loadJobSources: (args) => client.rpc('load_analysis_job_sources', args),
    loadJobExtractionInput: (args) =>
      client.rpc('load_analysis_job_extraction_input', args),
    completeJobSuccess: (args) =>
      client.rpc('complete_analysis_job_success', args),
    completeDecisionJobSuccess: (args) =>
      client.rpc('complete_decision_forensics_job_success', args),
    completeJobFailure: (args) =>
      client.rpc('complete_analysis_job_failure', args),
  };
};

export const makeSupabaseAnalysisClientLayer = (
  config: SupabaseAnalysisClientConfig
): Layer.Layer<SupabaseAnalysisClient> =>
  Layer.succeed(SupabaseAnalysisClientTag, makeSupabaseAnalysisClient(config));
