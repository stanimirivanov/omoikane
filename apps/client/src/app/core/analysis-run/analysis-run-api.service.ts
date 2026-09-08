import { Injectable, inject } from '@angular/core';
import { Either, Schema } from 'effect';
import {
  AnalysisDecisionReviewSchema,
  AnalysisRunSchema,
  type AnalysisDecisionCandidateId,
  type AnalysisDecisionReview,
  type AnalysisDecisionReviewAction,
  type AnalysisRun,
  type AnalysisTimeRange,
} from '@omoikane/domain/analysis';
import { environment } from '@client-environments/environment';
import { AuthenticationApplicationService } from '../authentication/authentication-application.service';

export interface AnalysisRunApiError {
  readonly kind:
    | 'authentication'
    | 'invalid-request'
    | 'not-found'
    | 'conflict'
    | 'unavailable';
}

const decodeResponse = (value: unknown) => {
  const record = typeof value === 'object' && value !== null ? value : {};
  const result = Reflect.get(record, 'result');
  const resultRecord =
    typeof result === 'object' && result !== null ? result : undefined;
  const candidates =
    resultRecord === undefined
      ? undefined
      : Reflect.get(resultRecord, 'candidates');
  const decodedResult =
    resultRecord === undefined
      ? result
      : {
          ...resultRecord,
          createdAt: new Date(
            String(Reflect.get(resultRecord, 'createdAt') ?? '')
          ),
          ...(Array.isArray(candidates)
            ? {
                candidates: candidates.map((candidate: unknown) => {
                  const candidateRecord =
                    typeof candidate === 'object' && candidate !== null
                      ? candidate
                      : {};
                  const review = Reflect.get(candidateRecord, 'review');
                  return {
                    ...candidateRecord,
                    review:
                      typeof review === 'object' && review !== null
                        ? {
                            ...review,
                            occurredAt: new Date(
                              String(Reflect.get(review, 'occurredAt') ?? '')
                            ),
                          }
                        : review,
                  };
                }),
              }
            : {}),
        };
  const timeRange = Reflect.get(record, 'timeRange');
  const decodedTimeRange =
    typeof timeRange === 'object' && timeRange !== null
      ? {
          start: new Date(String(Reflect.get(timeRange, 'start') ?? '')),
          end: new Date(String(Reflect.get(timeRange, 'end') ?? '')),
        }
      : timeRange;
  return Schema.decodeUnknownEither(AnalysisRunSchema)({
    id: Reflect.get(record, 'id'),
    workspaceId: Reflect.get(record, 'workspaceId'),
    channelId: Reflect.get(record, 'channelId'),
    timeRange: decodedTimeRange,
    requestedBy: Reflect.get(record, 'requestedBy'),
    status: Reflect.get(record, 'status'),
    failureCategory: Reflect.get(record, 'failureCategory'),
    result: decodedResult,
    createdAt: new Date(String(Reflect.get(record, 'createdAt') ?? '')),
  });
};

const decodeReviewResponse = (value: unknown) => {
  const record = typeof value === 'object' && value !== null ? value : {};
  return Schema.decodeUnknownEither(AnalysisDecisionReviewSchema)({
    id: Reflect.get(record, 'id'),
    candidateId: Reflect.get(record, 'candidateId'),
    reviewerId: Reflect.get(record, 'reviewerId'),
    action: Reflect.get(record, 'action'),
    reason: Reflect.get(record, 'reason'),
    occurredAt: new Date(String(Reflect.get(record, 'occurredAt') ?? '')),
  });
};

/** Browser HTTP boundary for the first trusted server capability. */
@Injectable({ providedIn: 'root' })
export class AnalysisRunApiService {
  private readonly authentication = inject(AuthenticationApplicationService);

  start(
    workspaceId: string,
    channelId: string,
    timeRange: AnalysisTimeRange
  ): Promise<Either.Either<AnalysisRun, AnalysisRunApiError>> {
    return this.request('POST', workspaceId, undefined, {
      channelId,
      timeRange: {
        start: timeRange.start.toISOString(),
        end: timeRange.end.toISOString(),
      },
    });
  }

  get(
    workspaceId: string,
    analysisRunId: string
  ): Promise<Either.Either<AnalysisRun, AnalysisRunApiError>> {
    return this.request('GET', workspaceId, analysisRunId);
  }

  async reviewCandidate(
    workspaceId: string,
    analysisRunId: string,
    candidateId: AnalysisDecisionCandidateId,
    action: AnalysisDecisionReviewAction,
    reason: string | null
  ): Promise<Either.Either<AnalysisDecisionReview, AnalysisRunApiError>> {
    const tokenResult = await this.authentication.currentAccessToken();
    if (Either.isLeft(tokenResult)) {
      return Either.left({ kind: 'authentication' });
    }

    let response: Response;
    try {
      response = await fetch(
        `${environment.server.url}/api/v1/workspaces/${workspaceId}/analysis-runs/${analysisRunId}/candidates/${candidateId}/review`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenResult.right}`,
            'Content-Type': 'application/json',
            'X-Request-Id': crypto.randomUUID(),
          },
          body: JSON.stringify({ action, reason }),
        }
      );
    } catch {
      return Either.left({ kind: 'unavailable' });
    }

    if (!response.ok) {
      return Either.left({ kind: this.errorKind(response.status) });
    }

    try {
      return Either.mapLeft(
        decodeReviewResponse(await response.json()),
        () => ({
          kind: 'unavailable' as const,
        })
      );
    } catch {
      return Either.left({ kind: 'unavailable' });
    }
  }

  private errorKind(status: number): AnalysisRunApiError['kind'] {
    return status === 400
      ? 'invalid-request'
      : status === 404
        ? 'not-found'
        : status === 409
          ? 'conflict'
          : status === 401
            ? 'authentication'
            : 'unavailable';
  }

  private async request(
    method: 'GET' | 'POST',
    workspaceId: string,
    analysisRunId?: string,
    body?: Readonly<Record<string, unknown>>
  ): Promise<Either.Either<AnalysisRun, AnalysisRunApiError>> {
    const tokenResult = await this.authentication.currentAccessToken();
    if (Either.isLeft(tokenResult)) {
      return Either.left({ kind: 'authentication' });
    }

    const suffix = analysisRunId === undefined ? '' : `/${analysisRunId}`;
    let response: Response;
    try {
      response = await fetch(
        `${environment.server.url}/api/v1/workspaces/${workspaceId}/analysis-runs${suffix}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${tokenResult.right}`,
            'X-Request-Id': crypto.randomUUID(),
            ...(body === undefined
              ? {}
              : { 'Content-Type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }
      );
    } catch {
      return Either.left({ kind: 'unavailable' });
    }

    if (!response.ok) {
      return Either.left({
        kind: this.errorKind(response.status),
      });
    }

    try {
      const decoded = decodeResponse(await response.json());
      return Either.mapLeft(decoded, () => ({ kind: 'unavailable' as const }));
    } catch {
      return Either.left({ kind: 'unavailable' });
    }
  }
}
