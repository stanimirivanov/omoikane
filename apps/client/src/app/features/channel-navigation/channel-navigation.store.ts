import { computed, DestroyRef, inject } from '@angular/core';
import { Either } from 'effect';
import type {
  ArchiveChannelError,
  CreateChannelError,
  CreateChannelInput,
  UpdateChannelError,
  UpdateChannelInput,
} from '@omoikane/application/channel';
import type {
  ChannelUnreadCount,
  MarkChannelReadInput,
} from '@omoikane/application/message';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import type { Channel, ChannelId } from '@omoikane/domain/channel';
import type { WorkspaceId } from '@omoikane/domain/workspace';
import { ChannelApplicationService } from '@client/core/channel/channel-application.service';
import { MessageApplicationService } from '@client/core/message/message-application.service';
import {
  initialChannelNavigationState,
  type ChannelNavigationContent,
  type ChannelNavigationView,
} from './channel-navigation.state';

/**
 * Owns channel discovery and selection for one workspace navigation feature.
 */
export const ChannelNavigationStore = signalStore(
  withState(initialChannelNavigationState),

  withComputed((store) => ({
    unreadCountByChannel: computed(
      () =>
        new Map(
          store
            .unreadCounts()
            .map((entry) => [entry.channelId, entry.unreadCount] as const)
        )
    ),
    selectedChannel: computed(() => {
      const selectedChannelId = store.selectedChannelId();

      return (
        store.channels().find((channel) => channel.id === selectedChannelId) ??
        null
      );
    }),
  })),

  withComputed((store) => ({
    view: computed<ChannelNavigationView>(() => {
      const error = store.error();
      const content: ChannelNavigationContent =
        store.loadStatus() === 'loading'
          ? { kind: 'loading' }
          : store.loadStatus() === 'failed' && error !== null
            ? { kind: 'error', error }
            : {
                kind: 'ready',
                channels: store.channels(),
                selectedChannel: store.selectedChannel(),
                unreadCountByChannel: store.unreadCountByChannel(),
              };

      const isCreating = store.creationStatus() === 'creating';
      const isUpdating = store.updateStatus() === 'updating';
      const isArchiving = store.archiveStatus() === 'archiving';

      return {
        content,
        operations: {
          isBusy:
            content.kind === 'loading' ||
            isCreating ||
            isUpdating ||
            isArchiving,
          isCreating,
          isUpdating,
          isArchiving,
        },
        realtimeError: store.realtimeError(),
        unreadError: store.unreadError(),
        unreadRealtimeError: store.unreadRealtimeError(),
        creationError: store.creationError(),
        updateError: store.updateError(),
        archiveError: store.archiveError(),
      };
    }),
  })),

  withMethods(
    (
      store,
      channelApplication = inject(ChannelApplicationService),
      messageApplication = inject(MessageApplicationService),
      destroyRef = inject(DestroyRef)
    ) => {
      let requestVersion = 0;
      let selectionVersion = 0;
      const archivedChannelIds = new Set<ChannelId>();
      const locallyIncludedChannels = new Map<ChannelId, Channel>();
      let stopChannelObservation: (() => void) | null = null;
      let observationRevision = 0;
      let stopUnreadObservation: (() => void) | null = null;
      let unreadObservationRevision = 0;
      let activeRequest: {
        readonly workspaceId: WorkspaceId;
        readonly promise: Promise<void>;
      } | null = null;
      let failedReadInput: MarkChannelReadInput | null = null;

      const replaceUnreadCount = (
        counts: readonly ChannelUnreadCount[],
        channelId: ChannelId,
        unreadCount: number
      ): readonly ChannelUnreadCount[] => [
        ...counts.filter((entry) => entry.channelId !== channelId),
        { channelId, unreadCount },
      ];

      const persistReadPosition = async (
        workspaceId: WorkspaceId,
        input: MarkChannelReadInput
      ): Promise<void> => {
        const result = await messageApplication.markChannelRead(input);

        if (store.workspaceId() !== workspaceId) {
          return;
        }

        Either.match(result, {
          onLeft: () => {
            failedReadInput = input;
            patchState(store, {
              unreadError: {
                message:
                  'The channel read position could not be saved. Please try again.',
              },
            });
          },
          onRight: () => {
            failedReadInput = null;
            patchState(store, {
              unreadCounts: replaceUnreadCount(
                store.unreadCounts(),
                input.channelId,
                0
              ),
              unreadError:
                store.unreadStatus() === 'failed' ? store.unreadError() : null,
            });
          },
        });
      };

      /**
       * Preserves one just-completed local mutation against an older snapshot
       * and retains archive tombstones until the provider confirms absence.
       */
      const reconcileChannels = (
        channels: readonly Channel[]
      ): readonly Channel[] => {
        for (const channelId of archivedChannelIds) {
          if (!channels.some((channel) => channel.id === channelId)) {
            archivedChannelIds.delete(channelId);
          }
        }

        const included = [...locallyIncludedChannels.values()];
        locallyIncludedChannels.clear();

        const authoritative = channels.filter(
          (channel) => !archivedChannelIds.has(channel.id)
        );

        return included.reduce<readonly Channel[]>(
          (result, channel) => upsertChannel(result, channel),
          authoritative
        );
      };

      const stopRealtime = (updateState: boolean): void => {
        observationRevision += 1;
        stopChannelObservation?.();
        stopChannelObservation = null;

        if (updateState) {
          patchState(store, {
            realtimeStatus: 'idle',
            realtimeError: null,
          });
        }
      };

      const stopUnreadRealtime = (updateState: boolean): void => {
        unreadObservationRevision += 1;
        stopUnreadObservation?.();
        stopUnreadObservation = null;

        if (updateState) {
          patchState(store, {
            unreadRealtimeStatus: 'idle',
            unreadRealtimeError: null,
          });
        }
      };

      const applyUnreadSnapshot = (
        revision: number,
        workspaceId: WorkspaceId,
        counts: readonly ChannelUnreadCount[]
      ): void => {
        if (
          revision !== unreadObservationRevision ||
          store.workspaceId() !== workspaceId
        ) {
          return;
        }

        failedReadInput = null;
        patchState(store, {
          unreadCounts: counts,
          unreadStatus: 'loaded',
          unreadError: null,
          unreadRealtimeStatus: 'observing',
          unreadRealtimeError: null,
        });
      };

      const applyUnreadRealtimeError = (
        revision: number,
        workspaceId: WorkspaceId
      ): void => {
        if (
          revision !== unreadObservationRevision ||
          store.workspaceId() !== workspaceId
        ) {
          return;
        }

        stopUnreadObservation = null;
        patchState(store, {
          unreadRealtimeStatus: 'failed',
          unreadRealtimeError: {
            message: 'Live unread updates are unavailable. Retry to reconnect.',
          },
        });
      };

      const startUnreadRealtime = (workspaceId: WorkspaceId): void => {
        if (
          store.workspaceId() !== workspaceId ||
          store.loadStatus() !== 'loaded'
        ) {
          return;
        }

        if (
          stopUnreadObservation !== null &&
          store.unreadRealtimeStatus() === 'observing'
        ) {
          return;
        }

        stopUnreadRealtime(false);
        const revision = unreadObservationRevision;
        patchState(store, {
          unreadRealtimeStatus: 'observing',
          unreadRealtimeError: null,
        });

        const cleanup = messageApplication.observeWorkspaceChannelUnreadCounts(
          workspaceId,
          (counts) => {
            applyUnreadSnapshot(revision, workspaceId, counts);
          },
          () => {
            applyUnreadRealtimeError(revision, workspaceId);
          }
        );

        if (
          revision === unreadObservationRevision &&
          store.workspaceId() === workspaceId &&
          store.unreadRealtimeStatus() === 'observing'
        ) {
          stopUnreadObservation = cleanup;
        } else {
          cleanup();
        }
      };

      const applyWorkspaceChannels = (
        revision: number,
        workspaceId: WorkspaceId,
        channels: readonly Channel[]
      ): void => {
        if (
          revision !== observationRevision ||
          store.workspaceId() !== workspaceId
        ) {
          return;
        }

        const reconciled = reconcileChannels(channels);
        const selectedChannelId = store.selectedChannelId();
        const selectionLost =
          selectedChannelId !== null &&
          !reconciled.some((channel) => channel.id === selectedChannelId);

        if (selectionLost) {
          selectionVersion += 1;
        }

        patchState(store, {
          channels: reconciled,
          ...(selectionLost
            ? {
                selectedChannelId: null,
                updateStatus: 'idle' as const,
                updateError: null,
                archiveStatus: 'idle' as const,
                archivingChannelId: null,
                archiveError: null,
              }
            : {}),
          realtimeStatus: 'observing',
          realtimeError: null,
        });
      };

      const applyRealtimeError = (
        revision: number,
        workspaceId: WorkspaceId
      ): void => {
        if (
          revision !== observationRevision ||
          store.workspaceId() !== workspaceId
        ) {
          return;
        }

        stopChannelObservation = null;
        patchState(store, {
          realtimeStatus: 'failed',
          realtimeError: {
            message:
              'Live channel updates are unavailable. Retry to reconnect.',
          },
        });
      };

      const startRealtime = (workspaceId: WorkspaceId): void => {
        if (
          store.workspaceId() !== workspaceId ||
          store.loadStatus() !== 'loaded'
        ) {
          return;
        }

        if (
          stopChannelObservation !== null &&
          store.realtimeStatus() === 'observing'
        ) {
          return;
        }

        stopRealtime(false);
        const revision = observationRevision;
        patchState(store, {
          realtimeStatus: 'observing',
          realtimeError: null,
        });

        const cleanup = channelApplication.observeWorkspaceChannels(
          workspaceId,
          (channels) => {
            applyWorkspaceChannels(revision, workspaceId, channels);
          },
          () => {
            applyRealtimeError(revision, workspaceId);
          }
        );

        if (
          revision === observationRevision &&
          store.workspaceId() === workspaceId &&
          store.realtimeStatus() === 'observing'
        ) {
          stopChannelObservation = cleanup;
        } else {
          cleanup();
        }
      };

      destroyRef.onDestroy(() => {
        stopRealtime(false);
        stopUnreadRealtime(false);
      });

      return {
        /**
         * Loads channels for the current workspace.
         *
         * Calls for the same workspace share an in-flight request. Selecting a
         * different workspace clears the old collection immediately, and a
         * late result from the previous request cannot overwrite newer state.
         */
        load(workspaceId: WorkspaceId): Promise<void> {
          if (
            store.workspaceId() === workspaceId &&
            store.loadStatus() === 'loaded'
          ) {
            return Promise.resolve();
          }

          if (activeRequest?.workspaceId === workspaceId) {
            return activeRequest.promise;
          }

          const version = ++requestVersion;
          const workspaceChanged = store.workspaceId() !== workspaceId;
          selectionVersion += 1;

          if (workspaceChanged) {
            stopRealtime(false);
            stopUnreadRealtime(false);
            locallyIncludedChannels.clear();
            failedReadInput = null;
          }

          patchState(store, {
            workspaceId,
            channels: [],
            selectedChannelId: null,
            loadStatus: 'loading',
            error: null,
            unreadCounts: [],
            unreadStatus: 'loading',
            unreadError: null,
            unreadRealtimeStatus: 'idle',
            unreadRealtimeError: null,
            realtimeStatus: 'idle',
            realtimeError: null,
            ...(workspaceChanged
              ? {
                  creationStatus: 'idle',
                  creationError: null,
                  updateStatus: 'idle',
                  updateError: null,
                  ...(store.archiveStatus() === 'archiving'
                    ? {}
                    : {
                        archiveStatus: 'idle' as const,
                        archivingChannelId: null,
                        archiveError: null,
                      }),
                }
              : {}),
          });

          const promise = Promise.all([
            channelApplication.listWorkspaceChannels(workspaceId),
            messageApplication.listWorkspaceChannelUnreadCounts(workspaceId),
          ])
            .then(([result, unreadResult]) => {
              if (version !== requestVersion) {
                return;
              }

              Either.match(unreadResult, {
                onLeft: () => {
                  patchState(store, {
                    unreadCounts: [],
                    unreadStatus: 'failed',
                    unreadError: {
                      message:
                        'Unread counts are currently unavailable. Please try again.',
                    },
                  });
                },
                onRight: (unreadCounts) => {
                  patchState(store, {
                    unreadCounts,
                    unreadStatus: 'loaded',
                    unreadError: null,
                  });
                },
              });

              Either.match(result, {
                onLeft: () => {
                  patchState(store, {
                    channels: [],
                    selectedChannelId: null,
                    loadStatus: 'failed',
                    error: {
                      message:
                        'Channels are currently unavailable. Please try again.',
                    },
                  });
                },
                onRight: (channels) => {
                  patchState(store, {
                    channels: reconcileChannels(channels),
                    selectedChannelId: null,
                    loadStatus: 'loaded',
                    error: null,
                  });
                  startRealtime(workspaceId);
                  startUnreadRealtime(workspaceId);
                },
              });
            })
            .finally(() => {
              if (version === requestVersion) {
                activeRequest = null;
              }
            });

          activeRequest = { workspaceId, promise };
          return promise;
        },

        /** Restarts selected-workspace channel observation after failure. */
        retryRealtime(): void {
          const workspaceId = store.workspaceId();

          if (workspaceId !== null) {
            startRealtime(workspaceId);
          }
        },

        /** Restarts persisted unread-count observation after failure. */
        retryUnreadRealtime(): void {
          const workspaceId = store.workspaceId();

          if (workspaceId !== null) {
            startUnreadRealtime(workspaceId);
          }
        },

        /** Reloads the selected workspace's unread-count snapshot. */
        async retryUnreadCounts(): Promise<void> {
          const workspaceId = store.workspaceId();

          if (workspaceId === null || store.unreadStatus() === 'loading') {
            return;
          }

          if (failedReadInput !== null) {
            await persistReadPosition(workspaceId, failedReadInput);
            return;
          }

          const version = requestVersion;
          patchState(store, {
            unreadStatus: 'loading',
            unreadError: null,
          });

          const result =
            await messageApplication.listWorkspaceChannelUnreadCounts(
              workspaceId
            );

          if (
            version !== requestVersion ||
            store.workspaceId() !== workspaceId
          ) {
            return;
          }

          Either.match(result, {
            onLeft: () => {
              patchState(store, {
                unreadStatus: 'failed',
                unreadError: {
                  message:
                    'Unread counts are currently unavailable. Please try again.',
                },
              });
            },
            onRight: (unreadCounts) => {
              patchState(store, {
                unreadCounts,
                unreadStatus: 'loaded',
                unreadError: null,
              });
            },
          });
        },

        /** Persists and reconciles the exact newest message loaded by the UI. */
        markChannelRead(input: MarkChannelReadInput): Promise<void> {
          const workspaceId = store.workspaceId();

          if (
            workspaceId === null ||
            !store.channels().some((channel) => channel.id === input.channelId)
          ) {
            return Promise.resolve();
          }

          return persistReadPosition(workspaceId, input);
        },

        /**
         * Selects a channel only when it belongs to the loaded collection.
         */
        select(channelId: ChannelId): boolean {
          if (!store.channels().some((channel) => channel.id === channelId)) {
            return false;
          }

          const selectionChanged = store.selectedChannelId() !== channelId;

          if (selectionChanged) {
            selectionVersion += 1;
          }

          patchState(store, {
            selectedChannelId: channelId,
            ...(selectionChanged
              ? { updateStatus: 'idle' as const, updateError: null }
              : {}),
            ...(selectionChanged && store.archiveStatus() !== 'archiving'
              ? {
                  archiveStatus: 'idle' as const,
                  archivingChannelId: null,
                  archiveError: null,
                }
              : {}),
          });
          return true;
        },

        /**
         * Clears presentation selection without reloading the collection.
         */
        clearSelection(): void {
          if (store.selectedChannelId() !== null) {
            selectionVersion += 1;
          }

          patchState(store, {
            selectedChannelId: null,
            updateStatus: 'idle',
            updateError: null,
            ...(store.archiveStatus() === 'archiving'
              ? {}
              : {
                  archiveStatus: 'idle' as const,
                  archivingChannelId: null,
                  archiveError: null,
                }),
          });
        },

        /** Reconciles one restored channel into this workspace's active list. */
        includeRestoredChannel(channel: Channel): boolean {
          if (
            store.loadStatus() !== 'loaded' ||
            store.workspaceId() !== channel.workspaceId
          ) {
            return false;
          }

          archivedChannelIds.delete(channel.id);
          locallyIncludedChannels.set(channel.id, channel);
          patchState(store, {
            channels: upsertChannel(store.channels(), channel),
          });
          return true;
        },

        /**
         * Creates a channel in the loaded workspace and adds the validated
         * result without changing selection. Route navigation remains the
         * component's responsibility and is therefore the selection source.
         */
        async createChannel(
          input: Omit<CreateChannelInput, 'workspaceId'>
        ): Promise<Channel | null> {
          const workspaceId = store.workspaceId();

          if (
            workspaceId === null ||
            store.loadStatus() !== 'loaded' ||
            store.creationStatus() === 'creating' ||
            store.updateStatus() === 'updating' ||
            store.archiveStatus() === 'archiving'
          ) {
            return null;
          }

          patchState(store, {
            creationStatus: 'creating',
            creationError: null,
          });

          const result = await channelApplication.createChannel({
            ...input,
            workspaceId,
          });

          if (store.workspaceId() !== workspaceId) {
            return null;
          }

          return Either.match(result, {
            onLeft: (error) => {
              patchState(store, {
                creationStatus: 'failed',
                creationError: toChannelCreationError(error),
              });

              return null;
            },
            onRight: (channel) => {
              locallyIncludedChannels.set(channel.id, channel);
              patchState(store, {
                channels: upsertChannel(store.channels(), channel),
                creationStatus: 'idle',
                creationError: null,
              });

              return channel;
            },
          });
        },

        clearCreationError(): void {
          patchState(store, {
            creationStatus: 'idle',
            creationError: null,
          });
        },

        /**
         * Replaces mutable details for the selected channel.
         *
         * A selection generation prevents a late result from changing a
         * channel after navigation moved elsewhere and back. Stable workspace
         * and slug fields remain sourced from the loaded domain projection.
         */
        async updateSelectedChannel(
          details: Omit<UpdateChannelInput, 'channelId'>
        ): Promise<Channel | null> {
          const workspaceId = store.workspaceId();
          const selectedChannel = store.selectedChannel();

          if (
            workspaceId === null ||
            selectedChannel === null ||
            store.loadStatus() !== 'loaded' ||
            store.creationStatus() === 'creating' ||
            store.updateStatus() === 'updating' ||
            store.archiveStatus() === 'archiving'
          ) {
            return null;
          }

          const channelId = selectedChannel.id;
          const version = selectionVersion;
          patchState(store, {
            updateStatus: 'updating',
            updateError: null,
          });

          const result = await channelApplication.updateChannel({
            channelId,
            ...details,
          });

          if (
            store.workspaceId() !== workspaceId ||
            store.selectedChannelId() !== channelId ||
            selectionVersion !== version
          ) {
            return null;
          }

          return Either.match(result, {
            onLeft: (error) => {
              patchState(store, {
                updateStatus: 'failed',
                updateError: toChannelUpdateError(error),
              });

              return null;
            },
            onRight: (updatedDetails) => {
              const updatedChannel: Channel = {
                ...selectedChannel,
                name: updatedDetails.name,
                description: updatedDetails.description,
              };

              locallyIncludedChannels.set(channelId, updatedChannel);

              patchState(store, {
                channels: upsertChannel(store.channels(), updatedChannel),
                updateStatus: 'idle',
                updateError: null,
              });

              return updatedChannel;
            },
          });
        },

        clearUpdateError(): void {
          if (store.updateStatus() !== 'updating') {
            patchState(store, {
              updateStatus: 'idle',
              updateError: null,
            });
          }
        },

        /**
         * Archives the selected channel through one serialized command.
         *
         * Successful mutations reconcile by stable identity even after
         * navigation changes. A local tombstone also prevents an older channel
         * list response from reintroducing an archive that already succeeded.
         */
        async archiveSelectedChannel(): Promise<ChannelId | null> {
          const workspaceId = store.workspaceId();
          const channelId = store.selectedChannelId();

          if (
            workspaceId === null ||
            channelId === null ||
            store.loadStatus() !== 'loaded' ||
            store.creationStatus() === 'creating' ||
            store.updateStatus() === 'updating' ||
            store.archiveStatus() === 'archiving'
          ) {
            return null;
          }

          const version = selectionVersion;
          patchState(store, {
            archiveStatus: 'archiving',
            archivingChannelId: channelId,
            archiveError: null,
          });

          const result = await channelApplication.archiveChannel({ channelId });

          if (Either.isLeft(result)) {
            if (
              store.workspaceId() !== workspaceId ||
              store.selectedChannelId() !== channelId ||
              selectionVersion !== version
            ) {
              patchState(store, {
                archiveStatus: 'idle',
                archivingChannelId: null,
                archiveError: null,
              });
              return null;
            }

            patchState(store, {
              archiveStatus: 'failed',
              archivingChannelId: null,
              archiveError: toChannelArchiveError(result.left),
            });
            return null;
          }

          archivedChannelIds.add(channelId);
          locallyIncludedChannels.delete(channelId);
          const targetStillSelected =
            store.workspaceId() === workspaceId &&
            store.selectedChannelId() === channelId;

          if (targetStillSelected) {
            selectionVersion += 1;
          }

          patchState(store, {
            channels: store
              .channels()
              .filter((channel) => channel.id !== channelId),
            ...(targetStillSelected ? { selectedChannelId: null } : {}),
            archiveStatus: 'idle',
            archivingChannelId: null,
            archiveError: null,
          });

          return channelId;
        },

        clearArchiveError(): void {
          if (store.archiveStatus() !== 'archiving') {
            patchState(store, {
              archiveStatus: 'idle',
              archivingChannelId: null,
              archiveError: null,
            });
          }
        },
      };
    }
  )
);

