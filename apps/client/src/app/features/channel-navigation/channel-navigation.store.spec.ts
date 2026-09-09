import { Either, Schema } from 'effect';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  ChannelArchiveNotAllowedError,
  ChannelUpdateNotAllowedError,
  ChannelRepositoryUnavailableError,
  ChannelSlugUnavailableError,
  type UpdatedChannelDetails,
  type ArchiveChannelError,
  type UpdateChannelError,
} from '@omoikane/application/channel';
import { ChannelIdSchema, type Channel } from '@omoikane/domain/channel';
import { MessageIdSchema } from '@omoikane/domain/message';
import { WorkspaceIdSchema } from '@omoikane/domain/workspace';
import { ChannelApplicationService } from '@client/core/channel/channel-application.service';
import { MessageApplicationService } from '@client/core/message/message-application.service';
import { ChannelNavigationStore } from './channel-navigation.store';

const workspaceId = Schema.decodeUnknownSync(WorkspaceIdSchema)(
  '00000000-0000-4000-8000-000000000001'
);
const nextWorkspaceId = Schema.decodeUnknownSync(WorkspaceIdSchema)(
  '00000000-0000-4000-8000-000000000002'
);
const channelId = Schema.decodeUnknownSync(ChannelIdSchema)(
  '00000000-0000-4000-8000-000000000003'
);
const messageId = Schema.decodeUnknownSync(MessageIdSchema)(
  '00000000-0000-4000-8000-000000000006'
);

const channel: Channel = {
  id: channelId,
  workspaceId,
  name: 'General',
  slug: 'general',
  description: null,
};

const createdChannelId = Schema.decodeUnknownSync(ChannelIdSchema)(
  '00000000-0000-4000-8000-000000000005'
);
const createdChannel: Channel = {
  id: createdChannelId,
  workspaceId,
  name: 'Design',
  slug: 'design',
  description: 'Design collaboration',
};

const updatedChannel: Channel = {
  ...channel,
  name: 'Product Design',
  description: 'Design collaboration',
};

const updatedDetails: UpdatedChannelDetails = {
  channelId,
  name: updatedChannel.name,
  description: updatedChannel.description,
};

const makeObserveWorkspaceChannels = (cleanup = vi.fn()) =>
  vi.fn<ChannelApplicationService['observeWorkspaceChannels']>(() => cleanup);

const makeObserveWorkspaceUnreadCounts = (cleanup = vi.fn()) =>
  vi.fn<MessageApplicationService['observeWorkspaceChannelUnreadCounts']>(
    () => cleanup
  );

const configureStore = (
  listWorkspaceChannels = vi.fn().mockResolvedValue(Either.right([channel])),
  createChannel = vi.fn().mockResolvedValue(Either.right(createdChannel)),
  updateChannel = vi.fn().mockResolvedValue(Either.right(updatedDetails)),
  archiveChannel = vi.fn().mockResolvedValue(Either.right(undefined)),
  observeWorkspaceChannels = makeObserveWorkspaceChannels(),
  listWorkspaceChannelUnreadCounts = vi
    .fn()
    .mockResolvedValue(Either.right([])),
  markChannelRead = vi.fn().mockResolvedValue(Either.right(undefined)),
  observeWorkspaceChannelUnreadCounts = makeObserveWorkspaceUnreadCounts()
) => {
  TestBed.configureTestingModule({
    providers: [
      ChannelNavigationStore,
      {
        provide: ChannelApplicationService,
        useValue: {
          archiveChannel,
          createChannel,
          listWorkspaceChannels,
          observeWorkspaceChannels,
          updateChannel,
        },
      },
      {
        provide: MessageApplicationService,
        useValue: {
          listWorkspaceChannelUnreadCounts,
          markChannelRead,
          observeWorkspaceChannelUnreadCounts,
        },
      },
    ],
  });

  return {
    store: TestBed.inject(ChannelNavigationStore),
    createChannel,
    archiveChannel,
    listWorkspaceChannels,
    observeWorkspaceChannels,
    updateChannel,
    listWorkspaceChannelUnreadCounts,
    markChannelRead,
    observeWorkspaceChannelUnreadCounts,
  };
};

