import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceMessageSearchResult } from '@omoikane/application/message';
import { ChannelIdSchema } from '@omoikane/domain/channel';
import { ActiveMessageSchema } from '@omoikane/domain/message';
import { ProfileIdSchema } from '@omoikane/domain/profile';
import { WorkspaceIdSchema } from '@omoikane/domain/workspace';
import { WorkspaceMessageSearchComponent } from './workspace-message-search.component';
import { WorkspaceMessageSearchStore } from './workspace-message-search.store';

const workspaceId = Schema.decodeUnknownSync(WorkspaceIdSchema)(
  '00000000-0000-4000-8000-000000000001'
);
const channelId = Schema.decodeUnknownSync(ChannelIdSchema)(
  '00000000-0000-4000-8000-000000000002'
);
const result: WorkspaceMessageSearchResult = {
  message: Schema.decodeUnknownSync(ActiveMessageSchema)({
    id: '00000000-0000-4000-8000-000000000003',
    channelId,
    authorId: Schema.decodeUnknownSync(ProfileIdSchema)(
      '00000000-0000-4000-8000-000000000004'
    ),
    status: 'active',
    content: 'A recorded project decision',
    createdAt: new Date('2026-08-09T09:00:00.000Z'),
    editedAt: null,
  }),
  channel: { id: channelId, name: 'Planning', slug: 'planning' },
};

describe('WorkspaceMessageSearchComponent', () => {
  it('submits a query and emits the selected accessible result', async () => {
    const store = {
      view: signal({
        kind: 'results',
        query: 'decision',
        results: [result],
      } as const),
      selectWorkspace: vi.fn(),
      search: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.overrideComponent(WorkspaceMessageSearchComponent, {
      set: {
        providers: [{ provide: WorkspaceMessageSearchStore, useValue: store }],
      },
    });
    await TestBed.configureTestingModule({
      imports: [WorkspaceMessageSearchComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(WorkspaceMessageSearchComponent);
    const selected = vi.fn();
    fixture.componentInstance.resultSelected.subscribe(selected);
    fixture.componentRef.setInput('workspaceId', workspaceId);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      'input[type="search"]'
    ) as HTMLInputElement;
    input.value = 'recorded decision';
    input
      .closest('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.nativeElement
      .querySelector<HTMLButtonElement>('.result-button')
      ?.click();

    expect(store.selectWorkspace).toHaveBeenCalledExactlyOnceWith(workspaceId);
    expect(store.search).toHaveBeenCalledExactlyOnceWith('recorded decision');
    expect(selected).toHaveBeenCalledExactlyOnceWith(result);
  });
});
