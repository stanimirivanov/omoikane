import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import type {
  AnalysisDecisionCandidate,
  AnalysisFinding,
  AnalysisResultSource,
  AnalysisRun,
  AnalysisRunStatus,
  DecisionForensicsResult,
  WorkspaceMessageInventoryResult,
} from '@omoikane/domain/analysis';

type DecisionAssertion = AnalysisDecisionCandidate['claims'][number];
type DecisionParticipant = AnalysisDecisionCandidate['participants'][number];

class AnalysisTimeRangeResponse {
  @ApiProperty({ format: 'date-time' }) readonly start: string;
  @ApiProperty({ format: 'date-time' }) readonly end: string;

  constructor(timeRange: NonNullable<AnalysisRun['timeRange']>) {
    this.start = timeRange.start.toISOString();
    this.end = timeRange.end.toISOString();
  }
}

class AnalysisResultSourceResponse {
  @ApiProperty({ format: 'uuid' }) readonly messageId: string;
  @ApiProperty({ format: 'uuid' }) readonly messageRevisionId: string;

  constructor(source: AnalysisResultSource) {
    this.messageId = source.messageId;
    this.messageRevisionId = source.messageRevisionId;
  }
}

class AnalysisFindingResponse {
  @ApiProperty({ enum: ['workspace-message-inventory'] })
  readonly kind: AnalysisFinding['kind'];
  @ApiProperty({ enum: ['proposed'] }) readonly status: 'proposed';
  @ApiProperty() readonly title: string;
  @ApiProperty() readonly summary: string;
  @ApiProperty({ minimum: 0, maximum: 1 }) readonly confidence: number;

  constructor(finding: AnalysisFinding) {
    this.kind = finding.kind;
    this.status = finding.status;
    this.title = finding.title;
    this.summary = finding.summary;
    this.confidence = finding.confidence;
  }
}

class WorkspaceMessageInventoryResultResponse {
  @ApiProperty({ format: 'uuid' }) readonly id: string;
  @ApiProperty({ format: 'uuid' }) readonly analysisRunId: string;
  @ApiProperty({ enum: ['workspace-message-inventory'] })
  readonly kind: 'workspace-message-inventory';
  @ApiProperty() readonly processorVersion: string;
  @ApiProperty({ enum: ['deterministic'] })
  readonly providerKind: 'deterministic';
  @ApiProperty({ nullable: true, type: String }) readonly model: null;
  @ApiProperty({ enum: ['workspace-message-inventory.v1'] })
  readonly evaluationVersion: 'workspace-message-inventory.v1';
  @ApiProperty({ minimum: 0, maximum: 100 }) readonly sourceCount: number;
  @ApiProperty() readonly sourceTruncated: boolean;
  @ApiProperty({ type: () => [AnalysisResultSourceResponse] })
  readonly sources: ReadonlyArray<AnalysisResultSourceResponse>;
  @ApiProperty({ type: () => AnalysisFindingResponse })
  readonly finding: AnalysisFindingResponse;
  @ApiProperty({ format: 'date-time' }) readonly createdAt: string;

  constructor(result: WorkspaceMessageInventoryResult) {
    this.id = result.id;
    this.analysisRunId = result.analysisRunId;
    this.kind = result.kind;
    this.processorVersion = result.processorVersion;
    this.providerKind = result.providerKind;
    this.model = result.model;
    this.evaluationVersion = result.evaluationVersion;
    this.sourceCount = result.sourceCount;
    this.sourceTruncated = result.sourceTruncated;
    this.sources = result.sources.map(
      (source) => new AnalysisResultSourceResponse(source)
    );
    this.finding = new AnalysisFindingResponse(result.finding);
    this.createdAt = result.createdAt.toISOString();
  }
}

class DecisionAssertionResponse {
  @ApiProperty() readonly text: string;
  @ApiProperty({ type: () => [AnalysisResultSourceResponse] })
  readonly evidence: ReadonlyArray<AnalysisResultSourceResponse>;

  constructor(assertion: DecisionAssertion) {
    this.text = assertion.text;
    this.evidence = assertion.evidence.map(
      (source) => new AnalysisResultSourceResponse(source)
    );
  }
}

