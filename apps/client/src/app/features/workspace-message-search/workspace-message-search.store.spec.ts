import { TestBed } from '@angular/core/testing';
import { Either, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import {
  InvalidMessageSearchQueryError,
  MessageRepositoryUnavailableError,
  type WorkspaceMessageSearchResult,
} from '@omoikane/application/message';
import { ChannelIdSchema } from '@omoikane/domain/channel';
import { ActiveMessageSchema } from '@omoikane/domain/message';
import { ProfileIdSchema } from '@omoikane/domain/profile';
import { WorkspaceIdSchema } from '@omoikane/domain/workspace';
import { MessageApplicationService } from '@client/core/message/message-application.service';
import { WorkspaceMessageSearchStore } from './workspace-message-search.store';

const workspaceId = Schema.decodeUnknownSync(WorkspaceIdSchema)(
  '00000000-0000-4000-8000-000000000001'
);
const channelId = Schema.decodeUnknownSync(ChannelIdSchema)(
  '00000000-0000-4000-8000-000000000002'
);
const nextWorkspaceId = Schema.decodeUnknownSync(WorkspaceIdSchema)(
  '00000000-0000-4000-8000-000000000005'
);
const authorId = Schema.decodeUnknownSync(ProfileIdSchema)(
  '00000000-0000-4000-8000-000000000003'
);
const result: WorkspaceMessageSearchResult = {
  message: Schema.decodeUnknownSync(ActiveMessageSchema)({
    id: '00000000-0000-4000-8000-000000000004',
    channelId,
    authorId,
    status: 'active',
    content: 'A recorded project decision',
    createdAt: new Date('2026-08-09T09:00:00.000Z'),
    editedAt: null,
  }),
  channel: {
    id: channelId,
    name: 'Planning',
    slug: 'planning',
  },
};

const configureStore = (searchWorkspaceMessages: ReturnType<typeof vi.fn>) => {
  TestBed.configureTestingModule({
    providers: [
      WorkspaceMessageSearchStore,
      {
        provide: MessageApplicationService,
        useValue: { searchWorkspaceMessages },
      },
    ],
  });

  return TestBed.inject(WorkspaceMessageSearchStore);
};

describe('WorkspaceMessageSearchStore', () => {
  it('retains ranked results for the selected workspace', async () => {
    const searchWorkspaceMessages = vi
      .fn()
      .mockResolvedValue(Either.right([result]));
    const store = configureStore(searchWorkspaceMessages);

    store.selectWorkspace(workspaceId);
    await store.search(' decision ');

    expect(searchWorkspaceMessages).toHaveBeenCalledWith({
      workspaceId,
      query: 'decision',
    });
    expect(store.status()).toBe('completed');
    expect(store.results()).toEqual([result]);
    expect(store.view()).toEqual({
      kind: 'results',
      query: 'decision',
      results: [result],
    });
  });

  it('maps validation and provider failures to safe messages', async () => {
    const searchWorkspaceMessages = vi
      .fn()
      .mockResolvedValueOnce(
        Either.left(new InvalidMessageSearchQueryError({ cause: null }))
      )
      .mockResolvedValueOnce(
        Either.left(
          new MessageRepositoryUnavailableError({
            operation: 'read',
            cause: null,
          })
        )
      );
    const store = configureStore(searchWorkspaceMessages);
    store.selectWorkspace(workspaceId);

    await store.search('x');
    expect(store.error()).toContain('between 2 and 200');

    await store.search('decision');
    expect(store.error()).toContain('currently unavailable');
  });

  it('ignores a completed search after workspace selection changes', async () => {
    let resolveSearch:
      | ((
          value: Either.Either<readonly WorkspaceMessageSearchResult[]>
        ) => void)
      | undefined;
    const pendingSearch = new Promise<
      Either.Either<readonly WorkspaceMessageSearchResult[]>
    >((resolve) => {
      resolveSearch = resolve;
    });
    const store = configureStore(vi.fn().mockReturnValue(pendingSearch));
    store.selectWorkspace(workspaceId);

    const search = store.search('decision');
    store.selectWorkspace(nextWorkspaceId);
    resolveSearch?.(Either.right([result]));
    await search;

    expect(store.workspaceId()).toBe(nextWorkspaceId);
    expect(store.status()).toBe('idle');
    expect(store.results()).toEqual([]);
  });
});
