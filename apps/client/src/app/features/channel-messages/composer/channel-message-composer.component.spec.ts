import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ChannelMessagesStore } from '../channel-messages.store';
import { ChannelMessageComposerComponent } from './channel-message-composer.component';

const configureComponent = async (sent: boolean) => {
  const store = {
    composerView: signal({ isSending: false, error: null }),
    send: vi.fn().mockResolvedValue(sent),
    clearSendError: vi.fn(),
  };

  await TestBed.configureTestingModule({
    imports: [ChannelMessageComposerComponent],
    providers: [
      {
        provide: ChannelMessagesStore,
        useValue: store,
      },
    ],
  }).compileComponents();

  const fixture: ComponentFixture<ChannelMessageComposerComponent> =
    TestBed.createComponent(ChannelMessageComposerComponent);
  fixture.detectChanges();

  return { fixture, store };
};

const submitDraft = async (
  fixture: ComponentFixture<ChannelMessageComposerComponent>,
  draft: string
): Promise<HTMLInputElement> => {
  const input = fixture.nativeElement.querySelector(
    'input'
  ) as HTMLInputElement;
  const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;

  input.value = draft;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  form.dispatchEvent(new Event('submit'));
  await fixture.whenStable();
  fixture.detectChanges();

  return input;
};

describe('ChannelMessageComposerComponent', () => {
  it('clears the draft after successful creation', async () => {
    const { fixture, store } = await configureComponent(true);

    const input = await submitDraft(fixture, 'Send this message');

    expect(store.send).toHaveBeenCalledExactlyOnceWith('Send this message');
    expect(input.value).toBe('');
  });

  it('preserves the draft when creation is rejected', async () => {
    const { fixture, store } = await configureComponent(false);

    const input = await submitDraft(fixture, 'Keep this draft');

    expect(store.send).toHaveBeenCalledExactlyOnceWith('Keep this draft');
    expect(input.value).toBe('Keep this draft');
  });

  it('reports activity and stops typing on blur', async () => {
    const { fixture } = await configureComponent(true);
    const activity = vi.fn();
    const stopped = vi.fn();
    fixture.componentInstance.typingActivity.subscribe(activity);
    fixture.componentInstance.typingStopped.subscribe(stopped);
    const input = fixture.nativeElement.querySelector(
      'input'
    ) as HTMLInputElement;

    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));

    expect(activity).toHaveBeenCalledOnce();
    expect(stopped).toHaveBeenCalledOnce();
  });
});
