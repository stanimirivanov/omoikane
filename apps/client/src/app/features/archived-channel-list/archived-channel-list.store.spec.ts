import { TestBed } from '@angular/core/testing';
import { Either, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import {
  ChannelRepositoryUnavailableError,
  ChannelRestoreNotAllowedError,
} from '@omoikane/application/channel';
import {
  ArchivedChannelSchema,
  type ArchivedChannel,
} from '@omoikane/domain/channel';
import { WorkspaceIdSchema } from '@omoikane/domain/workspace';
import { ChannelApplicationService } from '@client/core/channel/channel-application.service';
import { ArchivedChannelListStore } from './archived-channel-list.store';

const workspaceId = Schema.decodeUnknownSync(WorkspaceIdSchema)(
  '00000000-0000-4000-8000-000000000001'
);
const nextWorkspaceId = Schema.decodeUnknownSync(WorkspaceIdSchema)(
  '00000000-0000-4000-8000-000000000009'
);
const channel: ArchivedChannel = Schema.decodeUnknownSync(
  ArchivedChannelSchema
)({
  id: '00000000-0000-4000-8000-000000000002',
  workspaceId,
  name: 'Planning',
  slug: 'planning',
  description: null,
  archivedAt: '2026-08-08T14:00:00.000Z',
});

const restoredChannel = {
  id: channel.id,
  workspaceId,
  name: channel.name,
  slug: channel.slug,
  description: channel.description,
};

const configureStore = (
  listResult = Either.right([channel]),
  restoreResult = Either.right(restoredChannel)
) => {
  const listArchivedWorkspaceChannels = vi.fn().mockResolvedValue(listResult);
  const restoreChannel = vi.fn().mockResolvedValue(restoreResult);

  TestBed.configureTestingModule({
    providers: [
      ArchivedChannelListStore,
      {
        provide: ChannelApplicationService,
        useValue: { listArchivedWorkspaceChannels, restoreChannel },
      },
    ],
  });

  return {
    store: TestBed.inject(ArchivedChannelListStore),
    listArchivedWorkspaceChannels,
    restoreChannel,
  };
};

describe('ArchivedChannelListStore', () => {
  it('loads the owner-visible archive projection', async () => {
    const { store, listArchivedWorkspaceChannels } = configureStore();

    await store.load(workspaceId);

    expect(store.channels()).toEqual([channel]);
    expect(store.loadStatus()).toBe('loaded');
    expect(listArchivedWorkspaceChannels).toHaveBeenCalledExactlyOnceWith(
      workspaceId
    );
  });

  it('presents a safe retryable repository failure', async () => {
    const { store } = configureStore(
      Either.left(new ChannelRepositoryUnavailableError({ cause: 'offline' }))
    );

    await store.load(workspaceId);

    expect(store.loadStatus()).toBe('failed');
    expect(store.error()?.message).toContain('could not be loaded');
  });

  it('reloads when active channel identities change', async () => {
    const { store, listArchivedWorkspaceChannels } = configureStore();

    await store.load(workspaceId);
    await store.load(workspaceId, true);

    expect(listArchivedWorkspaceChannels).toHaveBeenCalledTimes(2);
  });

  it('restores one listed channel and removes its archived projection', async () => {
    const { store, restoreChannel } = configureStore();
    await store.load(workspaceId);

    const restoration = store.restore(channel.id);

    expect(store.view().isRestoring).toBe(true);
    expect(store.restoringChannelId()).toBe(channel.id);
    await expect(restoration).resolves.toEqual(restoredChannel);
    expect(restoreChannel).toHaveBeenCalledExactlyOnceWith({
      channelId: channel.id,
    });
    expect(store.channels()).toEqual([]);
    expect(store.restorationStatus()).toBe('idle');
  });

  it('keeps archive history and presents a restoration rejection', async () => {
    const failure = new ChannelRestoreNotAllowedError({
      channelId: channel.id,
    });
    const { store } = configureStore(undefined, Either.left(failure));
    await store.load(workspaceId);

    await expect(store.restore(channel.id)).resolves.toBeNull();

    expect(store.channels()).toEqual([channel]);
    expect(store.restorationStatus()).toBe('failed');
    expect(store.restorationError()?.message).toContain('cannot be restored');

    store.clearRestorationError();
    expect(store.restorationStatus()).toBe('idle');
  });

  it('discards a restoration completion after the workspace changes', async () => {
    let resolveRestoration:
      | ((result: Either.Either<typeof restoredChannel, never>) => void)
      | undefined;
    const restoration = new Promise<
      Either.Either<typeof restoredChannel, never>
    >((resolve) => {
      resolveRestoration = resolve;
    });
    const configured = configureStore();
    configured.restoreChannel.mockReturnValueOnce(restoration);
    await configured.store.load(workspaceId);
    configured.listArchivedWorkspaceChannels.mockResolvedValueOnce(
      Either.right([])
    );

    const command = configured.store.restore(channel.id);
    await configured.store.load(nextWorkspaceId);
    resolveRestoration?.(Either.right(restoredChannel));

    await expect(command).resolves.toBeNull();
    expect(configured.store.workspaceId()).toBe(nextWorkspaceId);
    expect(configured.store.restorationStatus()).toBe('idle');
  });
});
