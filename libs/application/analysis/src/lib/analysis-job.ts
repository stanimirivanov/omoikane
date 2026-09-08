import { Schema } from 'effect';
import {
  AnalysisFindingSchema,
  AnalysisResultSourceSchema,
  AnalysisRunIdSchema,
  DecisionCandidateSchema,
} from '@omoikane/domain/analysis';
import { ProfileIdSchema } from '@omoikane/domain/profile';
import { WorkspaceIdSchema } from '@omoikane/domain/workspace';

/** Runtime-validated UUID carrying durable Analysis job identity semantics. */
// prettier-ignore
export const AnalysisJobIdSchema = Schema.UUID.pipe(
  Schema.brand('AnalysisJobId')
);

/** Runtime-validated identity for an Analysis Run outbox event. */
// prettier-ignore
export const AnalysisRunOutboxEventIdSchema = Schema.UUID.pipe(
  Schema.brand('AnalysisRunOutboxEventId')
);

/** Opaque database fencing token; equality is meaningful only to PostgreSQL. */
// prettier-ignore
export const AnalysisRunOutboxClaimTokenSchema = Schema.UUID.pipe(
  Schema.brand('AnalysisRunOutboxClaimToken')
);

/** Runtime-validated identity for one auditable Analysis job attempt. */
// prettier-ignore
export const AnalysisJobAttemptIdSchema = Schema.UUID.pipe(
  Schema.brand('AnalysisJobAttemptId')
);

/** Opaque fencing token owned by the current Analysis job lease. */
// prettier-ignore
export const AnalysisJobLeaseTokenSchema = Schema.UUID.pipe(
  Schema.brand('AnalysisJobLeaseToken')
);

export const AnalysisRunOutboxClaimSchema = Schema.Struct({
  eventId: AnalysisRunOutboxEventIdSchema,
  claimToken: AnalysisRunOutboxClaimTokenSchema,
  traceContext: Schema.Struct({
    traceparent: Schema.String,
    tracestate: Schema.NullOr(Schema.String),
  }),
});

export const AnalysisJobSchema = Schema.Struct({
  id: AnalysisJobIdSchema,
  analysisRunId: AnalysisRunIdSchema,
  workspaceId: WorkspaceIdSchema,
  kind: Schema.Literal('analysis.execute'),
  version: Schema.Literal(1),
  availableAt: Schema.DateFromSelf,
});

export const AnalysisJobExecutionSchema = Schema.Struct({
  jobId: AnalysisJobIdSchema,
  attemptId: AnalysisJobAttemptIdSchema,
  analysisRunId: AnalysisRunIdSchema,
  workspaceId: WorkspaceIdSchema,
  kind: Schema.Literal('analysis.execute'),
  version: Schema.Literal(1),
  attemptNumber: Schema.Number.pipe(Schema.int(), Schema.between(1, 5)),
  leaseToken: AnalysisJobLeaseTokenSchema,
  leaseExpiresAt: Schema.DateFromSelf,
  processorVersion: Schema.String.pipe(
    Schema.nonEmptyString(),
    Schema.maxLength(128)
  ),
  traceContext: Schema.Struct({
    traceparent: Schema.String,
    tracestate: Schema.NullOr(Schema.String),
  }),
});

const WorkspaceMessageInventoryReceiptSchema = Schema.Struct({
  processorVersion: Schema.String.pipe(
    Schema.nonEmptyString(),
    Schema.maxLength(128)
  ),
  resultFingerprint: Schema.String.pipe(
    Schema.nonEmptyString(),
    Schema.maxLength(256)
  ),
  result: Schema.Struct({
    kind: Schema.Literal('workspace-message-inventory'),
    processorVersion: Schema.String.pipe(
      Schema.nonEmptyString(),
      Schema.maxLength(128)
    ),
    providerKind: Schema.Literal('deterministic'),
    model: Schema.Null,
    evaluationVersion: Schema.Literal('workspace-message-inventory.v1'),
    sourceCount: Schema.Number.pipe(Schema.int(), Schema.between(0, 100)),
    sourceTruncated: Schema.Boolean,
    sources: Schema.Array(AnalysisResultSourceSchema),
    finding: AnalysisFindingSchema,
    summary: Schema.String.pipe(Schema.nonEmptyString(), Schema.maxLength(500)),
  }),
});

