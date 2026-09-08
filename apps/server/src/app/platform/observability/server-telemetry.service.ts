import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  TraceFlags,
  type Attributes,
  type Counter,
  type Histogram,
  type Span,
  type SpanContext,
  type TextMapGetter,
  type Tracer,
  type UpDownCounter,
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import * as EffectOtelTracer from '@effect/opentelemetry/Tracer';
import { Layer } from 'effect';
import { SERVER_CONFIG } from '../configuration/server-config.provider';
import type { ServerConfig } from '../configuration/server-config';
import {
  InjectServerTelemetrySinks,
  type ServerTelemetrySinks,
} from './server-telemetry-sinks';

const REQUEST_TELEMETRY = Symbol('REQUEST_TELEMETRY');
const REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/u;
const SAFE_ERROR_TYPE = /^[a-z0-9._-]{1,64}$/u;
const KNOWN_METHODS = new Set([
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT',
]);

interface RequestTelemetryContext {
  readonly requestId: string;
  readonly method: string;
  readonly span: Span;
  readonly startedAt: number;
  finished: boolean;
  errorType?: string;
  workspaceId?: string;
  analysisRunId?: string;
}

export interface TelemetryRequest {
  readonly headers: Readonly<
    Record<string, string | readonly string[] | undefined>
  >;
  readonly method?: string;
  readonly [REQUEST_TELEMETRY]?: RequestTelemetryContext;
}

export interface TelemetryReply {
  readonly statusCode?: number;
  readonly routeOptions?: { readonly url?: string };
  readonly request?: { readonly routeOptions?: { readonly url?: string } };
  header(name: string, value: string): unknown;
}

export type ServerObservedOperation =
  | 'authentication.validate'
  | 'authentication.health'
  | 'analysis_run.start'
  | 'analysis_run.get'
  | 'analysis_run.review_candidate';

const headerGetter: TextMapGetter<TelemetryRequest['headers']> = {
  keys: (headers) => Object.keys(headers),
  get: (headers, key) => {
    const value = headers[key.toLowerCase()];
    return typeof value === 'string' || value === undefined
      ? value
      : [...value];
  },
};

const firstHeader = (
  value: string | readonly string[] | undefined
): string | undefined => (typeof value === 'string' ? value : value?.[0]);

const methodLabel = (method: string | undefined): string => {
  const normalized = method?.toUpperCase() ?? 'OTHER';
  return KNOWN_METHODS.has(normalized) ? normalized : 'OTHER';
};

const traceparent = (context: SpanContext): string =>
  `00-${context.traceId}-${context.spanId}-${
    (context.traceFlags & TraceFlags.SAMPLED) === TraceFlags.SAMPLED
      ? '01'
      : '00'
  }`;

/**
 * Owns request correlation, OpenTelemetry providers, safe structured logs, and
 * bounded HTTP/operation metrics for the server process.
 *
 * The service deliberately passes request span context into Effect explicitly;
 * request correctness does not depend on ambient async-local state crossing an
 * Effect fiber boundary.
 */
@Injectable()
export class ServerTelemetry {
  readonly effectLayer: Layer.Layer<never>;

  private readonly tracerProvider: NodeTracerProvider;
  private readonly meterProvider: MeterProvider;
  private readonly tracer: Tracer;
  private readonly requestCount: Counter;
  private readonly requestDuration: Histogram;
  private readonly activeRequests: UpDownCounter;
  private readonly authenticationFailures: Counter;
  private readonly operationDuration: Histogram;
  private readonly operationFailures: Counter;
  private shutdownStarted = false;

