import { Either, Schema } from 'effect';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  WorkspaceArchiveNotAllowedError,
  WorkspaceDepartureNotAllowedError,
  WorkspaceLastOwnerDepartureError,
  WorkspaceRepositoryUnavailableError,
  WorkspaceSlugUnavailableError,
  WorkspaceUpdateNotAllowedError,
  type CreateWorkspaceError,
  type ArchiveWorkspaceError,
  type LeaveWorkspaceError,
  type UpdateWorkspaceError,
  type WorkspaceRepositoryReadError,
} from '@omoikane/application/workspace';
import { WorkspaceIdSchema, type Workspace } from '@omoikane/domain/workspace';
import { WorkspaceApplicationService } from '@client/core/workspace/workspace-application.service';
import { WorkspaceNavigationStore } from './workspace-navigation.store';

const workspaceId = Schema.decodeUnknownSync(WorkspaceIdSchema)(
  '00000000-0000-4000-8000-000000000001'
);

const inaccessibleWorkspaceId = Schema.decodeUnknownSync(WorkspaceIdSchema)(
  '00000000-0000-4000-8000-000000000002'
);

const workspace: Workspace = {
  id: workspaceId,
  name: 'Omoikane Development',
  slug: 'omoikane-development',
  description: null,
};

const createdWorkspace: Workspace = {
  id: Schema.decodeUnknownSync(WorkspaceIdSchema)(
    '00000000-0000-4000-8000-000000000003'
  ),
  name: 'Product Design',
  slug: 'product-design',
  description: 'Design collaboration',
};

const updatedWorkspace: Workspace = {
  ...workspace,
  name: 'Omoikane Community',
  slug: 'omoikane-community',
  description: 'Updated collaboration space',
};

const otherWorkspace: Workspace = {
  id: inaccessibleWorkspaceId,
  name: 'Other Workspace',
  slug: 'other-workspace',
  description: null,
};

const configureStore = (
  result: Either.Either<
    readonly Workspace[],
    WorkspaceRepositoryReadError
  > = Either.right([workspace]),
  creationResult: Either.Either<Workspace, CreateWorkspaceError> = Either.right(
    createdWorkspace
  ),
  updateResult: Either.Either<Workspace, UpdateWorkspaceError> = Either.right(
    updatedWorkspace
  ),
  archiveResult: Either.Either<void, ArchiveWorkspaceError> = Either.right(
    undefined
  ),
  departureResult: Either.Either<void, LeaveWorkspaceError> = Either.right(
    undefined
  )
) => {
  const service = {
    listAccessibleWorkspaces: vi.fn().mockResolvedValue(result),
    observeAccessibleWorkspaces: vi.fn(
      (
        _onWorkspaces: (workspaces: readonly Workspace[]) => void,
        _onError: (error: WorkspaceRepositoryReadError) => void
      ) => {
        void _onWorkspaces;
        void _onError;
        return vi.fn();
      }
    ),
    createWorkspace: vi.fn().mockResolvedValue(creationResult),
    updateWorkspace: vi.fn().mockResolvedValue(updateResult),
    archiveWorkspace: vi.fn().mockResolvedValue(archiveResult),
    leaveWorkspace: vi.fn().mockResolvedValue(departureResult),
  };

  TestBed.configureTestingModule({
    providers: [
      WorkspaceNavigationStore,
      {
        provide: WorkspaceApplicationService,
        useValue: service,
      },
    ],
  });

  return {
    store: TestBed.inject(WorkspaceNavigationStore),
    service,
  };
};