const upsertChannel = (
  channels: readonly Channel[],
  channel: Channel
): readonly Channel[] =>
  [
    ...channels.filter((candidate) => candidate.id !== channel.id),
    channel,
  ].sort(
    (left, right) =>
      left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
  );

const toChannelCreationError = (
  error: CreateChannelError
): { readonly message: string } => {
  switch (error._tag) {
    case 'InvalidChannelCreationInputError':
      return {
        message:
          error.field === 'name'
            ? 'Enter a channel name.'
            : error.field === 'slug'
              ? 'Use lowercase letters, numbers, and single hyphens for the channel URL.'
              : error.field === 'workspaceId'
                ? 'Select an active workspace before creating a channel.'
                : 'Check the channel description and try again.',
      };

    case 'ChannelSlugUnavailableError':
      return {
        message: 'That channel URL is already in use in this workspace.',
      };

    case 'ChannelCreationNotAllowedError':
      return {
        message: 'You no longer have permission to create channels here.',
      };

    default:
      return {
        message: 'The channel could not be created. Please try again.',
      };
  }
};

const toChannelUpdateError = (
  error: UpdateChannelError
): { readonly message: string } => {
  switch (error._tag) {
    case 'InvalidChannelUpdateInputError':
      return {
        message:
          error.field === 'name'
            ? 'Enter a channel name.'
            : error.field === 'description'
              ? 'Check the channel description and try again.'
              : 'The selected channel is invalid.',
      };
    case 'ChannelUpdateNotAllowedError':
      return {
        message: 'You no longer have permission to edit this channel.',
      };
    case 'InvalidChannelDataError':
    case 'ChannelRepositoryUnavailableError':
      return {
        message: 'The channel could not be updated. Please try again.',
      };
  }
};

const toChannelArchiveError = (
  error: ArchiveChannelError
): { readonly message: string } => {
  switch (error._tag) {
    case 'ChannelArchiveNotAllowedError':
      return {
        message: 'You no longer have permission to archive this channel.',
      };
    case 'InvalidChannelArchiveInputError':
    case 'ChannelRepositoryUnavailableError':
      return {
        message: 'The channel could not be archived. Please try again.',
      };
  }
};
