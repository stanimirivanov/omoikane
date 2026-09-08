import { Data, Effect, Option } from 'effect';
import type {
  AnalysisFailureCategory,
  AnalysisJob,
  AnalysisJobExecution,
  AnalysisJobFailureCompletion,
  AnalysisJobSourceSnapshot,
  AnalysisProcessorReceipt,
  WorkspaceMessageInventoryProcessorReceipt,
  DecisionForensicsProcessorReceipt,
} from './analysis-job';
import type { AnalysisJobExecutionRepositoryError } from './analysis-run-error';
import {
  AnalysisRunRepositoryTag,
  type AnalysisRunRepository,
} from './analysis-run-repository';
import {
  DECISION_EXTRACTION_PROMPT_DIGEST,
  extractDecisions,
} from './extract-decisions';
import { prepareAnalysisJobExtraction } from './prepare-analysis-job-extraction';
import {
  pinAnalysisJobExecutionManifest,
  type AnalysisExecutionManifestError,
} from './analysis-execution-manifest';
import type {
  DecisionExtractionError,
  DecisionExtractionInput,
  DecisionExtractionResponse,
  DecisionExtractor,
} from './decision-extraction';

export const WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION =
  'analysis.workspace-message-inventory.v1';
export const DECISION_FORENSICS_PROCESSOR_VERSION =
  'analysis.decision-forensics.v1';

export type SupportedAnalysisProcessorVersion =
  | typeof WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION
  | typeof DECISION_FORENSICS_PROCESSOR_VERSION;

export class RetryableAnalysisProcessorError extends Data.TaggedError(
  'RetryableAnalysisProcessorError'
)<{ readonly category: AnalysisFailureCategory }> {}

export class TerminalAnalysisProcessorError extends Data.TaggedError(
  'TerminalAnalysisProcessorError'
)<{ readonly category: AnalysisFailureCategory }> {}

export type AnalysisProcessorError =
  | RetryableAnalysisProcessorError
  | TerminalAnalysisProcessorError;

export type AnalysisJobProcessor = (
  execution: AnalysisJobExecution
) => Effect.Effect<
  AnalysisProcessorReceipt,
  AnalysisProcessorError,
  AnalysisRunRepository
>;

export interface AcquireNextAnalysisJobInput {
  readonly workerId: string;
  readonly leaseSeconds: number;
  readonly processorVersion: SupportedAnalysisProcessorVersion;
}

/** Acquires at most one job; absence is ordinary idle-loop behavior. */
export const acquireNextAnalysisJob = (
  input: AcquireNextAnalysisJobInput
): Effect.Effect<
  Option.Option<AnalysisJobExecution>,
  AnalysisJobExecutionRepositoryError,
  AnalysisRunRepository
> =>
  Effect.flatMap(AnalysisRunRepositoryTag, (repository) =>
    repository.acquireNextJob({
      workerId: input.workerId,
      processorVersion: input.processorVersion,
      leaseSeconds: input.leaseSeconds,
    })
  );

const mapManifestFailure = (
  error: AnalysisExecutionManifestError
): AnalysisProcessorError => {
  switch (error._tag) {
    case 'AnalysisRunRepositoryUnavailableError':
      return new RetryableAnalysisProcessorError({
        category: 'manifest.unavailable',
      });
    case 'AnalysisSourceAccessRevokedError':
      return new TerminalAnalysisProcessorError({
        category: 'authorization.revoked',
      });
    case 'AnalysisJobLeaseLostError':
      return new TerminalAnalysisProcessorError({ category: 'lease.lost' });
    case 'InvalidAnalysisRunDataError':
      return new TerminalAnalysisProcessorError({
        category: 'manifest.invalid',
      });
    case 'UnsupportedDecisionExtractionConfigurationError':
      return new TerminalAnalysisProcessorError({
        category: 'configuration.unsupported',
      });
  }
};

const mapSourceFailure = (
  error: AnalysisJobExecutionRepositoryError
): AnalysisProcessorError => {
  switch (error._tag) {
    case 'AnalysisRunRepositoryUnavailableError':
      return new RetryableAnalysisProcessorError({
        category: 'source.unavailable',
      });
    case 'AnalysisSourceAccessRevokedError':
      return new TerminalAnalysisProcessorError({
        category: 'authorization.revoked',
      });
    case 'AnalysisJobLeaseLostError':
      return new TerminalAnalysisProcessorError({ category: 'lease.lost' });
    case 'InvalidAnalysisRunDataError':
      return new TerminalAnalysisProcessorError({ category: 'source.invalid' });
  }
};

