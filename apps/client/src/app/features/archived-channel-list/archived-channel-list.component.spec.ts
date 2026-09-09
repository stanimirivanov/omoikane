import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import {
  ArchivedChannelSchema,
  ChannelIdSchema,
  type Channel,
} from '@omoikane/domain/channel';
import { WorkspaceIdSchema } from '@omoikane/domain/workspace';
import { ArchivedChannelListComponent } from './archived-channel-list.component';
import { ArchivedChannelListStore } from './archived-channel-list.store';

describe('ArchivedChannelListComponent', () => {
  it('renders archive history and refreshes after active identities change', async () => {
    const workspaceId = Schema.decodeUnknownSync(WorkspaceIdSchema)(
      '00000000-0000-4000-8000-000000000001'
    );
    const archivedChannel = Schema.decodeUnknownSync(ArchivedChannelSchema)({
      id: '00000000-0000-4000-8000-000000000002',
      workspaceId,
      name: 'Planning',
      slug: 'planning',
      description: null,
      archivedAt: '2026-08-08T14:00:00.000Z',
    });
    const activeChannel: Channel = {
      id: Schema.decodeUnknownSync(ChannelIdSchema)(
        '00000000-0000-4000-8000-000000000003'
      ),
      workspaceId,
      name: 'General',
      slug: 'general',
      description: null,
    };
    const store = {
      workspaceId: signal<typeof workspaceId | null>(null),
      channels: signal([archivedChannel]),
      view: signal({
        content: { kind: 'channels', channels: [archivedChannel] } as const,
        isRestoring: false,
        restorationError: null,
      }),
      load: vi.fn().mockResolvedValue(undefined),
      clearRestorationError: vi.fn(),
      restore: vi.fn().mockResolvedValue({
        id: archivedChannel.id,
        workspaceId,
        name: archivedChannel.name,
        slug: archivedChannel.slug,
        description: archivedChannel.description,
      }),
    };

    TestBed.overrideComponent(ArchivedChannelListComponent, {
      set: {
        providers: [{ provide: ArchivedChannelListStore, useValue: store }],
      },
    });
    await TestBed.configureTestingModule({
      imports: [ArchivedChannelListComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(ArchivedChannelListComponent);
    fixture.componentRef.setInput('workspaceId', workspaceId);
    fixture.componentRef.setInput('activeChannels', [activeChannel]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Planning');
    expect(fixture.nativeElement.querySelector('time').dateTime).toBe(
      '2026-08-08T14:00:00.000Z'
    );
    expect(store.load).toHaveBeenCalledExactlyOnceWith(workspaceId, false);

    store.workspaceId.set(workspaceId);
    fixture.componentRef.setInput('activeChannels', []);
    fixture.detectChanges();

    expect(store.load).toHaveBeenLastCalledWith(workspaceId, true);

    const restored = vi.fn();
    fixture.componentInstance.channelRestored.subscribe(restored);
    const restoreButton = fixture.nativeElement.querySelector(
      '[aria-label="Restore Planning"]'
    ) as HTMLButtonElement;
    restoreButton.click();
    fixture.detectChanges();

    expect(store.restore).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain(
      'Restore Planning to active channel navigation?'
    );

    const confirmButton = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button'
      ) as NodeListOf<HTMLButtonElement>
    ).find((button) => button.textContent?.trim() === 'Confirm restoration');
    confirmButton?.click();
    await fixture.whenStable();

    expect(store.restore).toHaveBeenCalledExactlyOnceWith(archivedChannel.id);
    expect(restored).toHaveBeenCalledOnce();
  });
});
