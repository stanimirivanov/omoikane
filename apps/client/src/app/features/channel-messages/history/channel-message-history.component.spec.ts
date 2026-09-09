import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import {
  MessageRevisionSchema,
  MessageSchema,
  type Message,
} from '@omoikane/domain/message';
import { ProfileSchema, type Profile } from '@omoikane/domain/profile';
import { AuthenticationStore } from '@client/features/authentication/store/authentication.store';
import { ChannelMessagesStore } from '../channel-messages.store';
import { ChannelMessageHistoryComponent } from './channel-message-history.component';

const currentUserId = '00000000-0000-4000-8000-000000000010';
const otherUserId = '00000000-0000-4000-8000-000000000011';

const makeMessage = (id: string, authorId: string, content: string): Message =>
  Schema.decodeUnknownSync(MessageSchema)({
    id,
    channelId: '00000000-0000-4000-8000-000000000020',
    authorId,
    status: 'active',
    content,
    createdAt: new Date('2026-07-31T08:00:00.000Z'),
    editedAt: null,
  });

const ownMessage = makeMessage(
  '00000000-0000-4000-8000-000000000030',
  currentUserId,
  'My message'
);
const otherMessage = makeMessage(
  '00000000-0000-4000-8000-000000000031',
  otherUserId,
  'Another message'
);
const editedAt = new Date('2026-07-31T09:15:00.000Z');
const editedMessage = Schema.decodeUnknownSync(MessageSchema)({
  ...otherMessage,
  content: 'Edited message',
  editedAt,
});
const revision = Schema.decodeUnknownSync(MessageRevisionSchema)({
  id: '00000000-0000-4000-8000-000000000040',
  messageId: editedMessage.id,
  versionNumber: 2,
  content: 'Edited message',
  createdBy: otherUserId,
  createdAt: editedAt,
});
const deletedAt = new Date('2026-07-31T10:30:00.000Z');
const deletedMessage = Schema.decodeUnknownSync(MessageSchema)({
  ...otherMessage,
  status: 'deleted',
  content: null,
  deletedAt,
});
const otherProfile = Schema.decodeUnknownSync(ProfileSchema)({
  id: otherUserId,
  username: 'workspace-member',
  displayName: 'Workspace Member',
  avatarUrl: 'https://example.com/workspace-member.png',
  status: 'active',
});

const configureComponent = async (
  messages: readonly Message[] = [ownMessage, otherMessage],
  authorProfiles: readonly Profile[] = [],
  realtimeError: {
    readonly tag: string;
    readonly message: string;
  } | null = null,
  canModerateMessages = false
) => {
  const authenticatedUserId = signal<string | null>(currentUserId);
  const revisionHistoryMessageId = signal<Message['id'] | null>(null);
  const store = {
    channelId: signal(messages[0]?.channelId ?? null),
    messages: signal(messages),
    authorProfiles: signal(authorProfiles),
    focusedMessageId: signal<Message['id'] | null>(null),
    focusedMessageView: signal({ kind: 'idle' } as const),
    historyView: signal({
      content:
        messages.length === 0
          ? ({ kind: 'empty' } as const)
          : ({ kind: 'messages', messages } as const),
      isEditing: false,
      isDeleting: false,
      canLoadOlder: false,
      isLoadingOlder: false,
      editError: null,
      deleteError: null,
      realtimeError,
    }),
    revisionHistoryView: computed(() => {
      const messageId = revisionHistoryMessageId();
      return messageId === null
        ? ({ kind: 'closed' } as const)
        : ({
            kind: 'revisions',
            messageId,
            revisions: [revision],
            canLoadOlder: false,
            isLoadingOlder: false,
          } as const);
    }),
    revisionHistoryMessageId,
    refresh: vi.fn(),
    loadOlder: vi.fn(),
    edit: vi.fn().mockResolvedValue(true),
    delete: vi.fn().mockResolvedValue(true),
    clearEditError: vi.fn(),
    clearDeleteError: vi.fn(),
    retryRealtime: vi.fn(),
    openRevisionHistory: vi.fn(),
    closeRevisionHistory: vi.fn(),
    loadOlderMessageRevisions: vi.fn(),
  };

  await TestBed.configureTestingModule({
    imports: [ChannelMessageHistoryComponent],
    providers: [
      {
        provide: ChannelMessagesStore,
        useValue: store,
      },
      {
        provide: AuthenticationStore,
        useValue: { currentUserId: authenticatedUserId },
      },
    ],
  }).compileComponents();

  const fixture: ComponentFixture<ChannelMessageHistoryComponent> =
    TestBed.createComponent(ChannelMessageHistoryComponent);
  fixture.componentRef.setInput('canModerateMessages', canModerateMessages);
  fixture.detectChanges();

  return { authenticatedUserId, fixture, store };
};

