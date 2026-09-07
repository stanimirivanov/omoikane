import { Clock, Effect, Schema } from 'effect';
import type { AuthenticatedRequestIdentity } from '@omoikane/application/authentication';
import { ChannelIdSchema, type ChannelId } from '@omoikane/domain/channel';
import {
  AnalysisTimeRangeSchema,
  AnalysisRunIdSchema,
  type AnalysisTimeRange,
  type AnalysisRunId,
} from '@omoikane/domain/analysis';
import { ProfileIdSchema } from '@omoikane/domain/profile';
import {
  WorkspaceIdSchema,
  type WorkspaceId,
} from '@omoikane/domain/workspace';
import { InvalidAnalysisRunInputError } from './analysis-run-error';
import type { AnalysisRunProcessingTraceContext } from './analysis-run-repository';

const TraceparentSchema = Schema.String.pipe(
  Schema.pattern(
    /^00-(?!0{32})[0-9a-f]{32}-(?!0{16})[0-9a-f]{16}-[0-9a-f]{2}$/u
  )
);

const TracestateSchema = Schema.NullOr(
  Schema.String.pipe(
    Schema.nonEmptyString(),
    Schema.maxLength(512),
    Schema.pattern(/^[^\r\n]*$/u)
  )
);

const ProcessingTraceContextSchema = Schema.Struct({
  traceparent: TraceparentSchema,
  tracestate: TracestateSchema,
});

interface ScopedRequest {
  readonly identity: AuthenticatedRequestIdentity;
  readonly workspaceId: WorkspaceId;
}

interface StartRequest extends ScopedRequest {
  readonly channelId: ChannelId;
  readonly timeRange: AnalysisTimeRange;
  readonly traceContext: AnalysisRunProcessingTraceContext;
}

const AnalysisTimeRangeRequestSchema = Schema.Struct({
  start: Schema.DateFromString,
  end: Schema.DateFromString,
});

export const readInputProperty = (input: unknown, key: string): unknown =>
  typeof input === 'object' && input !== null
    ? Reflect.get(input, key)
    : undefined;

const decodeField = <A, I>(
  schema: Schema.Schema<A, I, never>,
  value: unknown,
  field:
    | 'requestIdentity'
    | 'workspaceId'
    | 'channelId'
    | 'timeRange'
    | 'analysisRunId'
    | 'traceContext'
    | 'dispatcherId'
): Effect.Effect<A, InvalidAnalysisRunInputError> =>
  Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError(
      (cause) => new InvalidAnalysisRunInputError({ field, cause })
    )
  );

export const decodeScopedRequest = (
  input: unknown
): Effect.Effect<ScopedRequest, InvalidAnalysisRunInputError> =>
  Effect.gen(function* () {
    const userId = yield* decodeField(
      ProfileIdSchema,
      readInputProperty(readInputProperty(input, 'identity'), 'userId'),
      'requestIdentity'
    );
    const workspaceId = yield* decodeField(
      WorkspaceIdSchema,
      readInputProperty(input, 'workspaceId'),
      'workspaceId'
    );
    return { identity: { userId }, workspaceId };
  });

export const decodeStartRequest = (
  input: unknown
): Effect.Effect<StartRequest, InvalidAnalysisRunInputError> =>
  Effect.gen(function* () {
    const request = yield* decodeScopedRequest(input);
    const channelId = yield* decodeField(
      ChannelIdSchema,
      readInputProperty(input, 'channelId'),
      'channelId'
    );
    const decodedTimeRange = yield* decodeField(
      AnalysisTimeRangeRequestSchema,
      readInputProperty(input, 'timeRange'),
      'timeRange'
    );
    const timeRange = yield* decodeField(
      AnalysisTimeRangeSchema,
      decodedTimeRange,
      'timeRange'
    );
    const currentTime = yield* Clock.currentTimeMillis;
    if (timeRange.end.getTime() > currentTime) {
      return yield* new InvalidAnalysisRunInputError({
        field: 'timeRange',
        cause: 'An analysis time range cannot end in the future.',
      });
    }
    const traceContext = yield* decodeField(
      ProcessingTraceContextSchema,
      readInputProperty(input, 'traceContext'),
      'traceContext'
    );

    return { ...request, channelId, timeRange, traceContext };
  });

export const decodeAnalysisRunId = (
  input: unknown
): Effect.Effect<AnalysisRunId, InvalidAnalysisRunInputError> =>
  decodeField(AnalysisRunIdSchema, input, 'analysisRunId');

const DispatcherIdSchema = Schema.String.pipe(
  Schema.maxLength(128),
  Schema.pattern(/^(?=.*\S)[^\r\n]+$/u)
);

export const decodeDispatcherId = (
  input: unknown
): Effect.Effect<string, InvalidAnalysisRunInputError> =>
  decodeField(DispatcherIdSchema, input, 'dispatcherId');