describe('ChannelNavigationStore', () => {
  it('loads each workspace once and selects only a loaded channel', async () => {
    const { store, listWorkspaceChannels } = configureStore();

    const firstLoad = store.load(workspaceId);
    expect(store.load(workspaceId)).toBe(firstLoad);
    await firstLoad;

    expect(store.channels()).toEqual([channel]);
    expect(store.select(channelId)).toBe(true);
    expect(store.selectedChannel()).toEqual(channel);

    store.clearSelection();
    expect(store.selectedChannel()).toBeNull();

    await store.load(workspaceId);
    expect(listWorkspaceChannels).toHaveBeenCalledOnce();

    const unknownChannelId = Schema.decodeUnknownSync(ChannelIdSchema)(
      '00000000-0000-4000-8000-000000000004'
    );
    expect(store.select(unknownChannelId)).toBe(false);
  });

  it('loads unread counts and clears a channel after successful selection', async () => {
    const listWorkspaceChannelUnreadCounts = vi
      .fn()
      .mockResolvedValue(
        Either.right([{ channelId, unreadCount: 3 }] as const)
      );
    const markChannelRead = vi.fn().mockResolvedValue(Either.right(undefined));
    const { store } = configureStore(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      listWorkspaceChannelUnreadCounts,
      markChannelRead
    );

    await store.load(workspaceId);

    expect(store.unreadCountByChannel().get(channelId)).toBe(3);
    expect(store.select(channelId)).toBe(true);
    await store.markChannelRead({ channelId, messageId });

    await vi.waitFor(() => {
      expect(markChannelRead).toHaveBeenCalledWith({ channelId, messageId });
      expect(store.unreadCountByChannel().get(channelId)).toBe(0);
    });
  });

  it('keeps channel navigation available when unread counts fail', async () => {
    const { store } = configureStore(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      vi.fn().mockResolvedValue(Either.left(new Error('unavailable')))
    );

    await store.load(workspaceId);

    expect(store.channels()).toEqual([channel]);
    expect(store.loadStatus()).toBe('loaded');
    expect(store.unreadStatus()).toBe('failed');
    expect(store.unreadError()).not.toBeNull();
  });

  it('retries a failed exact read-position command', async () => {
    const markChannelRead = vi
      .fn()
      .mockResolvedValueOnce(Either.left(new Error('unavailable')))
      .mockResolvedValueOnce(Either.right(undefined));
    const { store } = configureStore(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      vi
        .fn()
        .mockResolvedValue(
          Either.right([{ channelId, unreadCount: 2 }] as const)
        ),
      markChannelRead
    );
    await store.load(workspaceId);

    await store.markChannelRead({ channelId, messageId });
    expect(store.unreadError()).not.toBeNull();

    await store.retryUnreadCounts();

    expect(markChannelRead).toHaveBeenCalledTimes(2);
    expect(store.unreadError()).toBeNull();
    expect(store.unreadCountByChannel().get(channelId)).toBe(0);
  });

  it('reconciles realtime create, update, and archive snapshots', async () => {
    const stop = vi.fn();
    const observeWorkspaceChannels = makeObserveWorkspaceChannels(stop);
    const { store } = configureStore(
      undefined,
      undefined,
      undefined,
      undefined,
      observeWorkspaceChannels
    );
    await store.load(workspaceId);
    store.select(channelId);

    const onChannels = observeWorkspaceChannels.mock.calls[0]?.[1];
    onChannels?.([createdChannel, updatedChannel]);

    expect(store.channels()).toEqual([createdChannel, updatedChannel]);
    expect(store.selectedChannel()).toEqual(updatedChannel);

    onChannels?.([createdChannel]);

    expect(store.channels()).toEqual([createdChannel]);
    expect(store.selectedChannel()).toBeNull();
    expect(store.realtimeStatus()).toBe('observing');
    expect(store.realtimeError()).toBeNull();
  });

  it('includes a restored channel across the next stale realtime snapshot', async () => {
    const observeWorkspaceChannels = makeObserveWorkspaceChannels();
    const { store } = configureStore(
      undefined,
      undefined,
      undefined,
      undefined,
      observeWorkspaceChannels
    );
    await store.load(workspaceId);

    expect(store.includeRestoredChannel(createdChannel)).toBe(true);
    expect(store.channels()).toEqual([createdChannel, channel]);

    const onChannels = observeWorkspaceChannels.mock.calls[0]?.[1];
    onChannels?.([channel]);

    expect(store.channels()).toEqual([createdChannel, channel]);
    expect(
      store.includeRestoredChannel({
        ...createdChannel,
        workspaceId: nextWorkspaceId,
      })
    ).toBe(false);
  });

  it('releases the old workspace listener and ignores its late snapshot', async () => {
    const cleanups = [vi.fn(), vi.fn()];
    const observeWorkspaceChannels = vi
      .fn()
      .mockReturnValueOnce(cleanups[0])
      .mockReturnValueOnce(cleanups[1]);
    const listWorkspaceChannels = vi
      .fn()
      .mockResolvedValueOnce(Either.right([channel]))
      .mockResolvedValueOnce(Either.right([]));
    const { store } = configureStore(
      listWorkspaceChannels,
      undefined,
      undefined,
      undefined,
      observeWorkspaceChannels
    );
    await store.load(workspaceId);
    const oldSnapshot = observeWorkspaceChannels.mock.calls[0]?.[1];

    await store.load(nextWorkspaceId);
    oldSnapshot?.([channel]);

    expect(cleanups[0]).toHaveBeenCalledOnce();
    expect(store.workspaceId()).toBe(nextWorkspaceId);
    expect(store.channels()).toEqual([]);
  });

  it('keeps loaded channels visible and retries a failed observation', async () => {
    const observeWorkspaceChannels = makeObserveWorkspaceChannels();
    const { store } = configureStore(
      undefined,
      undefined,
      undefined,
      undefined,
      observeWorkspaceChannels
    );
    await store.load(workspaceId);

    const onError = observeWorkspaceChannels.mock.calls[0]?.[2];
    onError?.(
      new ChannelRepositoryUnavailableError({
        cause: new Error('Realtime unavailable'),
      })
    );

    expect(store.channels()).toEqual([channel]);
    expect(store.realtimeStatus()).toBe('failed');
    expect(store.realtimeError()).toEqual({
      message: 'Live channel updates are unavailable. Retry to reconnect.',
    });

    store.retryRealtime();
    expect(observeWorkspaceChannels).toHaveBeenCalledTimes(2);
    expect(store.realtimeStatus()).toBe('observing');
  });

  it('reconciles unread snapshots after realtime readiness and changes', async () => {
    const observeWorkspaceChannelUnreadCounts =
      makeObserveWorkspaceUnreadCounts();
    const { store } = configureStore(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      observeWorkspaceChannelUnreadCounts
    );
    await store.load(workspaceId);

    const onCounts = observeWorkspaceChannelUnreadCounts.mock.calls[0]?.[1];
    onCounts?.([{ channelId, unreadCount: 4 }]);

    expect(store.unreadCountByChannel().get(channelId)).toBe(4);
    expect(store.unreadStatus()).toBe('loaded');
    expect(store.unreadRealtimeStatus()).toBe('observing');
    expect(store.unreadRealtimeError()).toBeNull();
  });

  it('releases stale unread observation and ignores its late snapshot', async () => {
    const cleanups = [vi.fn(), vi.fn()];
    const observeWorkspaceChannelUnreadCounts = vi
      .fn<MessageApplicationService['observeWorkspaceChannelUnreadCounts']>()
      .mockReturnValueOnce(cleanups[0])
      .mockReturnValueOnce(cleanups[1]);
    const listWorkspaceChannels = vi
      .fn()
      .mockResolvedValueOnce(Either.right([channel]))
      .mockResolvedValueOnce(Either.right([]));
    const { store } = configureStore(
      listWorkspaceChannels,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      observeWorkspaceChannelUnreadCounts
    );
    await store.load(workspaceId);
    const oldSnapshot = observeWorkspaceChannelUnreadCounts.mock.calls[0]?.[1];

    await store.load(nextWorkspaceId);
    oldSnapshot?.([{ channelId, unreadCount: 8 }]);

    expect(cleanups[0]).toHaveBeenCalledOnce();
    expect(store.workspaceId()).toBe(nextWorkspaceId);
    expect(store.unreadCounts()).toEqual([]);
  });

  it('preserves unread counts and retries failed realtime reconciliation', async () => {
    const observeWorkspaceChannelUnreadCounts =
      makeObserveWorkspaceUnreadCounts();
    const { store } = configureStore(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      vi
        .fn()
        .mockResolvedValue(
          Either.right([{ channelId, unreadCount: 3 }] as const)
        ),
      undefined,
      observeWorkspaceChannelUnreadCounts
    );
    await store.load(workspaceId);

    const onError = observeWorkspaceChannelUnreadCounts.mock.calls[0]?.[2];
    onError?.(new Error('Realtime unavailable') as never);

    expect(store.unreadCountByChannel().get(channelId)).toBe(3);
    expect(store.unreadRealtimeStatus()).toBe('failed');
    expect(store.unreadRealtimeError()).toEqual({
      message: 'Live unread updates are unavailable. Retry to reconnect.',
    });

    store.retryUnreadRealtime();

    expect(observeWorkspaceChannelUnreadCounts).toHaveBeenCalledTimes(2);
    expect(store.unreadRealtimeStatus()).toBe('observing');
  });

  it('exposes a safe error and permits retry', async () => {
    const failure = new ChannelRepositoryUnavailableError({
      cause: new Error('Provider unavailable'),
    });
    const listWorkspaceChannels = vi
      .fn()
      .mockResolvedValueOnce(Either.left(failure))
      .mockResolvedValueOnce(Either.right([channel]));
    const { store } = configureStore(listWorkspaceChannels);

    await store.load(workspaceId);

    expect(store.loadStatus()).toBe('failed');
    expect(store.error()).toEqual({
      message: 'Channels are currently unavailable. Please try again.',
    });

    await store.load(workspaceId);

    expect(store.loadStatus()).toBe('loaded');
    expect(store.channels()).toEqual([channel]);
  });

  it('ignores a stale result after the selected workspace changes', async () => {
    let resolveFirst:
      | ((result: Either.Either<readonly Channel[], never>) => void)
      | undefined;
    const firstResult = new Promise<Either.Either<readonly Channel[], never>>(
      (resolve) => {
        resolveFirst = resolve;
      }
    );
    const listWorkspaceChannels = vi
      .fn()
      .mockReturnValueOnce(firstResult)
      .mockResolvedValueOnce(Either.right([]));
    const { store } = configureStore(listWorkspaceChannels);

    const oldLoad = store.load(workspaceId);
    await store.load(nextWorkspaceId);
    resolveFirst?.(Either.right([channel]));
    await oldLoad;

    expect(store.workspaceId()).toBe(nextWorkspaceId);
    expect(store.channels()).toEqual([]);
    expect(store.loadStatus()).toBe('loaded');
  });

  it('creates, inserts, and returns a channel without changing selection', async () => {
    const { store, createChannel } = configureStore();
    await store.load(workspaceId);
    store.select(channelId);

    const result = await store.createChannel({
      name: 'Design',
      slug: 'design',
      description: 'Design collaboration',
    });

    expect(createChannel).toHaveBeenCalledExactlyOnceWith({
      workspaceId,
      name: 'Design',
      slug: 'design',
      description: 'Design collaboration',
    });
    expect(result).toBe(createdChannel);
    expect(store.channels()).toEqual([createdChannel, channel]);
    expect(store.selectedChannelId()).toBe(channelId);
    expect(store.creationStatus()).toBe('idle');
    expect(store.creationError()).toBeNull();
  });

  it('keeps creation failure separate from the loaded collection', async () => {
    const failure = new ChannelSlugUnavailableError({
      workspaceId,
      slug: 'design',
    });
    const createChannel = vi.fn().mockResolvedValue(Either.left(failure));
    const { store } = configureStore(undefined, createChannel);
    await store.load(workspaceId);

    const result = await store.createChannel({
      name: 'Design',
      slug: 'design',
    });

    expect(result).toBeNull();
    expect(store.loadStatus()).toBe('loaded');
    expect(store.channels()).toEqual([channel]);
    expect(store.creationStatus()).toBe('failed');
    expect(store.creationError()).toEqual({
      message: 'That channel URL is already in use in this workspace.',
    });

    store.clearCreationError();
    expect(store.creationStatus()).toBe('idle');
    expect(store.creationError()).toBeNull();
  });

  it('ignores a channel created after the selected workspace changes', async () => {
    let resolveCreation:
      | ((result: Either.Either<Channel, never>) => void)
      | undefined;
    const creationResult = new Promise<Either.Either<Channel, never>>(
      (resolve) => {
        resolveCreation = resolve;
      }
    );
    const createChannel = vi.fn().mockReturnValue(creationResult);
    const listWorkspaceChannels = vi
      .fn()
      .mockResolvedValueOnce(Either.right([channel]))
      .mockResolvedValueOnce(Either.right([]));
    const { store } = configureStore(listWorkspaceChannels, createChannel);
    await store.load(workspaceId);

    const creation = store.createChannel({ name: 'Design', slug: 'design' });
    await store.load(nextWorkspaceId);
    resolveCreation?.(Either.right(createdChannel));

    expect(await creation).toBeNull();
    expect(store.workspaceId()).toBe(nextWorkspaceId);
    expect(store.channels()).toEqual([]);
    expect(store.creationStatus()).toBe('idle');
  });

  it('updates and reorders the selected channel from normalized details', async () => {
    const { store, updateChannel } = configureStore(
      vi.fn().mockResolvedValue(Either.right([channel, createdChannel]))
    );
    await store.load(workspaceId);
    store.select(channelId);

    const result = await store.updateSelectedChannel({
      name: '  Product Design  ',
      description: '  Design collaboration  ',
    });

    expect(updateChannel).toHaveBeenCalledExactlyOnceWith({
      channelId,
      name: '  Product Design  ',
      description: '  Design collaboration  ',
    });
    expect(result).toEqual(updatedChannel);
    expect(store.channels()).toEqual([createdChannel, updatedChannel]);
    expect(store.selectedChannel()).toEqual(updatedChannel);
    expect(store.updateStatus()).toBe('idle');
    expect(store.updateError()).toBeNull();
  });

  it('keeps update failure separate from the selected channel', async () => {
    const failure = new ChannelUpdateNotAllowedError({ channelId });
    const updateResult: Either.Either<
      UpdatedChannelDetails,
      UpdateChannelError
    > = Either.left(failure);
    const updateChannel = vi.fn().mockResolvedValue(updateResult);
    const { store } = configureStore(undefined, undefined, updateChannel);
    await store.load(workspaceId);
    store.select(channelId);

    await expect(
      store.updateSelectedChannel({ name: 'Product Design' })
    ).resolves.toBeNull();

    expect(store.channels()).toEqual([channel]);
    expect(store.selectedChannel()).toEqual(channel);
    expect(store.updateStatus()).toBe('failed');
    expect(store.updateError()).toEqual({
      message: 'You no longer have permission to edit this channel.',
    });

    store.clearUpdateError();
    expect(store.updateStatus()).toBe('idle');
    expect(store.updateError()).toBeNull();
  });

  it('ignores an update after navigation moves away and back', async () => {
    let resolveUpdate:
      | ((result: Either.Either<UpdatedChannelDetails, never>) => void)
      | undefined;
    const updateResult = new Promise<
      Either.Either<UpdatedChannelDetails, never>
    >((resolve) => {
      resolveUpdate = resolve;
    });
    const updateChannel = vi.fn().mockReturnValue(updateResult);
    const { store } = configureStore(
      vi.fn().mockResolvedValue(Either.right([channel, createdChannel])),
      undefined,
      updateChannel
    );
    await store.load(workspaceId);
    store.select(channelId);

    const update = store.updateSelectedChannel({ name: 'Product Design' });
    store.select(createdChannelId);
    store.select(channelId);
    resolveUpdate?.(Either.right(updatedDetails));

    await expect(update).resolves.toBeNull();
    expect(store.channels()).toEqual([channel, createdChannel]);
    expect(store.selectedChannel()).toEqual(channel);
    expect(store.updateStatus()).toBe('idle');
    expect(store.updateError()).toBeNull();
  });

  it('removes an archived channel and clears its selection', async () => {
    const { store, archiveChannel } = configureStore(
      vi.fn().mockResolvedValue(Either.right([channel, createdChannel]))
    );
    await store.load(workspaceId);
    store.select(channelId);

    const archive = store.archiveSelectedChannel();

    expect(store.view().operations.isArchiving).toBe(true);
    expect(store.archivingChannelId()).toBe(channelId);
    await expect(archive).resolves.toBe(channelId);
    expect(archiveChannel).toHaveBeenCalledExactlyOnceWith({ channelId });
    expect(store.channels()).toEqual([createdChannel]);
    expect(store.selectedChannel()).toBeNull();
    expect(store.archiveStatus()).toBe('idle');
    expect(store.archiveError()).toBeNull();
  });

  it('retains navigation and presents a forbidden archive', async () => {
    const failure = new ChannelArchiveNotAllowedError({ channelId });
    const archiveResult: Either.Either<void, ArchiveChannelError> =
      Either.left(failure);
    const archiveChannel = vi.fn().mockResolvedValue(archiveResult);
    const { store } = configureStore(
      undefined,
      undefined,
      undefined,
      archiveChannel
    );
    await store.load(workspaceId);
    store.select(channelId);

    await expect(store.archiveSelectedChannel()).resolves.toBeNull();

    expect(store.channels()).toEqual([channel]);
    expect(store.selectedChannel()).toEqual(channel);
    expect(store.archiveStatus()).toBe('failed');
    expect(store.archiveError()).toEqual({
      message: 'You no longer have permission to archive this channel.',
    });

    store.clearArchiveError();
    expect(store.archiveStatus()).toBe('idle');
    expect(store.archiveError()).toBeNull();
  });

  it('reconciles archive success without disturbing a newer selection', async () => {
    let resolveArchive:
      | ((result: Either.Either<void, ArchiveChannelError>) => void)
      | undefined;
    const archiveResult = new Promise<Either.Either<void, ArchiveChannelError>>(
      (resolve) => {
        resolveArchive = resolve;
      }
    );
    const archiveChannel = vi.fn().mockReturnValue(archiveResult);
    const { store } = configureStore(
      vi.fn().mockResolvedValue(Either.right([channel, createdChannel])),
      undefined,
      undefined,
      archiveChannel
    );
    await store.load(workspaceId);
    store.select(channelId);

    const archive = store.archiveSelectedChannel();
    store.select(createdChannelId);
    resolveArchive?.(Either.right(undefined));

    await expect(archive).resolves.toBe(channelId);
    expect(store.channels()).toEqual([createdChannel]);
    expect(store.selectedChannel()).toEqual(createdChannel);
    expect(store.archiveStatus()).toBe('idle');
  });

  it('discards an archive failure after selection changes', async () => {
    const failure = new ChannelArchiveNotAllowedError({ channelId });
    let resolveArchive:
      | ((result: Either.Either<void, ArchiveChannelError>) => void)
      | undefined;
    const archiveResult = new Promise<Either.Either<void, ArchiveChannelError>>(
      (resolve) => {
        resolveArchive = resolve;
      }
    );
    const archiveChannel = vi.fn().mockReturnValue(archiveResult);
    const { store } = configureStore(
      vi.fn().mockResolvedValue(Either.right([channel, createdChannel])),
      undefined,
      undefined,
      archiveChannel
    );
    await store.load(workspaceId);
    store.select(channelId);

    const archive = store.archiveSelectedChannel();
    store.select(createdChannelId);
    resolveArchive?.(Either.left(failure));

    await expect(archive).resolves.toBeNull();
    expect(store.channels()).toEqual([channel, createdChannel]);
    expect(store.selectedChannel()).toEqual(createdChannel);
    expect(store.archiveStatus()).toBe('idle');
    expect(store.archiveError()).toBeNull();
  });

  it('prevents an older reload from restoring an archived channel', async () => {
    let resolveArchive:
      | ((result: Either.Either<void, ArchiveChannelError>) => void)
      | undefined;
    let resolveReload:
      | ((result: Either.Either<readonly Channel[], never>) => void)
      | undefined;
    const archiveResult = new Promise<Either.Either<void, ArchiveChannelError>>(
      (resolve) => {
        resolveArchive = resolve;
      }
    );
    const reloadResult = new Promise<Either.Either<readonly Channel[], never>>(
      (resolve) => {
        resolveReload = resolve;
      }
    );
    const listWorkspaceChannels = vi
      .fn()
      .mockResolvedValueOnce(Either.right([channel, createdChannel]))
      .mockResolvedValueOnce(Either.right([]))
      .mockReturnValueOnce(reloadResult);
    const archiveChannel = vi.fn().mockReturnValue(archiveResult);
    const { store } = configureStore(
      listWorkspaceChannels,
      undefined,
      undefined,
      archiveChannel
    );
    await store.load(workspaceId);
    store.select(channelId);

    const archive = store.archiveSelectedChannel();
    await store.load(nextWorkspaceId);
    const reload = store.load(workspaceId);
    resolveArchive?.(Either.right(undefined));
    await archive;
    resolveReload?.(Either.right([channel, createdChannel]));
    await reload;

    expect(store.workspaceId()).toBe(workspaceId);
    expect(store.channels()).toEqual([createdChannel]);
    expect(store.archiveStatus()).toBe('idle');
  });
});
