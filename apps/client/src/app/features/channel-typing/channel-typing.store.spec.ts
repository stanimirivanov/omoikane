import { TestBed } from '@angular/core/testing';
import { Schema } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChannelIdSchema } from '@omoikane/domain/channel';
import { ProfileIdSchema } from '@omoikane/domain/profile';
import { ChannelApplicationService } from '@client/core/channel/channel-application.service';
import { ChannelTypingStore } from './channel-typing.store';

const channelId = Schema.decodeUnknownSync(ChannelIdSchema)(
  '00000000-0000-4000-8000-000000000001'
);
const profileId = Schema.decodeUnknownSync(ProfileIdSchema)(
  '10000000-0000-4000-8000-000000000002'
);

const configureStore = () => {
  const setTyping = vi.fn().mockResolvedValue(true);
  const close = vi.fn();
  let onConnected: (() => void) | undefined;
  let onEvent:
    | ((event: { profileId: typeof profileId; isTyping: boolean }) => void)
    | undefined;
  let onError: (() => void) | undefined;
  const connectChannelTyping = vi.fn(
    (
      _channelId: typeof channelId,
      connected: () => void,
      event: typeof onEvent,
      error: () => void
    ) => {
      onConnected = connected;
      onEvent = event;
      onError = error;
      return { setTyping, close };
    }
  );
  TestBed.configureTestingModule({
    providers: [
      ChannelTypingStore,
      {
        provide: ChannelApplicationService,
        useValue: { connectChannelTyping },
      },
    ],
  });
  return {
    store: TestBed.inject(ChannelTypingStore),
    setTyping,
    close,
    connectChannelTyping,
    connected: () => onConnected?.(),
    event: (isTyping: boolean) => onEvent?.({ profileId, isTyping }),
    fail: () => onError?.(),
  };
};

describe('ChannelTypingStore', () => {
  afterEach(() => vi.useRealTimers());

  it('publishes one start per burst and an idle stop', async () => {
    vi.useFakeTimers();
    const configured = configureStore();
    configured.store.connect(channelId);
    configured.connected();

    configured.store.recordActivity();
    configured.store.recordActivity();
    await vi.advanceTimersByTimeAsync(1_500);

    expect(configured.setTyping).toHaveBeenNthCalledWith(1, true);
    expect(configured.setTyping).toHaveBeenNthCalledWith(2, false);
  });

  it('expires remote typing when a stop event is lost', async () => {
    vi.useFakeTimers();
    const configured = configureStore();
    configured.store.connect(channelId);
    configured.connected();
    configured.event(true);

    expect(configured.store.view()).toEqual({ kind: 'typing', count: 1 });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(configured.store.view()).toEqual({ kind: 'idle' });
  });

  it('exposes failure, closes the old connection, and retries', () => {
    const configured = configureStore();
    configured.store.connect(channelId);
    configured.fail();

    expect(configured.store.status()).toBe('failed');
    configured.store.retry();

    expect(configured.close).toHaveBeenCalledOnce();
    expect(configured.connectChannelTyping).toHaveBeenCalledTimes(2);
  });
});
