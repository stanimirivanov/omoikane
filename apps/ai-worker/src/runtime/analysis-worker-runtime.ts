import { Effect, Either, Layer, ManagedRuntime, Option } from 'effect';
import {
  acquireNextAnalysisJob,
  checkAnalysisWorkerReady,
  completeAnalysisJobFailure,
  claimNextAnalysisRunRequest,
  completeAnalysisJobSuccess,
  dispatchClaimedAnalysisRunRequest,
  type AnalysisFailureCategory,
  type AnalysisProcessorError,
  type AnalysisProcessorReceipt,
  type AnalysisJobExecution,
  type AnalysisRunRepository,
} from '@omoikane/application/analysis';
import {
  makeSupabaseAnalysisClientLayer,
  SupabaseAnalysisRunRepositoryLayer,
} from '@omoikane/infrastructure/analysis';
import type { WorkerConfig } from '../config/worker-config';
import type { WorkerTelemetry } from '../telemetry/worker-telemetry';
import {
  makeConfiguredAnalysisJobProcessor,
  type ConfiguredAnalysisJobProcessor,
} from './configured-analysis-job-processor';

const safeFailure = (failure: unknown): string =>
  typeof failure === 'object' && failure !== null && '_tag' in failure
    ? String(Reflect.get(failure, '_tag'))
    : 'WorkerDefect';

/**
 * Owns the worker's single Effect runtime and bounded polling lifecycle.
 * PostgreSQL remains responsible for claims, fencing, and atomic transitions.
 */
export class AnalysisWorkerRuntime {
  private readonly managedRuntime: ManagedRuntime.ManagedRuntime<
    AnalysisRunRepository,
    never
  >;
  private acceptingWork = false;
  private ready = false;
  private loopPromise: Promise<void> | null = null;
  private activeCycle: Promise<void> | null = null;
  private wakePolling: (() => void) | null = null;
  private stopped = false;

  constructor(
    private readonly config: WorkerConfig,
    private readonly telemetry: WorkerTelemetry,
    repositoryLayer?: Layer.Layer<AnalysisRunRepository>,
    private readonly processor: ConfiguredAnalysisJobProcessor = makeConfiguredAnalysisJobProcessor(
      config
    )
  ) {
    const clientLayer = makeSupabaseAnalysisClientLayer({
      url: config.supabaseUrl,
      secretKey: config.supabaseSecretKey,
    });
    const liveRepositoryLayer =
      repositoryLayer ??
      SupabaseAnalysisRunRepositoryLayer.pipe(Layer.provide(clientLayer));
    this.managedRuntime = ManagedRuntime.make(
      liveRepositoryLayer.pipe(Layer.merge(telemetry.effectLayer))
    );
  }

  async initialize(): Promise<void> {
    await this.managedRuntime.runtime();
    if (!(await this.checkReady())) {
      throw new Error('The Analysis worker database readiness check failed.');
    }
    this.ready = true;
  }

  start(): void {
    if (this.loopPromise !== null) {
      return;
    }
    this.acceptingWork = true;
    this.loopPromise = this.loop();
  }

  isLive(): boolean {
    return !this.stopped;
  }

