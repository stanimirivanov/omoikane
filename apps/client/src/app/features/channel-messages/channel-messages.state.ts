import type {
  MessagePage,
  MessageRevisionPage,
} from '@omoikane/application/message';
import type { ChannelId } from '@omoikane/domain/channel';
import type { Message, MessageId } from '@omoikane/domain/message';
import type { Profile } from '@omoikane/domain/profile';

/**
 * Lifecycle of the newest-page request for the selected channel.
 */
export type ChannelMessagesLoadStatus =
  | 'idle'
  | 'loading'
  | 'loaded'
  | 'failed';

/**
 * Lifecycle of an optional request for the next older page.
 */
export type OlderMessagesLoadStatus = 'idle' | 'loading' | 'failed';

/** Lifecycle of the selected message's initial revision-page request. */
export type MessageRevisionsLoadStatus =
  | 'idle'
  | 'loading'
  | 'loaded'
  | 'failed';

/** Lifecycle of an optional request for the next older revision page. */
export type OlderMessageRevisionsLoadStatus = 'idle' | 'loading' | 'failed';

/**
 * Lifecycle of the single in-flight send operation.
 */
export type SendMessageStatus = 'idle' | 'sending' | 'failed';

/**
 * Lifecycle of the single in-flight edit operation.
 */
export type EditMessageStatus = 'idle' | 'editing' | 'failed';

/**
 * Lifecycle of the single in-flight delete operation.
 */
export type DeleteMessageStatus = 'idle' | 'deleting' | 'failed';

/**
 * Lifecycle of the selected channel's long-lived realtime subscription.
 */
export type ChannelMessagesRealtimeStatus = 'idle' | 'observing' | 'failed';

export type FocusedMessageLoadStatus = 'idle' | 'loading' | 'loaded' | 'failed';

/**
 * Presentation-safe failure information retained by the feature store.
 */
export interface ChannelMessagesError {
  readonly tag: string;
  readonly message: string;
}

export type FocusedChannelMessageView =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'message'; readonly message: Message };

export type ChannelMessageHistoryContent =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: ChannelMessagesError }
  | { readonly kind: 'empty' }
  | { readonly kind: 'messages'; readonly messages: readonly Message[] };

export interface ChannelMessageHistoryView {
  readonly content: ChannelMessageHistoryContent;
  readonly isEditing: boolean;
  readonly isDeleting: boolean;
  readonly canLoadOlder: boolean;
  readonly isLoadingOlder: boolean;
  readonly editError: ChannelMessagesError | null;
  readonly deleteError: ChannelMessagesError | null;
  readonly realtimeError: ChannelMessagesError | null;
}

export type MessageRevisionHistoryView =
  | { readonly kind: 'closed' }
  | { readonly kind: 'loading'; readonly messageId: MessageId }
  | {
      readonly kind: 'error';
      readonly messageId: MessageId;
      readonly error: ChannelMessagesError;
    }
  | { readonly kind: 'empty'; readonly messageId: MessageId }
  | {
      readonly kind: 'revisions';
      readonly messageId: MessageId;
      readonly revisions: MessageRevisionPage['revisions'];
      readonly canLoadOlder: boolean;
      readonly isLoadingOlder: boolean;
    };

export interface ChannelMessageComposerView {
  readonly isSending: boolean;
  readonly error: ChannelMessagesError | null;
}

/**
 * State for the currently selected channel's message history.
 */
export interface ChannelMessagesState {
  readonly channelId: ChannelId | null;

  readonly messages: MessagePage['messages'];

  /**
   * RLS-visible display profiles for authors in the loaded message pages.
   *
   * A profile may be absent when it is hidden, no longer active, or its
   * best-effort enrichment request failed.
   */
  readonly authorProfiles: readonly Profile[];

  readonly nextCursor: MessagePage['nextCursor'];

  readonly loadStatus: ChannelMessagesLoadStatus;

  readonly olderMessagesStatus: OlderMessagesLoadStatus;

  readonly sendMessageStatus: SendMessageStatus;

  readonly editMessageStatus: EditMessageStatus;

  readonly deleteMessageStatus: DeleteMessageStatus;

  readonly realtimeStatus: ChannelMessagesRealtimeStatus;

  readonly error: ChannelMessagesError | null;

  readonly sendError: ChannelMessagesError | null;

  readonly editError: ChannelMessagesError | null;

  readonly deleteError: ChannelMessagesError | null;

  readonly realtimeError: ChannelMessagesError | null;

  /** Exact message requested by a search-result deep link. */
  readonly focusedMessageId: MessageId | null;

  readonly focusedMessage: Message | null;

  readonly focusedMessageStatus: FocusedMessageLoadStatus;

  readonly focusedMessageError: ChannelMessagesError | null;

  readonly focusedMessageRequestGeneration: number;

  /** Stable message identity whose revision history is currently disclosed. */
  readonly revisionHistoryMessageId: MessageId | null;

  readonly messageRevisions: MessageRevisionPage['revisions'];

  readonly revisionNextCursor: MessageRevisionPage['nextCursor'];

  readonly messageRevisionsStatus: MessageRevisionsLoadStatus;

  readonly olderMessageRevisionsStatus: OlderMessageRevisionsLoadStatus;

  readonly messageRevisionsError: ChannelMessagesError | null;

  /** Invalidates revision results when another message is disclosed. */
  readonly revisionRequestGeneration: number;

  /**
   * Identifies the currently active request generation.
   *
   * Results from older generations are ignored when the user changes channels
   * before a request completes.
   */
  readonly requestGeneration: number;
}

type ClearedMessageRevisionHistoryState = Pick<
  ChannelMessagesState,
  | 'revisionHistoryMessageId'
  | 'messageRevisions'
  | 'revisionNextCursor'
  | 'messageRevisionsStatus'
  | 'olderMessageRevisionsStatus'
  | 'messageRevisionsError'
  | 'revisionRequestGeneration'
>;

/** Produces closed revision state while invalidating any outstanding request. */
export const clearedMessageRevisionHistoryState = (
  requestGeneration: number
): ClearedMessageRevisionHistoryState => ({
  revisionHistoryMessageId: null,
  messageRevisions: [],
  revisionNextCursor: null,
  messageRevisionsStatus: 'idle',
  olderMessageRevisionsStatus: 'idle',
  messageRevisionsError: null,
  revisionRequestGeneration: requestGeneration,
});

/**
 * Fresh state used at store creation and when the selected channel is cleared.
 */
export const initialChannelMessagesState: ChannelMessagesState = {
  channelId: null,
  messages: [],
  authorProfiles: [],
  nextCursor: null,
  loadStatus: 'idle',
  olderMessagesStatus: 'idle',
  sendMessageStatus: 'idle',
  editMessageStatus: 'idle',
  deleteMessageStatus: 'idle',
  realtimeStatus: 'idle',
  error: null,
  sendError: null,
  editError: null,
  deleteError: null,
  realtimeError: null,
  focusedMessageId: null,
  focusedMessage: null,
  focusedMessageStatus: 'idle',
  focusedMessageError: null,
  focusedMessageRequestGeneration: 0,
  revisionHistoryMessageId: null,
  messageRevisions: [],
  revisionNextCursor: null,
  messageRevisionsStatus: 'idle',
  olderMessageRevisionsStatus: 'idle',
  messageRevisionsError: null,
  revisionRequestGeneration: 0,
  requestGeneration: 0,
};
