import { TestBed } from '@angular/core/testing';
import { Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { ProfileIdSchema } from '@omoikane/domain/profile';
import { WorkspaceIdSchema } from '@omoikane/domain/workspace';
import { WorkspaceApplicationService } from '@client/core/workspace/workspace-application.service';
import { WorkspacePresenceStore } from './workspace-presence.store';

const workspaceId = Schema.decodeUnknownSync(WorkspaceIdSchema)(
  '00000000-0000-4000-8000-000000000001'
);
const nextWorkspaceId = Schema.decodeUnknownSync(WorkspaceIdSchema)(
  '00000000-0000-4000-8000-000000000002'
);
const profileId = Schema.decodeUnknownSync(ProfileIdSchema)(
  '10000000-0000-4000-8000-000000000001'
);

const configureStore = () => {
  const observations: Array<{
    readonly workspaceId: typeof workspaceId;
    readonly onPresence: (profileIds: readonly (typeof profileId)[]) => void;
    readonly onError: () => void;
    readonly cleanup: ReturnType<typeof vi.fn>;
  }> = [];
  const observeWorkspacePresence = vi.fn(
    (
      observedWorkspaceId: typeof workspaceId,
      onPresence: (profileIds: readonly (typeof profileId)[]) => void,
      onError: () => void
    ) => {
      const cleanup = vi.fn();
      observations.push({
        workspaceId: observedWorkspaceId,
        onPresence,
        onError,
        cleanup,
      });
      return cleanup;
    }
  );

  TestBed.configureTestingModule({
    providers: [
      WorkspacePresenceStore,
      {
        provide: WorkspaceApplicationService,
        useValue: { observeWorkspacePresence },
      },
    ],
  });

  return {
    store: TestBed.inject(WorkspacePresenceStore),
    observations,
    observeWorkspacePresence,
  };
};

describe('WorkspacePresenceStore', () => {
  it('connects and applies the latest online identity snapshot', () => {
    const { store, observations, observeWorkspacePresence } = configureStore();

    store.observe(workspaceId);

    expect(store.status()).toBe('connecting');
    expect(observeWorkspacePresence).toHaveBeenCalledOnce();
    observations[0]?.onPresence([profileId]);

    expect(store.status()).toBe('observing');
    expect(store.onlineProfileIds()).toEqual([profileId]);
    expect(store.view()).toEqual({ kind: 'online', count: 1 });
  });

  it('releases the old workspace and ignores its stale snapshot', () => {
    const { store, observations } = configureStore();
    store.observe(workspaceId);
    const first = observations[0];

    store.observe(nextWorkspaceId);
    first?.onPresence([profileId]);

    expect(first?.cleanup).toHaveBeenCalledOnce();
    expect(store.workspaceId()).toBe(nextWorkspaceId);
    expect(store.onlineProfileIds()).toEqual([]);
  });

  it('exposes a safe failure and reconnects on retry', () => {
    const { store, observations, observeWorkspacePresence } = configureStore();
    store.observe(workspaceId);

    observations[0]?.onError();

    expect(store.status()).toBe('failed');
    expect(store.error()?.message).toContain('currently unavailable');

    store.retry();

    expect(store.status()).toBe('connecting');
    expect(observeWorkspacePresence).toHaveBeenCalledTimes(2);
  });
});
