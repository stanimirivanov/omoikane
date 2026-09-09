import { computed, DestroyRef, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import type { ChannelTypingEvent } from '@omoikane/application/channel';
import type { ProfileId } from '@omoikane/domain/profile';
import type { ChannelId } from '@omoikane/domain/channel';
import {
  ChannelApplicationService,
  type ChannelTypingController,
} from '@client/core/channel/channel-application.service';
import {
  initialChannelTypingState,
  type ChannelTypingView,
} from './channel-typing.state';

const LOCAL_TYPING_IDLE_MS = 1_500;
const REMOTE_TYPING_EXPIRY_MS = 5_000;

/** Owns throttling, expiry, and one selected-channel typing connection. */
export const ChannelTypingStore = signalStore(
  withState(initialChannelTypingState),
  withComputed((store) => ({
    view: computed<ChannelTypingView>(() => {
      if (store.status() === 'connecting') {
        return { kind: 'connecting' };
      }

      const error = store.error();
      if (store.status() === 'failed' && error !== null) {
        return { kind: 'error', error };
      }

      const count = store.typingProfileIds().length;
      return count === 0 ? { kind: 'idle' } : { kind: 'typing', count };
    }),
  })),
  withMethods(
    (
      store,
      application = inject(ChannelApplicationService),
      destroyRef = inject(DestroyRef)
    ) => {
      let controller: ChannelTypingController | null = null;
      let revision = 0;
      let localTyping = false;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const expiryTimers = new Map<ProfileId, ReturnType<typeof setTimeout>>();

      const clearRemote = (): void => {
        for (const timer of expiryTimers.values()) clearTimeout(timer);
        expiryTimers.clear();
      };

      const applyEvent = (event: ChannelTypingEvent): void => {
        const existingExpiry = expiryTimers.get(event.profileId);
        if (existingExpiry !== undefined) {
          clearTimeout(existingExpiry);
        }
        expiryTimers.delete(event.profileId);
        const current = store
          .typingProfileIds()
          .filter((id) => id !== event.profileId);
        if (!event.isTyping) {
          patchState(store, { typingProfileIds: current });
          return;
        }
        patchState(store, {
          typingProfileIds: [...current, event.profileId].sort(),
        });
        expiryTimers.set(
          event.profileId,
          setTimeout(() => {
            expiryTimers.delete(event.profileId);
            patchState(store, {
              typingProfileIds: store
                .typingProfileIds()
                .filter((id) => id !== event.profileId),
            });
          }, REMOTE_TYPING_EXPIRY_MS)
        );
      };

      const disconnect = (): void => {
        revision += 1;
        if (idleTimer !== null) clearTimeout(idleTimer);
        idleTimer = null;
        localTyping = false;
        clearRemote();
        controller?.close();
        controller = null;
      };

      const stopActivity = (): void => {
        if (idleTimer !== null) clearTimeout(idleTimer);
        idleTimer = null;
        if (localTyping) {
          localTyping = false;
          void controller?.setTyping(false);
        }
      };

      const connect = (channelId: ChannelId): void => {
        if (
          store.channelId() === channelId &&
          controller !== null &&
          store.status() !== 'failed'
        ) {
          return;
        }

        disconnect();
        const currentRevision = revision;
        patchState(store, {
          channelId,
          typingProfileIds: [],
          status: 'connecting',
          error: null,
        });
        const next = application.connectChannelTyping(
          channelId,
          () => {
            if (currentRevision === revision) {
              patchState(store, { status: 'observing', error: null });
            }
          },
          (event) => {
            if (currentRevision === revision) applyEvent(event);
          },
          () => {
            if (currentRevision !== revision) return;
            clearRemote();
            patchState(store, {
              typingProfileIds: [],
              status: 'failed',
              error: {
                message:
                  'Typing indicators are unavailable. Retry to reconnect.',
              },
            });
          }
        );
        if (currentRevision === revision) controller = next;
        else next.close();
      };

      destroyRef.onDestroy(() => {
        stopActivity();
        disconnect();
      });

      return {
        connect,
        recordActivity(): void {
          if (store.status() !== 'observing' || controller === null) return;
          if (!localTyping) {
            localTyping = true;
            void controller.setTyping(true);
          }
          if (idleTimer !== null) clearTimeout(idleTimer);
          idleTimer = setTimeout(stopActivity, LOCAL_TYPING_IDLE_MS);
        },
        stopActivity,
        retry(): void {
          const channelId = store.channelId();
          if (channelId !== null && store.status() === 'failed') {
            connect(channelId);
          }
        },
      };
    }
  )
);
