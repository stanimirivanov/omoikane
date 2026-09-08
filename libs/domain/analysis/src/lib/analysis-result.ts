import { Schema } from 'effect';
import { AnalysisRunIdSchema } from './analysis-run-id';
import { AnalysisResultSourceSchema } from './analysis-result-source';
import { DecisionCandidateSchema } from './decision-candidate';

// prettier-ignore
export const AnalysisResultIdSchema = Schema.UUID.pipe(
  Schema.brand('AnalysisResultId')
);

export const AnalysisDecisionCandidateIdSchema = Schema.UUID.pipe(
  Schema.brand('AnalysisDecisionCandidateId')
);

export const AnalysisFindingSchema = Schema.Struct({
  kind: Schema.Literal('workspace-message-inventory'),
  status: Schema.Literal('proposed'),
  title: Schema.String.pipe(Schema.nonEmptyString(), Schema.maxLength(120)),
  summary: Schema.String.pipe(Schema.nonEmptyString(), Schema.maxLength(500)),
  confidence: Schema.Number.pipe(Schema.between(0, 1)),
});

const resultSourceInvariant = <
  A extends {
    readonly sourceCount: number;
    readonly sourceTruncated: boolean;
    readonly sources: ReadonlyArray<{ readonly messageRevisionId: string }>;
  },
>(
  result: A
): boolean =>
  result.sourceCount === result.sources.length &&
  (!result.sourceTruncated || result.sourceCount === 100) &&
  new Set(result.sources.map((source) => source.messageRevisionId)).size ===
    result.sources.length;

/** Immutable output of the bounded deterministic workspace inventory. */
export const WorkspaceMessageInventoryResultSchema = Schema.Struct({
  id: AnalysisResultIdSchema,
  analysisRunId: AnalysisRunIdSchema,
  kind: Schema.Literal('workspace-message-inventory'),
  processorVersion: Schema.String.pipe(
    Schema.nonEmptyString(),
    Schema.maxLength(128)
  ),
  providerKind: Schema.Literal('deterministic'),
  model: Schema.Null,
  evaluationVersion: Schema.Literal('workspace-message-inventory.v1'),
  sourceCount: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  sourceTruncated: Schema.Boolean,
  sources: Schema.Array(AnalysisResultSourceSchema),
  finding: AnalysisFindingSchema,
  createdAt: Schema.DateFromSelf,
}).pipe(
  Schema.filter(resultSourceInvariant, {
    message: () => 'Analysis result source metadata is inconsistent.',
  })
);

export const AnalysisDecisionCandidateSchema = Schema.Struct({
  id: AnalysisDecisionCandidateIdSchema,
  status: Schema.Literal('proposed'),
  ...DecisionCandidateSchema.fields,
});

/** Immutable, reproducible model output awaiting a separate human review fact. */
export const DecisionForensicsResultSchema = Schema.Struct({
  id: AnalysisResultIdSchema,
  analysisRunId: AnalysisRunIdSchema,
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
  sources: Schema.Array(AnalysisResultSourceSchema).pipe(Schema.maxItems(100)),
  summary: Schema.String.pipe(Schema.nonEmptyString(), Schema.maxLength(500)),
  candidates: Schema.Array(AnalysisDecisionCandidateSchema).pipe(
    Schema.maxItems(20)
  ),
  createdAt: Schema.DateFromSelf,
}).pipe(
  Schema.filter(resultSourceInvariant, {
    message: () => 'Decision result source metadata is inconsistent.',
  })
);

export const AnalysisResultSchema = Schema.Union(
  WorkspaceMessageInventoryResultSchema,
  DecisionForensicsResultSchema
);

export type AnalysisResultId = typeof AnalysisResultIdSchema.Type;
export type AnalysisDecisionCandidateId =
  typeof AnalysisDecisionCandidateIdSchema.Type;
export type AnalysisFinding = typeof AnalysisFindingSchema.Type;
export type AnalysisDecisionCandidate =
  typeof AnalysisDecisionCandidateSchema.Type;
export type WorkspaceMessageInventoryResult =
  typeof WorkspaceMessageInventoryResultSchema.Type;
export type DecisionForensicsResult = typeof DecisionForensicsResultSchema.Type;
export type AnalysisResult = typeof AnalysisResultSchema.Type;