describe('WorkspaceNavigationStore', () => {
  it('loads accessible workspaces once', async () => {
    const { store, service } = configureStore();

    const firstLoad = store.load();
    const concurrentLoad = store.load();

    expect(concurrentLoad).toBe(firstLoad);

    await firstLoad;

    expect(store.workspaces()).toEqual([workspace]);
    expect(store.loadStatus()).toBe('loaded');
    expect(service.listAccessibleWorkspaces).toHaveBeenCalledOnce();
    expect(service.observeAccessibleWorkspaces).toHaveBeenCalledOnce();

    await store.load();

    expect(service.listAccessibleWorkspaces).toHaveBeenCalledOnce();
  });

  it('reconciles realtime access loss and clears an inaccessible selection', async () => {
    const { store, service } = configureStore(
      Either.right([workspace, otherWorkspace])
    );
    await store.load();
    store.select(workspace.id);

    const onWorkspaces = service.observeAccessibleWorkspaces.mock.calls[0]?.[0];
    onWorkspaces?.([otherWorkspace]);

    expect(store.workspaces()).toEqual([otherWorkspace]);
    expect(store.selectedWorkspace()).toBeNull();
    expect(store.realtimeStatus()).toBe('observing');
    expect(store.realtimeError()).toBeNull();
  });

  it('keeps the loaded snapshot and exposes retry after realtime failure', async () => {
    const failure = new WorkspaceRepositoryUnavailableError({
      cause: new Error('Realtime unavailable'),
    });
    const { store, service } = configureStore();
    await store.load();

    const onError = service.observeAccessibleWorkspaces.mock.calls[0]?.[1];
    onError?.(failure);

    expect(store.workspaces()).toEqual([workspace]);
    expect(store.realtimeStatus()).toBe('failed');
    expect(store.realtimeError()).toEqual({
      message:
        'Live workspace access updates are unavailable. Retry to reconnect.',
    });

    store.retryRealtime();

    expect(service.observeAccessibleWorkspaces).toHaveBeenCalledTimes(2);
    expect(store.realtimeStatus()).toBe('observing');
    expect(store.realtimeError()).toBeNull();
  });

  it('reconciles invitation access while initial discovery is in flight', async () => {
    let resolveLoad:
      | ((value: Either.Either<readonly Workspace[], never>) => void)
      | undefined;
    const result = new Promise<Either.Either<readonly Workspace[], never>>(
      (resolve) => {
        resolveLoad = resolve;
      }
    );
    const { store, service } = configureStore();
    service.listAccessibleWorkspaces.mockReturnValue(result);

    const loading = store.load();
    store.includeAccessibleWorkspace(createdWorkspace);
    resolveLoad?.(Either.right([workspace]));
    await loading;

    expect(store.workspaces()).toEqual([workspace, createdWorkspace]);
  });

  it('exposes a safe error and permits retry', async () => {
    const failure = new WorkspaceRepositoryUnavailableError({
      cause: new Error('Provider unavailable'),
    });

    const { store, service } = configureStore(Either.left(failure));

    await store.load();

    expect(store.loadStatus()).toBe('failed');
    expect(store.error()).toEqual({
      message: 'Workspaces are currently unavailable. Please try again.',
    });

    service.listAccessibleWorkspaces.mockResolvedValueOnce(
      Either.right([workspace])
    );

    await store.load();

    expect(store.loadStatus()).toBe('loaded');
    expect(store.workspaces()).toEqual([workspace]);
  });

  it('selects only a currently accessible workspace', async () => {
    const { store } = configureStore();

    await store.load();

    expect(store.select(inaccessibleWorkspaceId)).toBe(false);
    expect(store.selectedWorkspace()).toBeNull();

    expect(store.select(workspaceId)).toBe(true);
    expect(store.selectedWorkspace()).toEqual(workspace);

    store.clearSelection();

    expect(store.selectedWorkspace()).toBeNull();
  });

  it('inserts the canonical created workspace into navigation', async () => {
    const { store, service } = configureStore();

    await store.load();

    const result = await store.createWorkspace({
      name: ' Product Design ',
      slug: ' Product-Design ',
      description: ' Design collaboration ',
    });

    expect(service.createWorkspace).toHaveBeenCalledExactlyOnceWith({
      name: ' Product Design ',
      slug: ' Product-Design ',
      description: ' Design collaboration ',
    });
    expect(result).toBe(createdWorkspace);
    expect(store.workspaces()).toEqual([workspace, createdWorkspace]);
    expect(store.creationStatus()).toBe('idle');
    expect(store.creationError()).toBeNull();
  });

  it('retains navigation and exposes an actionable slug conflict', async () => {
    const failure = new WorkspaceSlugUnavailableError({
      slug: 'product-design',
    });
    const { store } = configureStore(
      Either.right([workspace]),
      Either.left(failure)
    );

    await store.load();
    const result = await store.createWorkspace({
      name: 'Product Design',
      slug: 'product-design',
    });

    expect(result).toBeNull();
    expect(store.workspaces()).toEqual([workspace]);
    expect(store.creationStatus()).toBe('failed');
    expect(store.creationError()).toEqual({
      message: 'That workspace URL is already in use.',
    });

    store.clearCreationError();

    expect(store.creationStatus()).toBe('idle');
    expect(store.creationError()).toBeNull();
  });

  it('replaces the selected workspace with the canonical update result', async () => {
    const { store, service } = configureStore();
    await store.load();
    store.select(workspace.id);

    const update = store.updateSelectedWorkspace({
      name: ' Omoikane Community ',
      slug: ' Omoikane-Community ',
      description: ' Updated collaboration space ',
    });

    expect(store.view().operations.isUpdating).toBe(true);
    await expect(update).resolves.toBe(updatedWorkspace);
    expect(service.updateWorkspace).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.id,
      name: ' Omoikane Community ',
      slug: ' Omoikane-Community ',
      description: ' Updated collaboration space ',
    });
    expect(store.workspaces()).toEqual([updatedWorkspace]);
    expect(store.selectedWorkspace()).toBe(updatedWorkspace);
    expect(store.updateStatus()).toBe('idle');
    expect(store.updateError()).toBeNull();
  });

  it.each([
    [
      new WorkspaceSlugUnavailableError({ slug: updatedWorkspace.slug }),
      'That workspace URL is already in use.',
    ],
    [
      new WorkspaceUpdateNotAllowedError({ workspaceId: workspace.id }),
      'You no longer have permission to edit this workspace.',
    ],
  ])('retains navigation and presents $._tag', async (failure, message) => {
    const { store } = configureStore(
      Either.right([workspace]),
      undefined,
      Either.left(failure)
    );
    await store.load();
    store.select(workspace.id);

    await expect(
      store.updateSelectedWorkspace({
        name: updatedWorkspace.name,
        slug: updatedWorkspace.slug,
        description: updatedWorkspace.description,
      })
    ).resolves.toBeNull();

    expect(store.workspaces()).toEqual([workspace]);
    expect(store.updateStatus()).toBe('failed');
    expect(store.updateError()).toEqual({ message });

    store.clearUpdateError();
    expect(store.updateStatus()).toBe('idle');
    expect(store.updateError()).toBeNull();
  });

  it('ignores an update result after selection moves elsewhere and back', async () => {
    let resolveUpdate:
      | ((result: Either.Either<Workspace, never>) => void)
      | undefined;
    const updateResult = new Promise<Either.Either<Workspace, never>>(
      (resolve) => {
        resolveUpdate = resolve;
      }
    );
    const { store, service } = configureStore(
      Either.right([workspace, otherWorkspace])
    );
    service.updateWorkspace.mockReturnValue(updateResult);
    await store.load();
    store.select(workspace.id);

    const staleUpdate = store.updateSelectedWorkspace({
      name: updatedWorkspace.name,
      slug: updatedWorkspace.slug,
      description: updatedWorkspace.description,
    });
    store.select(otherWorkspace.id);
    store.select(workspace.id);
    resolveUpdate?.(Either.right(updatedWorkspace));

    await expect(staleUpdate).resolves.toBeNull();
    expect(store.workspaces()).toEqual([workspace, otherWorkspace]);
    expect(store.updateStatus()).toBe('idle');
  });

  it('removes an archived workspace and clears its selection', async () => {
    const { store, service } = configureStore(
      Either.right([workspace, otherWorkspace])
    );
    await store.load();
    store.select(workspace.id);

    const archive = store.archiveSelectedWorkspace();

    expect(store.view().operations.isArchiving).toBe(true);
    expect(store.archivingWorkspaceId()).toBe(workspace.id);
    await expect(archive).resolves.toBe(workspace.id);
    expect(service.archiveWorkspace).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.id,
    });
    expect(store.workspaces()).toEqual([otherWorkspace]);
    expect(store.selectedWorkspace()).toBeNull();
    expect(store.archiveStatus()).toBe('idle');
    expect(store.archiveError()).toBeNull();

    const onWorkspaces = service.observeAccessibleWorkspaces.mock.calls[0]?.[0];
    onWorkspaces?.([workspace, otherWorkspace]);

    expect(store.workspaces()).toEqual([otherWorkspace]);
  });

  it('retains navigation and presents a forbidden archive', async () => {
    const failure = new WorkspaceArchiveNotAllowedError({
      workspaceId: workspace.id,
    });
    const { store } = configureStore(
      Either.right([workspace]),
      undefined,
      undefined,
      Either.left(failure)
    );
    await store.load();
    store.select(workspace.id);

    await expect(store.archiveSelectedWorkspace()).resolves.toBeNull();

    expect(store.workspaces()).toEqual([workspace]);
    expect(store.selectedWorkspace()).toBe(workspace);
    expect(store.archiveStatus()).toBe('failed');
    expect(store.archiveError()).toEqual({
      message: 'You no longer have permission to archive this workspace.',
    });

    store.clearArchiveError();
    expect(store.archiveStatus()).toBe('idle');
    expect(store.archiveError()).toBeNull();
  });

  it('reconciles a successful archive without disturbing a newer selection', async () => {
    let resolveArchive:
      | ((result: Either.Either<void, never>) => void)
      | undefined;
    const archiveResult = new Promise<Either.Either<void, never>>((resolve) => {
      resolveArchive = resolve;
    });
    const { store, service } = configureStore(
      Either.right([workspace, otherWorkspace])
    );
    service.archiveWorkspace.mockReturnValue(archiveResult);
    await store.load();
    store.select(workspace.id);

    const archive = store.archiveSelectedWorkspace();
    store.select(otherWorkspace.id);
    resolveArchive?.(Either.right(undefined));

    await expect(archive).resolves.toBe(workspace.id);
    expect(store.workspaces()).toEqual([otherWorkspace]);
    expect(store.selectedWorkspace()).toBe(otherWorkspace);
    expect(store.archiveStatus()).toBe('idle');
  });

  it('discards an archive failure after selection changes', async () => {
    const failure = new WorkspaceArchiveNotAllowedError({
      workspaceId: workspace.id,
    });
    let resolveArchive:
      | ((result: Either.Either<void, ArchiveWorkspaceError>) => void)
      | undefined;
    const archiveResult = new Promise<
      Either.Either<void, ArchiveWorkspaceError>
    >((resolve) => {
      resolveArchive = resolve;
    });
    const { store, service } = configureStore(
      Either.right([workspace, otherWorkspace])
    );
    service.archiveWorkspace.mockReturnValue(archiveResult);
    await store.load();
    store.select(workspace.id);

    const archive = store.archiveSelectedWorkspace();
    store.select(otherWorkspace.id);
    resolveArchive?.(Either.left(failure));

    await expect(archive).resolves.toBeNull();
    expect(store.workspaces()).toEqual([workspace, otherWorkspace]);
    expect(store.selectedWorkspace()).toBe(otherWorkspace);
    expect(store.archiveStatus()).toBe('idle');
    expect(store.archiveError()).toBeNull();
  });

  it('removes a departed workspace and clears its selection', async () => {
    const { store, service } = configureStore(
      Either.right([workspace, otherWorkspace])
    );
    await store.load();
    store.select(workspace.id);

    const departure = store.leaveSelectedWorkspace();

    expect(store.view().operations.isLeaving).toBe(true);
    expect(store.departingWorkspaceId()).toBe(workspace.id);
    await expect(departure).resolves.toBe(workspace.id);
    expect(service.leaveWorkspace).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.id,
    });
    expect(store.workspaces()).toEqual([otherWorkspace]);
    expect(store.selectedWorkspace()).toBeNull();
    expect(store.departureStatus()).toBe('idle');
    expect(store.departureError()).toBeNull();
  });

  it.each([
    [
      new WorkspaceLastOwnerDepartureError({ workspaceId: workspace.id }),
      'Assign another active owner before leaving this workspace.',
    ],
    [
      new WorkspaceDepartureNotAllowedError({ workspaceId: workspace.id }),
      'You can no longer leave this workspace.',
    ],
  ])('retains navigation and presents $._tag', async (failure, message) => {
    const { store } = configureStore(
      Either.right([workspace]),
      undefined,
      undefined,
      undefined,
      Either.left(failure)
    );
    await store.load();
    store.select(workspace.id);

    await expect(store.leaveSelectedWorkspace()).resolves.toBeNull();

    expect(store.workspaces()).toEqual([workspace]);
    expect(store.selectedWorkspace()).toBe(workspace);
    expect(store.departureStatus()).toBe('failed');
    expect(store.departureError()).toEqual({ message });

    store.clearDepartureError();
    expect(store.departureStatus()).toBe('idle');
    expect(store.departureError()).toBeNull();
  });

  it('reconciles a successful departure without disturbing a newer selection', async () => {
    let resolveDeparture:
      | ((result: Either.Either<void, never>) => void)
      | undefined;
    const departureResult = new Promise<Either.Either<void, never>>(
      (resolve) => {
        resolveDeparture = resolve;
      }
    );
    const { store, service } = configureStore(
      Either.right([workspace, otherWorkspace])
    );
    service.leaveWorkspace.mockReturnValue(departureResult);
    await store.load();
    store.select(workspace.id);

    const departure = store.leaveSelectedWorkspace();
    store.select(otherWorkspace.id);
    resolveDeparture?.(Either.right(undefined));

    await expect(departure).resolves.toBe(workspace.id);
    expect(store.workspaces()).toEqual([otherWorkspace]);
    expect(store.selectedWorkspace()).toBe(otherWorkspace);
    expect(store.departureStatus()).toBe('idle');
  });

  it('discards a departure failure after selection changes', async () => {
    const failure = new WorkspaceDepartureNotAllowedError({
      workspaceId: workspace.id,
    });
    let resolveDeparture:
      | ((result: Either.Either<void, LeaveWorkspaceError>) => void)
      | undefined;
    const departureResult = new Promise<
      Either.Either<void, LeaveWorkspaceError>
    >((resolve) => {
      resolveDeparture = resolve;
    });
    const { store, service } = configureStore(
      Either.right([workspace, otherWorkspace])
    );
    service.leaveWorkspace.mockReturnValue(departureResult);
    await store.load();
    store.select(workspace.id);

    const departure = store.leaveSelectedWorkspace();
    store.select(otherWorkspace.id);
    resolveDeparture?.(Either.left(failure));

    await expect(departure).resolves.toBeNull();
    expect(store.workspaces()).toEqual([workspace, otherWorkspace]);
    expect(store.selectedWorkspace()).toBe(otherWorkspace);
    expect(store.departureStatus()).toBe('idle');
    expect(store.departureError()).toBeNull();
  });
});
