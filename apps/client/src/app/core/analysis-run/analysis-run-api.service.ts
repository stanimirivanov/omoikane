import { Injectable, inject } from '@angular/core';
import { Either, Schema } from 'effect';
import {
  AnalysisRunSchema,
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
    | 'unavailable';
}

const decodeResponse = (value: unknown) => {
  const record = typeof value === 'object' && value !== null ? value : {};
  const result = Reflect.get(record, 'result');
  const decodedResult =
    typeof result === 'object' && result !== null
      ? {
          ...result,
          createdAt: new Date(String(Reflect.get(result, 'createdAt') ?? '')),
        }
      : result;
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
        kind:
          response.status === 400
            ? 'invalid-request'
            : response.status === 404
              ? 'not-found'
              : response.status === 401
                ? 'authentication'
                : 'unavailable',
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
