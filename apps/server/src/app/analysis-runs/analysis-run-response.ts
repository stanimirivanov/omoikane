import { ApiProperty } from '@nestjs/swagger';
import type {
  AnalysisFinding,
  AnalysisResult,
  AnalysisResultSource,
  AnalysisRun,
  AnalysisRunStatus,
} from '@omoikane/domain/analysis';

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

class AnalysisResultResponse {
  @ApiProperty({ format: 'uuid' }) readonly id: string;
  @ApiProperty({ format: 'uuid' }) readonly analysisRunId: string;
  @ApiProperty({ enum: ['workspace-message-inventory'] })
  readonly kind: AnalysisResult['kind'];
  @ApiProperty() readonly processorVersion: string;
  @ApiProperty({ enum: ['deterministic'] })
  readonly providerKind: AnalysisResult['providerKind'];
  @ApiProperty({ nullable: true, type: String }) readonly model: null;
  @ApiProperty({ enum: ['workspace-message-inventory.v1'] })
  readonly evaluationVersion: AnalysisResult['evaluationVersion'];
  @ApiProperty({ minimum: 0, maximum: 100 }) readonly sourceCount: number;
  @ApiProperty() readonly sourceTruncated: boolean;
  @ApiProperty({ type: () => [AnalysisResultSourceResponse] })
  readonly sources: ReadonlyArray<AnalysisResultSourceResponse>;
  @ApiProperty({ type: () => AnalysisFindingResponse })
  readonly finding: AnalysisFindingResponse;
  @ApiProperty({ format: 'date-time' }) readonly createdAt: string;

  constructor(result: AnalysisResult) {
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

/** HTTP serialization of the supported deterministic Analysis Run state. */
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
  @ApiProperty({ nullable: true, type: () => AnalysisResultResponse })
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
    this.result =
      run.result === null ? null : new AnalysisResultResponse(run.result);
    this.createdAt = run.createdAt.toISOString();
  }
}
