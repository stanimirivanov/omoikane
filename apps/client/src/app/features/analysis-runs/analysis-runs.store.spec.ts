import { TestBed } from '@angular/core/testing';
import { Either, Schema } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AnalysisDecisionReviewSchema,
  AnalysisRunSchema,
  type AnalysisRun,
} from '@omoikane/domain/analysis';
import { ChannelIdSchema } from '@omoikane/domain/channel';
import { WorkspaceIdSchema } from '@omoikane/domain/workspace';
import { AnalysisRunApiService } from '@client/core/analysis-run/analysis-run-api.service';
import { AnalysisRunsStore } from './analysis-runs.store';

const workspaceId = Schema.decodeUnknownSync(WorkspaceIdSchema)(
  '20000000-0000-4000-8000-000000000001'
);
const channelId = Schema.decodeUnknownSync(ChannelIdSchema)(
  '40000000-0000-4000-8000-000000000001'
);
const run: AnalysisRun = Schema.decodeUnknownSync(AnalysisRunSchema)({
  id: '30000000-0000-4000-8000-000000000001',
  workspaceId,
  channelId,
  timeRange: {
    start: new Date('2026-08-02T12:00:00.000Z'),
    end: new Date('2026-08-09T12:00:00.000Z'),
  },
  requestedBy: '10000000-0000-4000-8000-000000000001',
  status: 'created',
  failureCategory: null,
  result: null,
  createdAt: new Date('2026-08-09T12:00:00.000Z'),
});

const source = {
  messageId: '90000000-0000-4000-8000-000000000001',
  messageRevisionId: '91000000-0000-4000-8000-000000000001',
};
const candidateId = '93000000-0000-4000-8000-000000000001';
const decisionRun = Schema.decodeUnknownSync(AnalysisRunSchema)({
  ...run,
  status: 'succeeded',
  result: {
    id: '92000000-0000-4000-8000-000000000001',
    analysisRunId: run.id,
    kind: 'decision-forensics',
    processorVersion: 'analysis.decision-forensics.v1',
    providerKind: 'ollama',
    model: 'qwen3:8b',
    resultSchemaVersion: 'decision-forensics.result.v1',
    promptVersion: 'decision-forensics.extract.v1',
    promptDigest:
      'd0b179cc79776914ad559aef19e9060dd13bff3946200bbc6f7914a980e9fff1',
    evaluationVersion: 'decision-forensics.evaluation.v1',
    generationPolicy: {
      temperature: 0,
      maxOutputTokens: 8192,
      tools: false,
      repairAttempts: 0,
    },
    usage: { inputUnits: 10, outputUnits: 5 },
    sourceCount: 1,
    sourceTruncated: false,
    sources: [source],
    summary: 'Extracted 1 proposed decision candidate.',
    candidates: [
      {
        id: candidateId,
        status: 'proposed',
        review: null,
        title: 'Release timing',
        summary: 'Release on Friday.',
        disposition: 'made',
        claims: [{ text: 'Release on Friday.', evidence: [source] }],
        assumptions: [],
        participants: [],
        confidence: 0.9,
      },
    ],
    createdAt: new Date('2026-09-08T12:00:00Z'),
  },
});
const review = Schema.decodeUnknownSync(AnalysisDecisionReviewSchema)({
  id: '94000000-0000-4000-8000-000000000001',
  candidateId,
  reviewerId: run.requestedBy,
  action: 'confirm',
  reason: 'Confirmed in planning.',
  occurredAt: new Date('2026-09-08T13:00:00Z'),
});

const withStatus = (
  status: AnalysisRun['status'],
  failureCategory: string | null = null
): AnalysisRun => ({ ...run, status, failureCategory });

const configureStore = () => {
  const start = vi.fn().mockResolvedValue(Either.right(run));
  const get = vi.fn().mockResolvedValue(Either.right(run));
  const reviewCandidate = vi.fn().mockResolvedValue(Either.right(review));
  TestBed.configureTestingModule({
    providers: [
      AnalysisRunsStore,
      {
        provide: AnalysisRunApiService,
        useValue: { start, get, reviewCandidate },
      },
    ],
  });
  return {
    store: TestBed.inject(AnalysisRunsStore),
    start,
    get,
    reviewCandidate,
  };
};

