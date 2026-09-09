import { TestBed } from '@angular/core/testing';
import { Either, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import {
  WorkspaceRepositoryUnavailableError,
  WorkspaceRestoreNotAllowedError,
} from '@omoikane/application/workspace';
import {
  ArchivedWorkspaceSchema,
  type ArchivedWorkspace,
} from '@omoikane/domain/workspace';
import { WorkspaceApplicationService } from '@client/core/workspace/workspace-application.service';
import { ArchivedWorkspaceListStore } from './archived-workspace-list.store';

const workspace: ArchivedWorkspace = Schema.decodeUnknownSync(
  ArchivedWorkspaceSchema
)({
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Archived Omoikane',
  slug: 'archived-omoikane',
  description: null,
  archivedAt: '2026-08-08T09:00:00.000Z',
});

const restoredWorkspace = {
  id: workspace.id,
  name: workspace.name,
  slug: workspace.slug,
  description: workspace.description,
};

const configureStore = (
  result = Either.right([workspace]),
  restorationResult = Either.right(restoredWorkspace)
) => {
  const listArchivedWorkspaces = vi.fn().mockResolvedValue(result);
  const restoreWorkspace = vi.fn().mockResolvedValue(restorationResult);

  TestBed.configureTestingModule({
    providers: [
      ArchivedWorkspaceListStore,
      {
        provide: WorkspaceApplicationService,
        useValue: { listArchivedWorkspaces, restoreWorkspace },
      },
    ],
  });

  return {
    store: TestBed.inject(ArchivedWorkspaceListStore),
    listArchivedWorkspaces,
    restoreWorkspace,
  };
};

describe('ArchivedWorkspaceListStore', () => {
  it('loads archived projections without active selection state', async () => {
    const { store, listArchivedWorkspaces } = configureStore();

    await store.load();

    expect(store.workspaces()).toEqual([workspace]);
    expect(store.loadStatus()).toBe('loaded');
    expect(store.view().content).toEqual({
      kind: 'workspaces',
      workspaces: [workspace],
    });
    expect(listArchivedWorkspaces).toHaveBeenCalledOnce();
  });

  it('presents a safe retryable read failure', async () => {
    const { store } = configureStore(
      Either.left(new WorkspaceRepositoryUnavailableError({ cause: 'offline' }))
    );

    await store.load();

    expect(store.loadStatus()).toBe('failed');
    expect(store.error()?.message).toContain('could not be loaded');
  });

  it('does not reload an already loaded collection', async () => {
    const { store, listArchivedWorkspaces } = configureStore();

    await store.load();
    await store.load();

    expect(listArchivedWorkspaces).toHaveBeenCalledOnce();
  });

  it('reloads after a local archive changes the projection', async () => {
    const { store, listArchivedWorkspaces } = configureStore();

    await store.load();
    await store.load(true);

    expect(listArchivedWorkspaces).toHaveBeenCalledTimes(2);
  });

  it('restores and removes one archived projection', async () => {
    const { store, restoreWorkspace } = configureStore();
    await store.load();

    const result = await store.restore(workspace.id);

    expect(result).toEqual(restoredWorkspace);
    expect(store.workspaces()).toEqual([]);
    expect(store.restorationStatus()).toBe('idle');
    expect(restoreWorkspace).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.id,
    });
  });

  it('keeps the archived projection after a rejected restoration', async () => {
    const { store } = configureStore(
      Either.right([workspace]),
      Either.left(
        new WorkspaceRestoreNotAllowedError({ workspaceId: workspace.id })
      )
    );
    await store.load();

    expect(await store.restore(workspace.id)).toBeNull();
    expect(store.workspaces()).toEqual([workspace]);
    expect(store.restorationStatus()).toBe('failed');
    expect(store.restorationError()?.message).toContain('owner access');
  });
});