const mapExtractionFailure = (
  error: DecisionExtractionError
): AnalysisProcessorError => {
  switch (error._tag) {
    case 'DecisionExtractionUnavailableError':
      return new RetryableAnalysisProcessorError({
        category:
          error.reason === 'rate-limited'
            ? 'provider.rate-limited'
            : error.reason === 'timeout'
              ? 'provider.timeout'
              : 'provider.unavailable',
      });
    case 'InvalidDecisionExtractionOutputError':
      return new TerminalAnalysisProcessorError({
        category: 'provider.invalid-output',
      });
    case 'DecisionExtractionLimitError':
      return new TerminalAnalysisProcessorError({
        category: `provider.${error.reason}-limit`,
      });
    case 'UnsupportedDecisionExtractionConfigurationError':
      return new TerminalAnalysisProcessorError({
        category: 'configuration.unsupported',
      });
  }
};

const buildDecisionResult = (
  input: DecisionExtractionInput,
  response: DecisionExtractionResponse
): DecisionForensicsProcessorReceipt['result'] => {
  const candidateCount = response.output.candidates.length;
  return {
    kind: 'decision-forensics',
    processorVersion: DECISION_FORENSICS_PROCESSOR_VERSION,
    providerKind: 'ollama',
    model: response.model,
    resultSchemaVersion: 'decision-forensics.result.v1',
    promptVersion: 'decision-forensics.extract.v1',
    promptDigest: DECISION_EXTRACTION_PROMPT_DIGEST,
    evaluationVersion: 'decision-forensics.evaluation.v1',
    generationPolicy: {
      temperature: 0,
      maxOutputTokens: 8192,
      tools: false,
      repairAttempts: 0,
    },
    usage: { ...response.usage },
    sourceCount: input.sources.length,
    sourceTruncated: input.sourceTruncated,
    sources: input.sources.map(({ messageId, messageRevisionId }) => ({
      messageId,
      messageRevisionId,
    })),
    summary: `Extracted ${candidateCount} proposed decision candidate${candidateCount === 1 ? '' : 's'}.`,
    candidates: response.output.candidates,
  };
};

export interface ProcessDecisionForensicsJobInput {
  readonly execution: AnalysisJobExecution;
  readonly provider: {
    readonly providerKind: 'ollama';
    readonly model: string;
  };
  /** Returns lowercase SHA-256 for the supplied canonical result JSON. */
  readonly fingerprint: (canonicalResult: string) => string;
}

/**
 * Pins the provider contract, loads authorized frozen content, extracts and
 * validates candidates, and returns the complete atomic persistence receipt.
 * The outer runtime supplies SHA-256 without leaking a Node dependency inward.
 */
export const processDecisionForensicsJob = ({
  execution,
  provider,
  fingerprint,
}: ProcessDecisionForensicsJobInput): Effect.Effect<
  DecisionForensicsProcessorReceipt,
  AnalysisProcessorError,
  AnalysisRunRepository | DecisionExtractor
> =>
  Effect.gen(function* () {
    const manifest = yield* pinAnalysisJobExecutionManifest(
      execution,
      provider
    ).pipe(Effect.mapError(mapManifestFailure));
    const input = yield* prepareAnalysisJobExtraction(execution).pipe(
      Effect.mapError(mapSourceFailure)
    );
    const response = yield* extractDecisions(input).pipe(
      Effect.mapError(mapExtractionFailure)
    );
    if (
      response.providerKind !== manifest.configuration.providerKind ||
      response.model !== manifest.configuration.model
    ) {
      return yield* new TerminalAnalysisProcessorError({
        category: 'configuration.unsupported',
      });
    }
    const result = buildDecisionResult(input, response);
    return {
      processorVersion: DECISION_FORENSICS_PROCESSOR_VERSION,
      resultFingerprint: fingerprint(JSON.stringify(result)),
      result,
    };
  });