class DecisionParticipantResponse {
  @ApiProperty({ format: 'uuid' }) readonly profileId: string;
  @ApiProperty({ enum: ['proposer', 'decision-maker', 'contributor'] })
  readonly role: DecisionParticipant['role'];
  @ApiProperty({ type: () => [AnalysisResultSourceResponse] })
  readonly evidence: ReadonlyArray<AnalysisResultSourceResponse>;

  constructor(participant: DecisionParticipant) {
    this.profileId = participant.profileId;
    this.role = participant.role;
    this.evidence = participant.evidence.map(
      (source) => new AnalysisResultSourceResponse(source)
    );
  }
}

class AnalysisDecisionCandidateResponse {
  @ApiProperty({ format: 'uuid' }) readonly id: string;
  @ApiProperty({ enum: ['proposed'] }) readonly status: 'proposed';
  @ApiProperty() readonly title: string;
  @ApiProperty() readonly summary: string;
  @ApiProperty({ enum: ['made', 'deferred', 'changed', 'rejected'] })
  readonly disposition: AnalysisDecisionCandidate['disposition'];
  @ApiProperty({ minimum: 0, maximum: 1 }) readonly confidence: number;
  @ApiProperty({ type: () => [DecisionAssertionResponse] })
  readonly claims: ReadonlyArray<DecisionAssertionResponse>;
  @ApiProperty({ type: () => [DecisionAssertionResponse] })
  readonly assumptions: ReadonlyArray<DecisionAssertionResponse>;
  @ApiProperty({ type: () => [DecisionParticipantResponse] })
  readonly participants: ReadonlyArray<DecisionParticipantResponse>;

  constructor(candidate: AnalysisDecisionCandidate) {
    this.id = candidate.id;
    this.status = candidate.status;
    this.title = candidate.title;
    this.summary = candidate.summary;
    this.disposition = candidate.disposition;
    this.confidence = candidate.confidence;
    this.claims = candidate.claims.map(
      (claim) => new DecisionAssertionResponse(claim)
    );
    this.assumptions = candidate.assumptions.map(
      (assumption) => new DecisionAssertionResponse(assumption)
    );
    this.participants = candidate.participants.map(
      (participant) => new DecisionParticipantResponse(participant)
    );
  }
}

class DecisionUsageResponse {
  @ApiProperty({ nullable: true, minimum: 0, type: Number })
  readonly inputUnits: number | null;
  @ApiProperty({ nullable: true, minimum: 0, type: Number })
  readonly outputUnits: number | null;

  constructor(usage: DecisionForensicsResult['usage']) {
    this.inputUnits = usage.inputUnits;
    this.outputUnits = usage.outputUnits;
  }
}

class DecisionGenerationPolicyResponse {
  @ApiProperty({ enum: [0] }) readonly temperature: 0;
  @ApiProperty({ enum: [8192] }) readonly maxOutputTokens: 8192;
  @ApiProperty({ enum: [false] }) readonly tools: false;
  @ApiProperty({ enum: [0] }) readonly repairAttempts: 0;

  constructor(policy: DecisionForensicsResult['generationPolicy']) {
    this.temperature = policy.temperature;
    this.maxOutputTokens = policy.maxOutputTokens;
    this.tools = policy.tools;
    this.repairAttempts = policy.repairAttempts;
  }
}

class DecisionForensicsResultResponse {
  @ApiProperty({ format: 'uuid' }) readonly id: string;
  @ApiProperty({ format: 'uuid' }) readonly analysisRunId: string;
  @ApiProperty({ enum: ['decision-forensics'] })
  readonly kind: 'decision-forensics';
  @ApiProperty({ enum: ['analysis.decision-forensics.v1'] })
  readonly processorVersion: 'analysis.decision-forensics.v1';
  @ApiProperty({ enum: ['ollama'] }) readonly providerKind: 'ollama';
  @ApiProperty() readonly model: string;
  @ApiProperty({ enum: ['decision-forensics.result.v1'] })
  readonly resultSchemaVersion: 'decision-forensics.result.v1';
  @ApiProperty({ enum: ['decision-forensics.extract.v1'] })
  readonly promptVersion: 'decision-forensics.extract.v1';
  @ApiProperty({ pattern: '^[0-9a-f]{64}$' }) readonly promptDigest: string;
  @ApiProperty({ enum: ['decision-forensics.evaluation.v1'] })
  readonly evaluationVersion: 'decision-forensics.evaluation.v1';
  @ApiProperty({ type: () => DecisionGenerationPolicyResponse })
  readonly generationPolicy: DecisionGenerationPolicyResponse;
  @ApiProperty({ type: () => DecisionUsageResponse })
  readonly usage: DecisionUsageResponse;
  @ApiProperty({ minimum: 0, maximum: 100 }) readonly sourceCount: number;
  @ApiProperty() readonly sourceTruncated: boolean;
  @ApiProperty({ type: () => [AnalysisResultSourceResponse] })
  readonly sources: ReadonlyArray<AnalysisResultSourceResponse>;
  @ApiProperty() readonly summary: string;
  @ApiProperty({ type: () => [AnalysisDecisionCandidateResponse] })
  readonly candidates: ReadonlyArray<AnalysisDecisionCandidateResponse>;
  @ApiProperty({ format: 'date-time' }) readonly createdAt: string;

