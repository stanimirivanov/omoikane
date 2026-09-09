import { Component, computed, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  ActivatedRoute,
  convertToParamMap,
  type Params,
  Router,
} from '@angular/router';
import { Schema } from 'effect';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ChannelIdSchema, type Channel } from '@omoikane/domain/channel';
import { MessageIdSchema, type MessageId } from '@omoikane/domain/message';
import { WorkspaceIdSchema } from '@omoikane/domain/workspace';
import { ArchivedChannelListComponent } from '@client/features/archived-channel-list/archived-channel-list.component';
import { AnalysisRunsComponent } from '@client/features/analysis-runs/analysis-runs.component';
import { ChannelMessagesComponent } from '@client/features/channel-messages/channel-messages.component';
import { ChannelNavigationComponent } from './channel-navigation.component';
import { ChannelNavigationStore } from './channel-navigation.store';

const workspaceId = Schema.decodeUnknownSync(WorkspaceIdSchema)(
  '00000000-0000-4000-8000-000000000001'
);
const nextWorkspaceId = Schema.decodeUnknownSync(WorkspaceIdSchema)(
  '00000000-0000-4000-8000-000000000003'
);
const channelId = Schema.decodeUnknownSync(ChannelIdSchema)(
  '00000000-0000-4000-8000-000000000002'
);
const messageId = Schema.decodeUnknownSync(MessageIdSchema)(
  '00000000-0000-4000-8000-000000000004'
);
const workspaceSlug = 'omoikane-development';
const channel: Channel = {
  id: channelId,
  workspaceId,
  name: 'General',
  slug: 'general',
  description: null,
};

const updatedChannel: Channel = {
  ...channel,
  name: 'Product Design',
  description: 'Design collaboration',
};

@Component({
  selector: 'app-channel-messages',
  standalone: true,
  template: '',
})
class ChannelMessagesStubComponent {
  readonly channelId = input.required<typeof channel.id>();
  readonly focusedMessageId = input<MessageId | null>(null);
  readonly canModerateMessages = input(false);
  readonly readThrough = output<{
    readonly channelId: typeof channel.id;
    readonly messageId: MessageId;
  }>();
}

@Component({
  selector: 'app-archived-channel-list',
  standalone: true,
  template: '',
})
class ArchivedChannelListStubComponent {
  readonly workspaceId = input.required<typeof workspaceId>();
  readonly activeChannels = input.required<readonly Channel[]>();
  readonly channelRestored = output<Channel>();
}

@Component({
  selector: 'app-analysis-runs',
  standalone: true,
  template: '',
})
class AnalysisRunsStubComponent {
  readonly workspaceId = input.required<typeof workspaceId>();
  readonly channelId = input.required<typeof channelId>();
}