  constructor(
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @InjectServerTelemetrySinks() sinks: ServerTelemetrySinks
  ) {
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'omoikane-server',
      [ATTR_SERVICE_VERSION]: config.version,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: config.environment,
    });
    this.tracerProvider = new NodeTracerProvider({
      resource,
      spanProcessors: [...sinks.spanProcessors],
    });
    this.meterProvider = new MeterProvider({
      resource,
      readers: [...sinks.metricReaders],
    });
    this.tracer = this.tracerProvider.getTracer(
      'omoikane-server',
      config.version
    );
    const meter = this.meterProvider.getMeter(
      'omoikane-server',
      config.version
    );

    this.requestCount = meter.createCounter('http.server.request.count');
    this.requestDuration = meter.createHistogram(
      'http.server.request.duration',
      { unit: 's' }
    );
    this.activeRequests = meter.createUpDownCounter(
      'http.server.active_requests'
    );
    this.authenticationFailures = meter.createCounter(
      'omoikane.server.authentication.failures'
    );
    this.operationDuration = meter.createHistogram(
      'omoikane.server.operation.duration',
      { unit: 's' }
    );
    this.operationFailures = meter.createCounter(
      'omoikane.server.operation.failures'
    );

    const tracerLayer = Layer.succeed(EffectOtelTracer.OtelTracer, this.tracer);
    this.effectLayer = EffectOtelTracer.layerWithoutOtelTracer.pipe(
      Layer.provide(tracerLayer)
    );
  }

  /** Starts the server span before Nest guards execute. */
  beginRequest(request: TelemetryRequest, reply: TelemetryReply): void {
    const propagatedRequestId = firstHeader(request.headers['x-request-id']);
    const requestId =
      propagatedRequestId !== undefined && REQUEST_ID.test(propagatedRequestId)
        ? propagatedRequestId
        : randomUUID();
    const method = methodLabel(request.method);
    const parent = new W3CTraceContextPropagator().extract(
      ROOT_CONTEXT,
      request.headers,
      headerGetter
    );
    const span = this.tracer.startSpan(
      `HTTP ${method}`,
      {
        kind: SpanKind.SERVER,
        attributes: { 'http.request.method': method, 'request.id': requestId },
      },
      parent
    );
    const context: RequestTelemetryContext = {
      requestId,
      method,
      span,
      startedAt: performance.now(),
      finished: false,
    };

    Object.defineProperty(request, REQUEST_TELEMETRY, {
      value: context,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    reply.header('X-Request-Id', requestId);
    reply.header('Traceparent', traceparent(span.spanContext()));
    this.activeRequests.add(1, { 'http.request.method': method });
  }

  /** Ends one request span and emits one privacy-safe JSON log record. */
  finishRequest(
    request: TelemetryRequest,
    statusCode: number,
    route: string | undefined
  ): void {
    const context = request[REQUEST_TELEMETRY];
    if (context === undefined || context.finished) {
      return;
    }
    context.finished = true;

    const routeLabel = route?.trim() || 'unmatched';
    const durationMilliseconds = performance.now() - context.startedAt;
    const errorType =
      context.errorType ??
      (statusCode >= 500
        ? 'internal_error'
        : statusCode >= 400
          ? 'http_error'
          : undefined);
    const attributes: Attributes = {
      'http.request.method': context.method,
      'http.route': routeLabel,
      'http.response.status_code': statusCode,
      ...(errorType === undefined ? {} : { 'error.type': errorType }),
    };

    context.span.updateName(`${context.method} ${routeLabel}`);
    context.span.setAttributes(attributes);
    context.span.setStatus({
      code: statusCode >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK,
    });
    context.span.end();

    this.activeRequests.add(-1, { 'http.request.method': context.method });
    this.requestCount.add(1, attributes);
    this.requestDuration.record(durationMilliseconds / 1000, attributes);

    const spanContext = context.span.spanContext();
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: statusCode >= 500 ? 'error' : 'info',
        'service.name': 'omoikane-server',
        'service.version': this.config.version,
        'deployment.environment': this.config.environment,
        'request.id': context.requestId,
        'trace.id': spanContext.traceId,
        'span.id': spanContext.spanId,
        'http.request.method': context.method,
        'http.route': routeLabel,
        'http.response.status_code': statusCode,
        duration_ms: Math.round(durationMilliseconds * 1000) / 1000,
        ...(errorType === undefined ? {} : { 'error.type': errorType }),
        ...(context.workspaceId === undefined
          ? {}
          : { 'workspace.id': context.workspaceId }),
        ...(context.analysisRunId === undefined
          ? {}
          : { 'analysis_run.id': context.analysisRunId }),
      })
    );
  }

  /** Returns the server span context that must be passed into an Effect fiber. */
  requestSpanContext(request: TelemetryRequest): SpanContext | undefined {
    return request[REQUEST_TELEMETRY]?.span.spanContext();
  }

  /** Returns the safe W3C carrier persisted for later asynchronous work. */
  processingTraceContext(
    request: TelemetryRequest
  ):
    | { readonly traceparent: string; readonly tracestate: string | null }
    | undefined {
    const context = request[REQUEST_TELEMETRY];
    if (context === undefined) {
      return undefined;
    }
    const spanContext = context.span.spanContext();
    return {
      traceparent: traceparent(spanContext),
      tracestate: spanContext.traceState?.serialize() || null,
    };
  }

  /** Returns the stable request identifier used by responses and log records. */
  requestId(request: TelemetryRequest): string | undefined {
    return request[REQUEST_TELEMETRY]?.requestId;
  }

  /** Adds only validated domain identifiers to request correlation metadata. */
  annotateAnalysisRun(
    request: TelemetryRequest,
    workspaceId: string,
    analysisRunId: string
  ): void {
    const context = request[REQUEST_TELEMETRY];
    if (context === undefined) {
      return;
    }
    context.workspaceId = workspaceId;
    context.analysisRunId = analysisRunId;
    context.span.setAttributes({
      'workspace.id': workspaceId,
      'analysis_run.id': analysisRunId,
    });
  }

  /** Annotates a request with a bounded public failure category. */
  recordRequestFailure(request: TelemetryRequest, errorType: string): void {
    const context = request[REQUEST_TELEMETRY];
    if (context === undefined) {
      return;
    }
    const safeType = SAFE_ERROR_TYPE.test(errorType)
      ? errorType
      : 'unknown_error';
    context.errorType = safeType;
    context.span.setAttribute('error.type', safeType);
    if (safeType.startsWith('authentication_')) {
      this.authenticationFailures.add(1, { 'error.type': safeType });
    }
  }

  /** Records bounded operation latency and failure counts without tenant labels. */
  recordOperation(
    operation: ServerObservedOperation,
    durationMilliseconds: number,
    failed: boolean
  ): void {
    const attributes = { 'operation.name': operation };
    this.operationDuration.record(durationMilliseconds / 1000, attributes);
    if (failed) {
      this.operationFailures.add(1, attributes);
    }
  }

  /** Forces buffered signals to their configured sinks, primarily before exit. */
  async forceFlush(): Promise<void> {
    const timeoutMilliseconds =
      this.config.telemetryShutdownTimeoutMilliseconds;
    await Promise.allSettled([
      this.tracerProvider.forceFlush(),
      this.meterProvider.forceFlush({
        timeoutMillis: timeoutMilliseconds,
      }),
    ]);
  }

  /** Flushes and closes exporters without making telemetry a readiness dependency. */
  async shutdown(): Promise<void> {
    if (this.shutdownStarted) {
      return;
    }
    this.shutdownStarted = true;

    const timeoutMilliseconds =
      this.config.telemetryShutdownTimeoutMilliseconds;
    const closing = this.forceFlush().then(() =>
      Promise.allSettled([
        this.tracerProvider.shutdown(),
        this.meterProvider.shutdown({
          timeoutMillis: timeoutMilliseconds,
        }),
      ])
    );
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        closing,
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, timeoutMilliseconds);
        }),
      ]);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }
}