  async checkReady(): Promise<boolean> {
    if (this.stopped) {
      return false;
    }

    const readiness = this.managedRuntime.runPromise(
      checkAnalysisWorkerReady.pipe(Effect.either)
    );
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        readiness.then(Either.isRight),
        new Promise<false>((resolve) => {
          timeout = setTimeout(
            () => resolve(false),
            this.config.readinessTimeoutMilliseconds
          );
        }),
      ]);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }

  isInitialized(): boolean {
    return this.ready;
  }

  private async loop(): Promise<void> {
    while (this.acceptingWork) {
      this.activeCycle = this.runCycle();
      await this.activeCycle.catch((cause: unknown) =>
        this.telemetry.log('error', 'Analysis worker cycle defected.', {
          'error.type': safeFailure(cause),
        })
      );
      this.activeCycle = null;
      if (this.acceptingWork) {
        await this.waitForNextPoll();
      }
    }
  }

  private async runCycle(): Promise<void> {
    await this.dispatchOne();
    if (this.acceptingWork) {
      await this.executeOne();
    }
  }

  private async dispatchOne(): Promise<void> {
    const claim = await this.managedRuntime.runPromise(
      claimNextAnalysisRunRequest({ dispatcherId: this.config.workerId }).pipe(
        Effect.either
      )
    );
    if (Either.isLeft(claim)) {
      this.telemetry.recordDispatch(true);
      this.telemetry.log('error', 'Analysis outbox claim failed.', {
        'error.type': safeFailure(claim.left),
      });
      return;
    }
    if (Option.isNone(claim.right)) {
      return;
    }

    const ownedClaim = claim.right.value;
    const dispatch = dispatchClaimedAnalysisRunRequest(ownedClaim).pipe(
      Effect.withSpan('analysis.outbox.dispatch', { kind: 'internal' }),
      (program) =>
        this.telemetry.continueTrace(program, ownedClaim.traceContext),
      Effect.either
    );
    const result = await this.managedRuntime.runPromise(dispatch);
    this.telemetry.recordDispatch(Either.isLeft(result));
    if (Either.isLeft(result)) {
      this.telemetry.log('error', 'Analysis outbox dispatch failed.', {
        'error.type': safeFailure(result.left),
      });
    }
  }

  private async executeOne(): Promise<void> {
    const acquisition = await this.managedRuntime.runPromise(
      acquireNextAnalysisJob({
        workerId: this.config.workerId,
        leaseSeconds: this.config.jobLeaseSeconds,
        processorVersion: this.processor.processorVersion,
      }).pipe(Effect.either)
    );
    if (Either.isLeft(acquisition)) {
      this.telemetry.recordAcquisition(false);
      this.telemetry.log('error', 'Analysis job acquisition failed.', {
        'error.type': safeFailure(acquisition.left),
      });
      return;
    }

    const execution = acquisition.right;
    this.telemetry.recordAcquisition(Option.isSome(execution));
    if (Option.isNone(execution)) {
      return;
    }

    await this.execute(execution.value);
  }

  private async execute(execution: AnalysisJobExecution): Promise<void> {
    const startedAt = performance.now();
    let processorResult: Either.Either<
      AnalysisProcessorReceipt,
      AnalysisProcessorError
    >;
    try {
      processorResult = await this.managedRuntime.runPromise(
        this.processor.process(execution).pipe(Effect.either)
      );
    } catch {
      await this.completeFailure(
        execution,
        'processor.defect',
        true,
        startedAt
      );
      return;
    }

    if (Either.isLeft(processorResult)) {
      await this.completeFailure(
        execution,
        processorResult.left.category,
        processorResult.left._tag === 'RetryableAnalysisProcessorError',
        startedAt
      );
      return;
    }

    const receipt = processorResult.right;
    const durationMilliseconds = Math.max(
      0,
      Math.round(performance.now() - startedAt)
    );
    const completion = completeAnalysisJobSuccess({
      execution,
      receipt,
      durationMilliseconds,
    }).pipe(
      Effect.withSpan('analysis.job.execute', {
        kind: 'internal',
        attributes: {
          'analysis_run.id': execution.analysisRunId,
          'analysis_job.id': execution.jobId,
          'job.kind': execution.kind,
          'job.attempt.number': execution.attemptNumber,
        },
      }),
      (program) =>
        this.telemetry.continueTrace(program, execution.traceContext),
      Effect.either
    );
    const result = await this.managedRuntime.runPromise(completion);
    this.telemetry.recordAttempt(
      durationMilliseconds,
      Either.isLeft(result) ? 'completion_failed' : 'succeeded'
    );
    this.telemetry.log(
      Either.isLeft(result) ? 'error' : 'info',
      Either.isLeft(result)
        ? 'Analysis job completion failed.'
        : 'Analysis job completed.',
      {
        'analysis_run.id': execution.analysisRunId,
        'analysis_job.id': execution.jobId,
        'job.attempt.number': execution.attemptNumber,
        ...(Either.isLeft(result)
          ? { 'error.type': safeFailure(result.left) }
          : { outcome: 'succeeded' }),
      }
    );
  }

  private async completeFailure(
    execution: AnalysisJobExecution,
    failureCategory: AnalysisFailureCategory,
    retryable: boolean,
    startedAt: number
  ): Promise<void> {
    const durationMilliseconds = Math.max(
      0,
      Math.round(performance.now() - startedAt)
    );
    const completion = completeAnalysisJobFailure({
      execution,
      failureCategory,
      retryable,
      durationMilliseconds,
    }).pipe(
      Effect.withSpan('analysis.job.execute', {
        kind: 'internal',
        attributes: {
          'analysis_run.id': execution.analysisRunId,
          'analysis_job.id': execution.jobId,
          'job.kind': execution.kind,
          'job.attempt.number': execution.attemptNumber,
          'failure.category': failureCategory,
        },
      }),
      (program) =>
        this.telemetry.continueTrace(program, execution.traceContext),
      Effect.either
    );
    const result = await this.managedRuntime.runPromise(completion);

    if (Either.isLeft(result)) {
      this.telemetry.recordAttempt(durationMilliseconds, 'completion_failed');
      this.telemetry.log('error', 'Analysis job failure completion failed.', {
        'analysis_run.id': execution.analysisRunId,
        'analysis_job.id': execution.jobId,
        'job.attempt.number': execution.attemptNumber,
        'error.type': safeFailure(result.left),
      });
      return;
    }

    this.telemetry.recordAttempt(durationMilliseconds, result.right.outcome);
    this.telemetry.recordFailureCompletion(
      result.right.outcome,
      result.right.failureCategory
    );
    this.telemetry.log(
      result.right.outcome === 'dead_lettered' ? 'error' : 'info',
      result.right.outcome === 'dead_lettered'
        ? 'Analysis job dead-lettered.'
        : 'Analysis job retry scheduled.',
      {
        'analysis_run.id': execution.analysisRunId,
        'analysis_job.id': execution.jobId,
        'job.attempt.number': execution.attemptNumber,
        'failure.category': result.right.failureCategory,
        outcome: result.right.outcome,
      }
    );
  }

  private waitForNextPoll(): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.wakePolling = null;
        resolve();
      }, this.config.pollIntervalMilliseconds);
      this.wakePolling = () => {
        clearTimeout(timeout);
        this.wakePolling = null;
        resolve();
      };
    });
  }

  async stop(): Promise<void> {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    this.ready = false;
    this.acceptingWork = false;
    this.wakePolling?.();

    const drained = await this.waitBounded(
      this.activeCycle ?? Promise.resolve(),
      this.config.drainTimeoutMilliseconds
    );
    if (drained) {
      await this.loopPromise;
    }
    await this.waitBounded(
      this.managedRuntime.dispose(),
      this.config.drainTimeoutMilliseconds
    );
    await this.telemetry.shutdown();
  }

  private async waitBounded(
    operation: Promise<unknown>,
    timeoutMilliseconds: number
  ): Promise<boolean> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation.then(() => true),
        new Promise<false>((resolve) => {
          timeout = setTimeout(() => resolve(false), timeoutMilliseconds);
        }),
      ]);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }
}
