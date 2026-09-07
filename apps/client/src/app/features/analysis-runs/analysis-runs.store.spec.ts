import { TestBed } from '@angular/core/testing';
import { Either, Schema } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalysisRunSchema, type AnalysisRun } from '@omoikane/domain/analysis';
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
  requestedBy: '10000000-0000-4000-8000-000000000001',
  status: 'created',
  failureCategory: null,
  result: null,
  createdAt: new Date('2026-08-09T12:00:00.000Z'),
});

const withStatus = (
  status: AnalysisRun['status'],
  failureCategory: string | null = null
): AnalysisRun => ({ ...run, status, failureCategory });

const configureStore = () => {
  const start = vi.fn().mockResolvedValue(Either.right(run));
  const get = vi.fn().mockResolvedValue(Either.right(run));
  TestBed.configureTestingModule({
    providers: [
      AnalysisRunsStore,
      { provide: AnalysisRunApiService, useValue: { start, get } },
    ],
  });
  return { store: TestBed.inject(AnalysisRunsStore), start, get };
};

describe('AnalysisRunsStore', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('starts and retains the canonical run for the selected channel', async () => {
    const { store, start } = configureStore();
    store.selectScope(workspaceId, channelId);

    await expect(store.start()).resolves.toBe(true);

    expect(start).toHaveBeenCalledExactlyOnceWith(workspaceId, channelId);
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
});
