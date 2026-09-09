import { computed } from '@angular/core';
import { signalStoreFeature, type, withComputed } from '@ngrx/signals';
import type {
  ChannelMessageComposerView,
  ChannelMessageHistoryContent,
  ChannelMessageHistoryView,
  ChannelMessagesState,
  FocusedChannelMessageView,
  MessageRevisionHistoryView,
} from '../channel-messages.state';

/**
 * Adds presentation-oriented values derived from channel-message state.
 */
export const withChannelMessagesComputed = () =>
  signalStoreFeature(
    {
      state: type<ChannelMessagesState>(),
    },

    withComputed((store) => ({
      focusedMessageView: computed<FocusedChannelMessageView>(() => {
        if (store.focusedMessageStatus() === 'idle') return { kind: 'idle' };
        if (store.focusedMessageStatus() === 'loading') {
          return { kind: 'loading' };
        }
        const message = store.focusedMessage();
        return store.focusedMessageStatus() === 'loaded' && message !== null
          ? { kind: 'message', message }
          : { kind: 'error' };
      }),

      historyView: computed<ChannelMessageHistoryView>(() => {
        const messages = store.messages();
        const error = store.error();
        const content: ChannelMessageHistoryContent =
          store.loadStatus() === 'loading'
            ? { kind: 'loading' }
            : store.loadStatus() === 'failed' && error !== null
              ? { kind: 'error', error }
              : messages.length === 0
                ? { kind: 'empty' }
                : { kind: 'messages', messages: [...messages].reverse() };

        return {
          content,
          isEditing: store.editMessageStatus() === 'editing',
          isDeleting: store.deleteMessageStatus() === 'deleting',
          canLoadOlder:
            store.loadStatus() === 'loaded' &&
            store.nextCursor() !== null &&
            store.olderMessagesStatus() !== 'loading',
          isLoadingOlder: store.olderMessagesStatus() === 'loading',
          editError: store.editError(),
          deleteError: store.deleteError(),
          realtimeError: store.realtimeError(),
        };
      }),

      revisionHistoryView: computed<MessageRevisionHistoryView>(() => {
        const messageId = store.revisionHistoryMessageId();
        if (messageId === null) return { kind: 'closed' };
        if (store.messageRevisionsStatus() === 'loading') {
          return { kind: 'loading', messageId };
        }
        const error = store.messageRevisionsError();
        if (store.messageRevisionsStatus() === 'failed' && error !== null) {
          return { kind: 'error', messageId, error };
        }
        const revisions = store.messageRevisions();
        return revisions.length === 0
          ? { kind: 'empty', messageId }
          : {
              kind: 'revisions',
              messageId,
              revisions,
              canLoadOlder:
                store.messageRevisionsStatus() === 'loaded' &&
                store.revisionNextCursor() !== null &&
                store.olderMessageRevisionsStatus() !== 'loading',
              isLoadingOlder: store.olderMessageRevisionsStatus() === 'loading',
            };
      }),

      composerView: computed<ChannelMessageComposerView>(() => ({
        isSending: store.sendMessageStatus() === 'sending',
        error: store.sendError(),
      })),
    }))
  );