describe('AnalysisRunsStore', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('starts and retains the canonical run for the selected channel', async () => {
    const { store, start } = configureStore();
    store.selectScope(workspaceId, channelId);
    const timeRange = {
      start: store.timeRangeStart(),
      end: store.timeRangeEnd(),
    };

    await expect(store.start()).resolves.toBe(true);

    expect(start).toHaveBeenCalledExactlyOnceWith(
      workspaceId,
      channelId,
      timeRange
    );
    expect(store.run()).toEqual(run);
    expect(store.status()).toBe('observing');
  });

  it('observes lifecycle transitions until the run succeeds', async () => {
    vi.useFakeTimers();
    const { store, get } = configureStore();
    get
      .mockResolvedValueOnce(Either.right(withStatus('queued')))
      .mockResolvedValueOnce(Either.right(withStatus('running')))
      .mockResolvedValueOnce(Either.right(withStatus('succeeded')));
    store.selectScope(workspaceId, channelId);
    await store.start();

    await vi.advanceTimersByTimeAsync(3_000);

    expect(get).toHaveBeenCalledTimes(3);
    expect(store.run()?.status).toBe('succeeded');
    expect(store.status()).toBe('idle');

    await vi.advanceTimersByTimeAsync(1_000);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('stops observing when channel scope changes', async () => {
    vi.useFakeTimers();
    const { store, get } = configureStore();
    store.selectScope(workspaceId, channelId);
    await store.start();

    store.selectScope(
      workspaceId,
      Schema.decodeUnknownSync(ChannelIdSchema)(
        '40000000-0000-4000-8000-000000000002'
      )
    );
    await vi.advanceTimersByTimeAsync(1_000);

    expect(get).not.toHaveBeenCalled();
    expect(store.run()).toBeNull();
  });

  it('lets a new workspace observe while an old request is still pending', async () => {
    const { store, start, get } = configureStore();
    let completeOldObservation:
      | ((value: Either.Either<AnalysisRun, never>) => void)
      | null = null;
    get.mockReturnValueOnce(
      new Promise((resolve) => {
        completeOldObservation = resolve;
      })
    );
    store.selectScope(workspaceId, channelId);
    await store.start();
    const oldObservation = store.refresh();

    const nextWorkspaceId = Schema.decodeUnknownSync(WorkspaceIdSchema)(
      '20000000-0000-4000-8000-000000000002'
    );
    const nextRun = { ...run, workspaceId: nextWorkspaceId };
    store.selectScope(nextWorkspaceId, channelId);
    start.mockResolvedValueOnce(Either.right(nextRun));
    await store.start();
    get.mockResolvedValueOnce(
      Either.right({ ...nextRun, status: 'succeeded' as const })
    );

    await expect(store.refresh()).resolves.toBe(true);
    expect(get).toHaveBeenLastCalledWith(nextWorkspaceId, nextRun.id);

    if (completeOldObservation === null) {
      throw new Error('Expected the old observation request to be pending.');
    }
    completeOldObservation(Either.right(run));
    await expect(oldObservation).resolves.toBe(false);
    expect(store.workspaceId()).toBe(nextWorkspaceId);
  });

  it('refreshes the retained run through the observe endpoint', async () => {
    const { store, get } = configureStore();
    store.selectScope(workspaceId, channelId);
    await store.start();

    await expect(store.refresh()).resolves.toBe(true);

    expect(get).toHaveBeenCalledExactlyOnceWith(workspaceId, run.id);
  });

  it('clears a run when channel selection changes', async () => {
    const { store } = configureStore();
    store.selectScope(workspaceId, channelId);
    await store.start();

    store.selectScope(
      workspaceId,
      Schema.decodeUnknownSync(ChannelIdSchema)(
        '40000000-0000-4000-8000-000000000002'
      )
    );

    expect(store.run()).toBeNull();
    expect(store.status()).toBe('idle');
  });

  it('does not start another run while a refresh is in progress', async () => {
    const { store, start, get } = configureStore();
    store.selectScope(workspaceId, channelId);
    await store.start();

    let completeRefresh:
      | ((value: Either.Either<AnalysisRun, never>) => void)
      | null = null;
    get.mockReturnValueOnce(
      new Promise((resolve) => {
        completeRefresh = resolve;
      })
    );

    const refreshing = store.refresh();

    await expect(store.start()).resolves.toBe(false);
    expect(start).toHaveBeenCalledTimes(1);

    if (completeRefresh === null) {
      throw new Error('Expected the refresh request to be pending.');
    }
    completeRefresh(Either.right(run));
    await expect(refreshing).resolves.toBe(true);
  });

  it('starts with a fresh seven-day historical range', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T12:00:00.000Z'));
    const { store } = configureStore();
    store.selectScope(workspaceId, channelId);

    expect(store.timeRangeStart()).toEqual(
      new Date('2026-08-31T12:00:00.000Z')
    );
    expect(store.timeRangeEnd()).toEqual(new Date('2026-09-07T12:00:00.000Z'));
    expect(store.canStart()).toBe(true);
  });

  it('does not call the API for an invalid draft range', async () => {
    const { store, start } = configureStore();
    store.selectScope(workspaceId, channelId);
    store.setTimeRangeStart(new Date('2026-08-09T12:00:00.000Z'));
    store.setTimeRangeEnd(new Date('2026-08-08T12:00:00.000Z'));

    await expect(store.start()).resolves.toBe(false);

    expect(start).not.toHaveBeenCalled();
    expect(store.error()?.message).toContain('valid past time range');
  });

  it('confirms a proposed candidate and preserves its model output', async () => {
    const { store, start, reviewCandidate } = configureStore();
    start.mockResolvedValueOnce(Either.right(decisionRun));
    store.selectScope(workspaceId, channelId);
    await store.start();

    await expect(
      store.reviewCandidate(
        review.candidateId,
        'confirm',
        '  Confirmed in planning.  '
      )
    ).resolves.toBe(true);

    expect(reviewCandidate).toHaveBeenCalledExactlyOnceWith(
      workspaceId,
      decisionRun.id,
      review.candidateId,
      'confirm',
      'Confirmed in planning.'
    );
    const candidate =
      store.run()?.result?.kind === 'decision-forensics'
        ? store.run()?.result?.candidates[0]
        : undefined;
    expect(candidate).toMatchObject({
      title: 'Release timing',
      status: 'confirmed',
      review: { action: 'confirm' },
    });
    expect(store.reviewingCandidateId()).toBeNull();
  });

  it('reloads canonical review state after a competing review', async () => {
    const { store, start, get, reviewCandidate } = configureStore();
    const rejectedReview = { ...review, action: 'reject' as const };
    const rejectedRun: AnalysisRun = {
      ...decisionRun,
      result:
        decisionRun.result?.kind === 'decision-forensics'
          ? {
              ...decisionRun.result,
              candidates: decisionRun.result.candidates.map((candidate) => ({
                ...candidate,
                status: 'rejected' as const,
                review: rejectedReview,
              })),
            }
          : decisionRun.result,
    };
    start.mockResolvedValueOnce(Either.right(decisionRun));
    reviewCandidate.mockResolvedValueOnce(Either.left({ kind: 'conflict' }));
    get.mockResolvedValueOnce(Either.right(rejectedRun));
    store.selectScope(workspaceId, channelId);
    await store.start();

    await expect(
      store.reviewCandidate(review.candidateId, 'confirm', '')
    ).resolves.toBe(false);

    expect(store.run()).toEqual(rejectedRun);
    expect(store.error()?.message).toContain('already reviewed');
    expect(store.reviewingCandidateId()).toBeNull();
  });
});