  constructor(result: DecisionForensicsResult) {
    this.id = result.id;
    this.analysisRunId = result.analysisRunId;
    this.kind = result.kind;
    this.processorVersion = result.processorVersion;
    this.providerKind = result.providerKind;
    this.model = result.model;
    this.resultSchemaVersion = result.resultSchemaVersion;
    this.promptVersion = result.promptVersion;
    this.promptDigest = result.promptDigest;
    this.evaluationVersion = result.evaluationVersion;
    this.generationPolicy = new DecisionGenerationPolicyResponse(
      result.generationPolicy
    );
    this.usage = new DecisionUsageResponse(result.usage);
    this.sourceCount = result.sourceCount;
    this.sourceTruncated = result.sourceTruncated;
    this.sources = result.sources.map(
      (source) => new AnalysisResultSourceResponse(source)
    );
    this.summary = result.summary;
    this.candidates = result.candidates.map(
      (candidate) => new AnalysisDecisionCandidateResponse(candidate)
    );
    this.createdAt = result.createdAt.toISOString();
  }
}

type AnalysisResultResponse =
  | WorkspaceMessageInventoryResultResponse
  | DecisionForensicsResultResponse;

const serializeResult = (
  result: NonNullable<AnalysisRun['result']>
): AnalysisResultResponse =>
  result.kind === 'workspace-message-inventory'
    ? new WorkspaceMessageInventoryResultResponse(result)
    : new DecisionForensicsResultResponse(result);

/** HTTP serialization of an authorized Analysis Run and its immutable result. */
@ApiExtraModels(
  WorkspaceMessageInventoryResultResponse,
  DecisionForensicsResultResponse
)
export class AnalysisRunResponse {
  @ApiProperty({ format: 'uuid' }) readonly id: string;
  @ApiProperty({ format: 'uuid' }) readonly workspaceId: string;
  @ApiProperty({ format: 'uuid', nullable: true })
  readonly channelId: string | null;
  @ApiProperty({ nullable: true, type: () => AnalysisTimeRangeResponse })
  readonly timeRange: AnalysisTimeRangeResponse | null;
  @ApiProperty({ format: 'uuid' }) readonly requestedBy: string;
  @ApiProperty({
    enum: ['created', 'queued', 'running', 'succeeded', 'failed'],
  })
  readonly status: AnalysisRunStatus;
  @ApiProperty({ nullable: true, example: 'provider.timeout' })
  readonly failureCategory: string | null;
  @ApiProperty({
    nullable: true,
    oneOf: [
      { $ref: getSchemaPath(WorkspaceMessageInventoryResultResponse) },
      { $ref: getSchemaPath(DecisionForensicsResultResponse) },
    ],
  })
  readonly result: AnalysisResultResponse | null;
  @ApiProperty({ format: 'date-time' }) readonly createdAt: string;

  constructor(run: AnalysisRun) {
    this.id = run.id;
    this.workspaceId = run.workspaceId;
    this.channelId = run.channelId;
    this.timeRange =
      run.timeRange === null
        ? null
        : new AnalysisTimeRangeResponse(run.timeRange);
    this.requestedBy = run.requestedBy;
    this.status = run.status;
    this.failureCategory = run.failureCategory;
    this.result = run.result === null ? null : serializeResult(run.result);
    this.createdAt = run.createdAt.toISOString();
  }
}
