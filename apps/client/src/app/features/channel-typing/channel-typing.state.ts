import type { ProfileId } from '@omoikane/domain/profile';
import type { ChannelId } from '@omoikane/domain/channel';

export type ChannelTypingStatus =
  | 'idle'
  | 'connecting'
  | 'observing'
  | 'failed';

export interface ChannelTypingError {
  readonly message: string;
}

/** Complete rendering state for remote typing activity. */
export type ChannelTypingView =
  | { readonly kind: 'connecting' }
  | { readonly kind: 'error'; readonly error: ChannelTypingError }
  | { readonly kind: 'idle' }
  | { readonly kind: 'typing'; readonly count: number };

export interface ChannelTypingState {
  readonly channelId: ChannelId | null;
  readonly typingProfileIds: readonly ProfileId[];
  readonly status: ChannelTypingStatus;
  readonly error: ChannelTypingError | null;
}

export const initialChannelTypingState: ChannelTypingState = {
  channelId: null,
  typingProfileIds: [],
  status: 'idle',
  error: null,
};