const DecisionForensicsReceiptSchema = Schema.Struct({
  processorVersion: Schema.Literal('analysis.decision-forensics.v1'),
  resultFingerprint: Schema.String.pipe(
    Schema.nonEmptyString(),
    Schema.maxLength(256)
  ),
  result: Schema.Struct({
    kind: Schema.Literal('decision-forensics'),
    processorVersion: Schema.Literal('analysis.decision-forensics.v1'),
    providerKind: Schema.Literal('ollama'),
    model: Schema.String.pipe(Schema.nonEmptyString(), Schema.maxLength(128)),
    resultSchemaVersion: Schema.Literal('decision-forensics.result.v1'),
    promptVersion: Schema.Literal('decision-forensics.extract.v1'),
    promptDigest: Schema.String.pipe(Schema.pattern(/^[0-9a-f]{64}$/u)),
    evaluationVersion: Schema.Literal('decision-forensics.evaluation.v1'),
    generationPolicy: Schema.Struct({
      temperature: Schema.Literal(0),
      maxOutputTokens: Schema.Literal(8192),
      tools: Schema.Literal(false),
      repairAttempts: Schema.Literal(0),
    }),
    usage: Schema.Struct({
      inputUnits: Schema.NullOr(
        Schema.Number.pipe(Schema.int(), Schema.nonNegative())
      ),
      outputUnits: Schema.NullOr(
        Schema.Number.pipe(Schema.int(), Schema.nonNegative())
      ),
    }),
    sourceCount: Schema.Number.pipe(Schema.int(), Schema.between(0, 100)),
    sourceTruncated: Schema.Boolean,
    sources: Schema.Array(AnalysisResultSourceSchema).pipe(
      Schema.maxItems(100)
    ),
    summary: Schema.String.pipe(Schema.nonEmptyString(), Schema.maxLength(500)),
    candidates: Schema.Array(DecisionCandidateSchema).pipe(Schema.maxItems(20)),
  }).pipe(
    Schema.filter(
      (result) =>
        result.sourceCount === result.sources.length &&
        (!result.sourceTruncated || result.sourceCount === 100) &&
        new Set(result.sources.map((source) => source.messageRevisionId))
          .size === result.sources.length,
      {
        message: () =>
          'Decision result source metadata does not match its unique sources.',
      }
    )
  ),
});

/** Completion payloads supported by the deterministic and Decision Forensics processors. */
export const AnalysisProcessorReceiptSchema = Schema.Union(
  WorkspaceMessageInventoryReceiptSchema,
  DecisionForensicsReceiptSchema
);

export const AnalysisJobSourceSchema = Schema.Struct({
  messageId: AnalysisResultSourceSchema.fields.messageId,
  messageRevisionId: AnalysisResultSourceSchema.fields.messageRevisionId,
  authorUserId: ProfileIdSchema,
});

/**
 * Retry-stable evidence identities selected for one Analysis Run.
 *
 * The snapshot contains at most 100 unique messages and revisions. Truncation
 * is possible only when the full 100-source boundary was persisted.
 */
export const AnalysisJobSourceSnapshotSchema = Schema.Struct({
  sources: Schema.Array(AnalysisJobSourceSchema).pipe(Schema.maxItems(100)),
  sourceTruncated: Schema.Boolean,
}).pipe(
  Schema.filter(
    (snapshot) => !snapshot.sourceTruncated || snapshot.sources.length === 100,
    {
      message: () =>
        'A truncated Analysis source snapshot must contain 100 sources.',
    }
  ),
  Schema.filter(
    (snapshot) =>
      new Set(snapshot.sources.map((source) => source.messageId)).size ===
        snapshot.sources.length &&
      new Set(snapshot.sources.map((source) => source.messageRevisionId))
        .size === snapshot.sources.length,
    {
      message: () =>
        'An Analysis source snapshot cannot contain duplicate sources.',
    }
  )
);

export const AnalysisFailureCategorySchema = Schema.String.pipe(
  Schema.pattern(/^[a-z0-9._-]{1,64}$/u)
);

export const AnalysisJobFailureCompletionSchema = Schema.Struct({
  jobId: AnalysisJobIdSchema,
  analysisRunId: AnalysisRunIdSchema,
  attemptNumber: Schema.Number.pipe(Schema.int(), Schema.between(1, 5)),
  outcome: Schema.Literal('retry_scheduled', 'dead_lettered'),
  failureCategory: AnalysisFailureCategorySchema,
  nextAvailableAt: Schema.NullOr(Schema.DateFromSelf),
});

export type AnalysisJob = typeof AnalysisJobSchema.Type;
export type AnalysisRunOutboxClaim = typeof AnalysisRunOutboxClaimSchema.Type;
export type AnalysisJobExecution = typeof AnalysisJobExecutionSchema.Type;
export type AnalysisProcessorReceipt =
  typeof AnalysisProcessorReceiptSchema.Type;
export type WorkspaceMessageInventoryProcessorReceipt =
  typeof WorkspaceMessageInventoryReceiptSchema.Type;
export type DecisionForensicsProcessorReceipt =
  typeof DecisionForensicsReceiptSchema.Type;
export type AnalysisJobSource = typeof AnalysisJobSourceSchema.Type;
export type AnalysisJobSourceSnapshot =
  typeof AnalysisJobSourceSnapshotSchema.Type;
export type AnalysisFailureCategory = typeof AnalysisFailureCategorySchema.Type;
export type AnalysisJobFailureCompletion =
  typeof AnalysisJobFailureCompletionSchema.Type;