const configureComponent = async ({
  queryParams,
  channels = [channel],
  selectedChannel = null,
  canManageChannels = false,
  canModerateMessages = false,
  unreadCount = 0,
}: {
  readonly queryParams: Params;
  readonly channels?: readonly Channel[];
  readonly selectedChannel?: Channel | null;
  readonly canManageChannels?: boolean;
  readonly canModerateMessages?: boolean;
  readonly unreadCount?: number;
}) => {
  const queryParamMap = new BehaviorSubject(convertToParamMap(queryParams));
  const route = {
    queryParamMap: queryParamMap.asObservable(),
    snapshot: {
      queryParamMap: queryParamMap.value,
    },
  };
  const router = {
    navigate: vi.fn().mockResolvedValue(true),
  };
  const channelCollection = signal(channels);
  const selectedChannelSignal = signal(selectedChannel);
  const unreadCountByChannel = signal(
    new Map(unreadCount > 0 ? [[channelId, unreadCount]] : [])
  );
  const store = {
    workspaceId: signal(workspaceId),
    channels: channelCollection,
    selectedChannelId: signal(selectedChannel?.id ?? null),
    selectedChannel: selectedChannelSignal,
    view: computed(() => ({
      content: {
        kind: 'ready' as const,
        channels: channelCollection(),
        selectedChannel: selectedChannelSignal(),
        unreadCountByChannel: unreadCountByChannel(),
      },
      operations: {
        isBusy: false,
        isCreating: false,
        isUpdating: false,
        isArchiving: false,
      },
      realtimeError: null,
      unreadError: null,
      unreadRealtimeError: null,
      creationError: null,
      updateError: null,
      archiveError: null,
    })),
    loadStatus: signal('loaded'),
    error: signal(null),
    realtimeError: signal(null),
    unreadError: signal(null),
    unreadRealtimeError: signal(null),
    unreadCountByChannel,
    creationError: signal(null),
    updateError: signal(null),
    archiveError: signal(null),
    load: vi.fn().mockResolvedValue(undefined),
    createChannel: vi.fn().mockResolvedValue(channel),
    updateSelectedChannel: vi.fn().mockResolvedValue(updatedChannel),
    archiveSelectedChannel: vi.fn().mockResolvedValue(channel.id),
    select: vi.fn().mockReturnValue(true),
    clearSelection: vi.fn(),
    includeRestoredChannel: vi.fn().mockReturnValue(true),
    clearCreationError: vi.fn(),
    clearUpdateError: vi.fn(),
    clearArchiveError: vi.fn(),
    retryRealtime: vi.fn(),
    retryUnreadCounts: vi.fn(),
    retryUnreadRealtime: vi.fn(),
    markChannelRead: vi.fn().mockResolvedValue(undefined),
  };

  TestBed.overrideComponent(ChannelNavigationComponent, {
    remove: {
      imports: [
        ArchivedChannelListComponent,
        ChannelMessagesComponent,
        AnalysisRunsComponent,
      ],
    },
    add: {
      imports: [
        ArchivedChannelListStubComponent,
        ChannelMessagesStubComponent,
        AnalysisRunsStubComponent,
      ],
    },
  });

  TestBed.overrideComponent(ChannelNavigationComponent, {
    set: {
      providers: [
        {
          provide: ChannelNavigationStore,
          useValue: store,
        },
      ],
    },
  });

  await TestBed.configureTestingModule({
    imports: [ChannelNavigationComponent],
    providers: [
      {
        provide: ActivatedRoute,
        useValue: route,
      },
      {
        provide: Router,
        useValue: router,
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ChannelNavigationComponent);
  fixture.componentRef.setInput('workspaceId', workspaceId);
  fixture.componentRef.setInput('canManageChannels', canManageChannels);
  fixture.componentRef.setInput('canModerateMessages', canModerateMessages);
  fixture.detectChanges();
  await fixture.whenStable();

  return { fixture, route, router, store };
};

describe('ChannelNavigationComponent', () => {
  it('shows archived channel history only with owner capability', async () => {
    const managed = await configureComponent({
      queryParams: {},
      canManageChannels: true,
    });

    const archivedList = managed.fixture.debugElement.query(
      By.directive(ArchivedChannelListStubComponent)
    ).componentInstance as ArchivedChannelListStubComponent;

    expect(archivedList.workspaceId()).toBe(workspaceId);
    expect(archivedList.activeChannels()).toEqual([channel]);

    managed.fixture.componentRef.setInput('canManageChannels', false);
    managed.fixture.detectChanges();
    expect(
      managed.fixture.debugElement.query(
        By.directive(ArchivedChannelListStubComponent)
      )
    ).toBeNull();
  });

  it('reconciles and selects a restored channel through route navigation', async () => {
    const { fixture, route, router, store } = await configureComponent({
      queryParams: {},
      canManageChannels: true,
    });
    const archivedList = fixture.debugElement.query(
      By.directive(ArchivedChannelListStubComponent)
    ).componentInstance as ArchivedChannelListStubComponent;

    archivedList.channelRestored.emit(updatedChannel);
    fixture.detectChanges();

    expect(store.includeRestoredChannel).toHaveBeenCalledExactlyOnceWith(
      updatedChannel
    );
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith([], {
      relativeTo: route,
      queryParams: { channel: updatedChannel.slug, message: null },
      queryParamsHandling: 'merge',
    });
  });

  it('forwards message moderation capability to the selected channel', async () => {
    const { fixture } = await configureComponent({
      queryParams: {
        workspace: workspaceSlug,
        channel: channel.slug,
      },
      selectedChannel: channel,
      canModerateMessages: true,
    });

    const messages = fixture.debugElement.query(
      By.directive(ChannelMessagesStubComponent)
    ).componentInstance as ChannelMessagesStubComponent;

    expect(messages.channelId()).toBe(channel.id);
    expect(messages.canModerateMessages()).toBe(true);
  });

  it('scopes Analysis Runs to the selected channel', async () => {
    const { fixture } = await configureComponent({
      queryParams: {
        workspace: workspaceSlug,
        channel: channel.slug,
      },
      selectedChannel: channel,
    });

    const analysisRuns = fixture.debugElement.query(
      By.directive(AnalysisRunsStubComponent)
    ).componentInstance as AnalysisRunsStubComponent;

    expect(analysisRuns.workspaceId()).toBe(workspaceId);
    expect(analysisRuns.channelId()).toBe(channelId);
  });

  it('persists the exact newest message reported by channel history', async () => {
    const { fixture, store } = await configureComponent({
      queryParams: {
        workspace: workspaceSlug,
        channel: channel.slug,
      },
      selectedChannel: channel,
    });
    const messages = fixture.debugElement.query(
      By.directive(ChannelMessagesStubComponent)
    ).componentInstance as ChannelMessagesStubComponent;

    messages.readThrough.emit({ channelId, messageId });

    expect(store.markChannelRead).toHaveBeenCalledExactlyOnceWith({
      channelId,
      messageId,
    });
  });

  it('forwards a validated exact-message route to channel history', async () => {
    const { fixture } = await configureComponent({
      queryParams: {
        workspace: workspaceSlug,
        channel: channel.slug,
        message: messageId,
      },
      selectedChannel: channel,
    });

    const messages = fixture.debugElement.query(
      By.directive(ChannelMessagesStubComponent)
    ).componentInstance as ChannelMessagesStubComponent;

    expect(messages.focusedMessageId()).toBe(messageId);
  });

  it('removes an invalid exact-message identity from the route', async () => {
    const { route, router } = await configureComponent({
      queryParams: {
        workspace: workspaceSlug,
        channel: channel.slug,
        message: 'not-a-message-id',
      },
      selectedChannel: channel,
    });

    expect(router.navigate).toHaveBeenCalledExactlyOnceWith([], {
      relativeTo: route,
      queryParams: { message: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('restores route selection and writes user selection to history', async () => {
    const { fixture, route, router, store } = await configureComponent({
      queryParams: {
        workspace: workspaceSlug,
        channel: channel.slug,
      },
    });

    expect(store.load).toHaveBeenCalledExactlyOnceWith(workspaceId);
    expect(store.select).toHaveBeenCalledExactlyOnceWith(channelId);
    expect(fixture.nativeElement.textContent).toContain(channel.name);

    const button: HTMLButtonElement =
      fixture.nativeElement.querySelector('nav button');
    button.click();

    expect(router.navigate).toHaveBeenCalledExactlyOnceWith([], {
      relativeTo: route,
      queryParams: {
        channel: channel.slug,
        message: null,
      },
      queryParamsHandling: 'merge',
    });
  });

  it('renders an accessible unread count beside its channel', async () => {
    const { fixture } = await configureComponent({
      queryParams: {},
      unreadCount: 3,
    });

    const badge = fixture.nativeElement.querySelector(
      '[aria-label="3 unread messages"]'
    );

    expect(badge?.textContent).toContain('3');
  });

  it('clears the route when realtime removes the selected channel', async () => {
    const { fixture, route, router, store } = await configureComponent({
      queryParams: {
        workspace: workspaceSlug,
        channel: channel.slug,
      },
      selectedChannel: channel,
    });
    router.navigate.mockClear();

    store.channels.set([]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(store.clearSelection).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith([], {
      relativeTo: route,
      queryParams: { channel: null, message: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('removes a channel slug that is not in the selected workspace', async () => {
    const { route, router, store } = await configureComponent({
      queryParams: {
        workspace: workspaceSlug,
        channel: 'inaccessible',
      },
      channels: [],
    });

    expect(store.clearSelection).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith([], {
      relativeTo: route,
      queryParams: {
        channel: null,
        message: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('creates a channel and navigates to its canonical slug', async () => {
    const { fixture, route, router, store } = await configureComponent({
      queryParams: {
        workspace: workspaceSlug,
      },
    });
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button'
      ) as NodeListOf<HTMLButtonElement>
    );
    const createButton = buttons.find(
      (button) => button.textContent?.trim() === 'Create channel'
    );

    createButton?.click();
    fixture.detectChanges();

    const nameInput: HTMLInputElement =
      fixture.nativeElement.querySelector('#channel-name');
    const slugInput: HTMLInputElement =
      fixture.nativeElement.querySelector('#channel-slug');
    const descriptionInput: HTMLTextAreaElement =
      fixture.nativeElement.querySelector('#channel-description');
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');

    nameInput.value = 'General';
    slugInput.value = 'general';
    descriptionInput.value = 'Workspace discussion';
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );

    await fixture.whenStable();

    expect(store.createChannel).toHaveBeenCalledExactlyOnceWith({
      name: 'General',
      slug: 'general',
      description: 'Workspace discussion',
    });
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith([], {
      relativeTo: route,
      queryParams: {
        channel: channel.slug,
        message: null,
      },
      queryParamsHandling: 'merge',
    });
  });

  it('lets an owner edit mutable details without changing the route', async () => {
    const { fixture, router, store } = await configureComponent({
      queryParams: {
        workspace: workspaceSlug,
        channel: channel.slug,
      },
      selectedChannel: channel,
    });

    expect(fixture.nativeElement.textContent).not.toContain('Edit channel');
    fixture.componentRef.setInput('canManageChannels', true);
    fixture.detectChanges();

    const editButton = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button'
      ) as NodeListOf<HTMLButtonElement>
    ).find((button) => button.textContent?.trim() === 'Edit channel');
    editButton?.click();
    fixture.detectChanges();

    const nameInput = fixture.nativeElement.querySelector(
      '#channel-edit-name'
    ) as HTMLInputElement;
    const descriptionInput = fixture.nativeElement.querySelector(
      '#channel-edit-description'
    ) as HTMLTextAreaElement;
    const form = nameInput.closest('form') as HTMLFormElement;
    nameInput.value = updatedChannel.name;
    descriptionInput.value = updatedChannel.description ?? '';
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );

    await fixture.whenStable();

    expect(store.updateSelectedChannel).toHaveBeenCalledExactlyOnceWith({
      name: updatedChannel.name,
      description: updatedChannel.description,
    });
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('requires owner confirmation before archiving and clears its route', async () => {
    const { fixture, route, router, store } = await configureComponent({
      queryParams: {
        workspace: workspaceSlug,
        channel: channel.slug,
      },
      selectedChannel: channel,
      canManageChannels: true,
    });

    const archiveButton = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button'
      ) as NodeListOf<HTMLButtonElement>
    ).find((button) => button.textContent?.trim() === 'Archive channel');
    archiveButton?.click();
    fixture.detectChanges();

    expect(store.archiveSelectedChannel).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain(
      `Archive ${channel.name}?`
    );

    const confirmButton = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button'
      ) as NodeListOf<HTMLButtonElement>
    ).find((button) => button.textContent?.trim() === 'Confirm archive');
    confirmButton?.click();

    await fixture.whenStable();

    expect(store.archiveSelectedChannel).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith([], {
      relativeTo: route,
      queryParams: { channel: null, message: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('does not clear a same-slug channel after the workspace changes', async () => {
    let resolveArchive: ((channelId: typeof channel.id) => void) | undefined;
    const archiveResult = new Promise<typeof channel.id>((resolve) => {
      resolveArchive = resolve;
    });
    const { fixture, router, store } = await configureComponent({
      queryParams: {
        workspace: workspaceSlug,
        channel: channel.slug,
      },
      selectedChannel: channel,
      canManageChannels: true,
    });
    store.archiveSelectedChannel.mockReturnValue(archiveResult);

    const archiveButton = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button'
      ) as NodeListOf<HTMLButtonElement>
    ).find((button) => button.textContent?.trim() === 'Archive channel');
    archiveButton?.click();
    fixture.detectChanges();
    const confirmButton = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button'
      ) as NodeListOf<HTMLButtonElement>
    ).find((button) => button.textContent?.trim() === 'Confirm archive');
    confirmButton?.click();

    fixture.componentRef.setInput('workspaceId', nextWorkspaceId);
    fixture.detectChanges();
    resolveArchive?.(channel.id);
    await fixture.whenStable();

    expect(router.navigate).not.toHaveBeenCalled();
  });
});
