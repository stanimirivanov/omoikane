import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Either } from 'effect';
import {
  getAnalysisRun,
  reviewAnalysisDecisionCandidate,
  type AnalysisDecisionReviewError,
  startAnalysisRun,
  type AnalysisRunError,
} from '@omoikane/application/analysis';
import {
  getRequestIdentity,
  type RequestWithIdentity,
} from '../platform/authentication/request-identity';
import { ServerEffectRuntime } from '../platform/effect-runtime/server-effect-runtime.service';
import {
  analysisUnavailable,
  invalidRequest,
  invalidServerData,
  resourceNotFound,
  resourceConflict,
} from '../platform/http/http-boundary-error';
import { AnalysisRunResponse } from './analysis-run-response';
import { ServerTelemetry } from '../platform/observability/server-telemetry.service';
import { StartAnalysisRunRequest } from './start-analysis-run-request';
import { ReviewAnalysisDecisionCandidateRequest } from './review-analysis-decision-candidate-request';
import { AnalysisDecisionReviewResponse } from './analysis-decision-review-response';

const requireIdentity = (request: RequestWithIdentity) => {
  const identity = getRequestIdentity(request);
  if (identity === undefined) {
    throw invalidServerData();
  }
  return identity;
};

const failHttp = (error: AnalysisRunError): never => {
  switch (error._tag) {
    case 'InvalidAnalysisRunInputError':
      throw invalidRequest();
    case 'AnalysisRunNotAccessibleError':
      throw resourceNotFound();
    case 'AnalysisRunRepositoryUnavailableError':
      throw analysisUnavailable();
    case 'InvalidAnalysisRunDataError':
      throw invalidServerData();
  }
};

const failReviewHttp = (error: AnalysisDecisionReviewError): never => {
  if (error._tag === 'AnalysisDecisionAlreadyReviewedError') {
    throw resourceConflict();
  }
  return failHttp(error);
};

/** Authenticated HTTP entry point for the trusted Analysis Run workflow. */
@ApiTags('analysis-runs')
@Controller('workspaces/:workspaceId/analysis-runs')
export class AnalysisRunsController {
  constructor(
    private readonly runtime: ServerEffectRuntime,
    private readonly telemetry: ServerTelemetry
  ) {}

  @Post()
  @ApiOperation({ summary: 'Start an Analysis Run' })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiBody({ type: StartAnalysisRunRequest })
  @ApiCreatedResponse({ type: AnalysisRunResponse })
  @ApiBadRequestResponse({ description: 'The workspace ID is malformed.' })
  @ApiNotFoundResponse({ description: 'The workspace is inaccessible.' })
  @ApiServiceUnavailableResponse({ description: 'Persistence is unavailable.' })
  async start(
    @Req() request: RequestWithIdentity,
    @Param('workspaceId') workspaceId: string,
    @Body('channelId') channelId: unknown,
    @Body('timeRange') timeRange: unknown
  ): Promise<AnalysisRunResponse> {
    const traceContext = this.telemetry.processingTraceContext(request);
    if (traceContext === undefined) {
      throw invalidServerData();
    }
    const result = await this.runtime.runRequestEither(
      request,
      'analysis_run.start',
      startAnalysisRun({
        identity: requireIdentity(request),
        workspaceId,
        channelId,
        timeRange,
        traceContext,
      })
    );

    return Either.match(result, {
      onLeft: failHttp,
      onRight: (run) => {
        this.telemetry.annotateAnalysisRun(request, run.workspaceId, run.id);
        return new AnalysisRunResponse(run);
      },
    });
  }

  @Get(':analysisRunId')
  @ApiOperation({ summary: 'Observe an Analysis Run' })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiParam({ name: 'analysisRunId', format: 'uuid' })
  @ApiOkResponse({ type: AnalysisRunResponse })
  @ApiBadRequestResponse({ description: 'A route identifier is malformed.' })
  @ApiNotFoundResponse({ description: 'The Analysis Run is inaccessible.' })
  @ApiServiceUnavailableResponse({ description: 'Persistence is unavailable.' })
  async get(
    @Req() request: RequestWithIdentity,
    @Param('workspaceId') workspaceId: string,
    @Param('analysisRunId') analysisRunId: string
  ): Promise<AnalysisRunResponse> {
    const result = await this.runtime.runRequestEither(
      request,
      'analysis_run.get',
      getAnalysisRun({
        identity: requireIdentity(request),
        workspaceId,
        analysisRunId,
      })
    );

    return Either.match(result, {
      onLeft: failHttp,
      onRight: (run) => {
        this.telemetry.annotateAnalysisRun(request, run.workspaceId, run.id);
        return new AnalysisRunResponse(run);
      },
    });
  }

  @Post(':analysisRunId/candidates/:candidateId/review')
  @ApiOperation({ summary: 'Review a proposed Decision Forensics candidate' })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiParam({ name: 'analysisRunId', format: 'uuid' })
  @ApiParam({ name: 'candidateId', format: 'uuid' })
  @ApiBody({ type: ReviewAnalysisDecisionCandidateRequest })
  @ApiCreatedResponse({ type: AnalysisDecisionReviewResponse })
  @ApiBadRequestResponse({
    description: 'A route or review value is malformed.',
  })
  @ApiNotFoundResponse({
    description: 'The decision candidate is inaccessible.',
  })
  @ApiConflictResponse({
    description: 'The candidate was already reviewed differently.',
  })
  @ApiServiceUnavailableResponse({ description: 'Persistence is unavailable.' })
  async reviewCandidate(
    @Req() request: RequestWithIdentity,
    @Param('workspaceId') workspaceId: string,
    @Param('analysisRunId') analysisRunId: string,
    @Param('candidateId') candidateId: string,
    @Body('action') action: unknown,
    @Body('reason') reason: unknown
  ): Promise<AnalysisDecisionReviewResponse> {
    const result = await this.runtime.runRequestEither(
      request,
      'analysis_run.review_candidate',
      reviewAnalysisDecisionCandidate({
        identity: requireIdentity(request),
        workspaceId,
        analysisRunId,
        candidateId,
        action,
        reason,
      })
    );

    return Either.match(result, {
      onLeft: failReviewHttp,
      onRight: (review) => new AnalysisDecisionReviewResponse(review),
    });
  }
}