const findButton = (
  fixture: ComponentFixture<ChannelMessageHistoryComponent>,
  label: string
): HTMLButtonElement | undefined => {
  const buttons: NodeListOf<HTMLButtonElement> =
    fixture.nativeElement.querySelectorAll('button');

  return [...buttons].find((button) => button.textContent?.trim() === label);
};

describe('ChannelMessageHistoryComponent', () => {
  it('renders an accessible machine-readable creation time', async () => {
    const { fixture } = await configureComponent([ownMessage]);
    const time = fixture.nativeElement.querySelector('time') as HTMLTimeElement;

    expect(time.dateTime).toBe(ownMessage.createdAt.toISOString());
    expect(time.getAttribute('aria-label')).toMatch(/^Sent /);
    expect(time.textContent?.trim()).not.toBe('');
    expect(fixture.nativeElement.textContent).not.toContain('Edited');
    expect(
      fixture.nativeElement.querySelector('ol[aria-label="Channel messages"]')
    ).not.toBeNull();
  });

  it('renders edited metadata only when an edit timestamp exists', async () => {
    const { fixture } = await configureComponent([editedMessage]);
    const item = fixture.nativeElement.querySelector('li') as HTMLLIElement;
    const editedTime = [...item.querySelectorAll('time')].find(
      (time) => time.dateTime === editedAt.toISOString()
    );

    expect(item.textContent).toContain('Edited');
    expect(editedTime).toBeDefined();
    expect(editedTime?.getAttribute('aria-label')).toMatch(/^Edited /);
  });

  it('offers revision history to the message author only after an edit', async () => {
    const ownEditedMessage = Schema.decodeUnknownSync(MessageSchema)({
      ...ownMessage,
      content: 'My edited message',
      editedAt,
    });
    const { fixture, store } = await configureComponent([ownEditedMessage]);

    const button = findButton(fixture, 'View edit history');
    expect(button).toBeDefined();
    button?.click();

    expect(store.openRevisionHistory).toHaveBeenCalledExactlyOnceWith(
      ownEditedMessage.id
    );
  });

  it('lets a workspace owner inspect another author revision history', async () => {
    const { fixture, store } = await configureComponent(
      [editedMessage],
      [],
      null,
      true
    );

    findButton(fixture, 'View edit history')?.click();

    expect(store.openRevisionHistory).toHaveBeenCalledExactlyOnceWith(
      editedMessage.id
    );
  });

  it('renders a loaded revision with semantic time metadata', async () => {
    const { fixture, store } = await configureComponent(
      [editedMessage],
      [],
      null,
      true
    );
    store.revisionHistoryMessageId.set(editedMessage.id);
    fixture.detectChanges();

    const revisionSection = fixture.nativeElement.querySelector(
      '[aria-label="Message edit history"]'
    ) as HTMLElement;
    const time = revisionSection.querySelector('time') as HTMLTimeElement;

    expect(revisionSection.textContent).toContain('Version 2');
    expect(revisionSection.textContent).toContain('Edited message');
    expect(time.dateTime).toBe(revision.createdAt.toISOString());
    expect(time.getAttribute('aria-label')).toMatch(/^Version 2 created /);
  });

  it('does not disclose another author revision control to a member', async () => {
    const { fixture } = await configureComponent([editedMessage]);

    expect(findButton(fixture, 'View edit history')).toBeUndefined();
  });

  it('renders deleted state with its machine-readable deletion time', async () => {
    const { fixture } = await configureComponent([deletedMessage]);
    const item = fixture.nativeElement.querySelector('li') as HTMLLIElement;
    const deletedTime = [...item.querySelectorAll('time')].find(
      (time) => time.dateTime === deletedAt.toISOString()
    );

    expect(item.textContent).toContain('Message deleted');
    expect(deletedTime).toBeDefined();
    expect(deletedTime?.getAttribute('aria-label')).toMatch(/^Deleted /);
    expect(item.querySelector('button')).toBeNull();
  });

  it('offers mutation controls only for the current user message', async () => {
    const { fixture } = await configureComponent();
    const items: NodeListOf<HTMLLIElement> =
      fixture.nativeElement.querySelectorAll('li');

    expect(items[0].textContent).toContain('You');
    expect(items[0].textContent).toContain('Edit');
    expect(items[0].textContent).toContain('Delete');

    expect(items[1].textContent).toContain('Another user');
    expect(items[1].textContent).not.toContain('Edit');
    expect(items[1].textContent).not.toContain('Delete');
  });

  it('lets an owner delete another author message without offering edit', async () => {
    const { fixture, store } = await configureComponent(
      [otherMessage],
      [],
      null,
      true
    );
    const item = fixture.nativeElement.querySelector('li') as HTMLLIElement;

    expect(item.textContent).not.toContain('Edit');
    expect(item.textContent).toContain('Delete');

    findButton(fixture, 'Delete')?.click();
    fixture.detectChanges();
    findButton(fixture, 'Confirm')?.click();
    await fixture.whenStable();

    expect(store.delete).toHaveBeenCalledExactlyOnceWith(otherMessage.id);
  });

  it('reacts to an authoritative session identity change', async () => {
    const { authenticatedUserId, fixture } = await configureComponent();
    authenticatedUserId.set(otherUserId);
    fixture.detectChanges();

    const items: NodeListOf<HTMLLIElement> =
      fixture.nativeElement.querySelectorAll('li');

    expect(items[0].textContent).toContain('Another user');
    expect(items[0].textContent).not.toContain('Edit');
    expect(items[1].textContent).toContain('You');
    expect(items[1].textContent).toContain('Edit');
  });

  it('renders an RLS-visible display name for another author', async () => {
    const { fixture } = await configureComponent(
      [ownMessage, otherMessage],
      [otherProfile]
    );
    const items: NodeListOf<HTMLLIElement> =
      fixture.nativeElement.querySelectorAll('li');

    expect(items[0].textContent).toContain('You');
    expect(items[1].textContent).toContain('Workspace Member');
    expect(items[1].textContent).not.toContain('Another user');
    expect(
      (items[1].querySelector('app-profile-avatar img') as HTMLImageElement).src
    ).toBe(otherProfile.avatarUrl);
  });

  it('keeps history visible and offers retry when live updates fail', async () => {
    const { fixture, store } = await configureComponent([ownMessage], [], {
      tag: 'MessageRepositoryUnavailableError',
      message: 'Live message updates are unavailable. Retry to reconnect.',
    });

    expect(fixture.nativeElement.textContent).toContain('My message');
    expect(fixture.nativeElement.textContent).toContain(
      'Live message updates are unavailable.'
    );

    const retryButton = findButton(fixture, 'Retry live updates');
    expect(retryButton).toBeDefined();
    retryButton?.click();

    expect(store.retryRealtime).toHaveBeenCalledOnce();
  });

  it('keeps the edit form open when saving is rejected', async () => {
    const { fixture, store } = await configureComponent([ownMessage]);
    store.edit.mockResolvedValueOnce(false);

    const editButton = findButton(fixture, 'Edit');

    expect(editButton).toBeDefined();
    editButton?.click();
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(store.edit).toHaveBeenCalledExactlyOnceWith(
      ownMessage.id,
      ownMessage.content
    );
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
  });

  it('keeps delete confirmation open when deletion is rejected', async () => {
    const { fixture, store } = await configureComponent([ownMessage]);
    store.delete.mockResolvedValueOnce(false);

    const deleteButton = findButton(fixture, 'Delete');
    expect(deleteButton).toBeDefined();
    deleteButton?.click();
    fixture.detectChanges();

    const confirmButton = findButton(fixture, 'Confirm');
    expect(confirmButton).toBeDefined();
    confirmButton?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(store.delete).toHaveBeenCalledExactlyOnceWith(ownMessage.id);
    expect(fixture.nativeElement.textContent).toContain('Delete this message?');
    expect(findButton(fixture, 'Confirm')).toBeDefined();
  });
});