const fingerprintSources = (
  execution: AnalysisJobExecution,
  snapshot: AnalysisJobSourceSnapshot
): string => {
  let hash = 0x811c9dc5;
  for (const source of snapshot.sources) {
    for (const character of source.messageRevisionId) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return [
    WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
    execution.analysisRunId,
    snapshot.sources.length,
    snapshot.sourceTruncated ? 'truncated' : 'complete',
    (hash >>> 0).toString(16).padStart(8, '0'),
  ].join('/');
};

/** Builds the bounded inventory for the channel authorized by the run. */
export const buildWorkspaceMessageInventory = (
  execution: AnalysisJobExecution,
  snapshot: AnalysisJobSourceSnapshot
): WorkspaceMessageInventoryProcessorReceipt => {
  const sources = snapshot.sources;
  const participantCount = new Set(sources.map((source) => source.authorUserId))
    .size;
  const summary = `Analyzed ${sources.length} active message${sources.length === 1 ? '' : 's'} from ${participantCount} participant${participantCount === 1 ? '' : 's'}.`;

  return {
    processorVersion: WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
    resultFingerprint: fingerprintSources(execution, snapshot),
    result: {
      kind: 'workspace-message-inventory',
      processorVersion: WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
      providerKind: 'deterministic',
      model: null,
      evaluationVersion: 'workspace-message-inventory.v1',
      sourceCount: sources.length,
      sourceTruncated: snapshot.sourceTruncated,
      sources: sources.map(({ messageId, messageRevisionId }) => ({
        messageId,
        messageRevisionId,
      })),
      summary,
      finding: {
        kind: 'workspace-message-inventory',
        status: 'proposed',
        title: 'Channel message inventory',
        summary,
        confidence: 1,
      },
    },
  };
};

/** Loads authorized immutable sources and produces the deterministic inventory. */
export const processAnalysisJob = (
  execution: AnalysisJobExecution
): Effect.Effect<
  AnalysisProcessorReceipt,
  AnalysisProcessorError,
  AnalysisRunRepository
> =>
  Effect.flatMap(AnalysisRunRepositoryTag, (repository) =>
    repository.loadJobSources({ execution })
  ).pipe(
    Effect.map((snapshot) =>
      buildWorkspaceMessageInventory(execution, snapshot)
    ),
    Effect.mapError(
      (error): AnalysisProcessorError =>
        error._tag === 'AnalysisSourceAccessRevokedError'
          ? new TerminalAnalysisProcessorError({
              category: 'authorization.revoked',
            })
          : new RetryableAnalysisProcessorError({
              category: 'source.unavailable',
            })
    )
  );

export interface CompleteAnalysisJobSuccessInput {
  readonly execution: AnalysisJobExecution;
  readonly receipt: AnalysisProcessorReceipt;
  readonly durationMilliseconds: number;
}

/** Commits deterministic success only while the execution still owns its lease. */
export const completeAnalysisJobSuccess = (
  input: CompleteAnalysisJobSuccessInput
): Effect.Effect<
  AnalysisJob,
  AnalysisJobExecutionRepositoryError,
  AnalysisRunRepository
> =>
  Effect.flatMap(AnalysisRunRepositoryTag, (repository) =>
    repository.completeJobSuccess({
      execution: input.execution,
      resultFingerprint: input.receipt.resultFingerprint,
      result: input.receipt.result,
      durationMilliseconds: input.durationMilliseconds,
    })
  );

export interface CompleteAnalysisJobFailureInput {
  readonly execution: AnalysisJobExecution;
  readonly failureCategory: AnalysisFailureCategory;
  readonly retryable: boolean;
  readonly durationMilliseconds: number;
}

/** Commits one classified processor failure while its lease remains current. */
export const completeAnalysisJobFailure = (
  input: CompleteAnalysisJobFailureInput
): Effect.Effect<
  AnalysisJobFailureCompletion,
  AnalysisJobExecutionRepositoryError,
  AnalysisRunRepository
> =>
  Effect.flatMap(AnalysisRunRepositoryTag, (repository) =>
    repository.completeJobFailure({
      execution: input.execution,
      failureCategory: input.failureCategory,
      retryable: input.retryable,
      durationMilliseconds: input.durationMilliseconds,
    })
  );

/** Non-mutating database readiness proof for the worker runtime. */
export const checkAnalysisWorkerReady: Effect.Effect<
  boolean,
  AnalysisJobExecutionRepositoryError,
  AnalysisRunRepository
> = Effect.flatMap(AnalysisRunRepositoryTag, (repository) =>
  repository.checkWorkerReady()
);
