import { Component, input, output, signal } from '@angular/core';
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
import { WorkspaceIdSchema, type Workspace } from '@omoikane/domain/workspace';
import { ArchivedWorkspaceListComponent } from '@client/features/archived-workspace-list/archived-workspace-list.component';
import { ChannelNavigationComponent } from '@client/features/channel-navigation/channel-navigation.component';
import { WorkspaceMemberDirectoryComponent } from '@client/features/workspace-member-directory/workspace-member-directory.component';
import { WorkspaceInvitationsComponent } from '@client/features/workspace-invitations/workspace-invitations.component';
import { WorkspacePresenceComponent } from '@client/features/workspace-presence/workspace-presence.component';
import { WorkspaceMessageSearchComponent } from '@client/features/workspace-message-search/workspace-message-search.component';
import type { WorkspaceMessageSearchResult } from '@omoikane/application/message';
import { WorkspaceNavigationComponent } from './workspace-navigation.component';
import { WorkspaceNavigationStore } from './workspace-navigation.store';

const workspace: Workspace = {
  id: Schema.decodeUnknownSync(WorkspaceIdSchema)(
    '00000000-0000-4000-8000-000000000001'
  ),
  name: 'Omoikane Development',
  slug: 'omoikane-development',
  description: null,
};

const updatedWorkspace: Workspace = {
  ...workspace,
  name: 'Omoikane Community',
  slug: 'omoikane-community',
  description: 'Updated collaboration space',
};

@Component({
  selector: 'app-channel-navigation',
  standalone: true,
  template: '',
})
class ChannelNavigationStubComponent {
  readonly workspaceId = input.required<typeof workspace.id>();
  readonly canManageChannels = input(false);
  readonly canModerateMessages = input(false);
}

@Component({
  selector: 'app-workspace-member-directory',
  standalone: true,
  template: '',
})
class WorkspaceMemberDirectoryStubComponent {
  readonly workspaceId = input.required<typeof workspace.id>();
  readonly canManageMembersChange = output<boolean>();
}

@Component({
  selector: 'app-workspace-invitations',
  standalone: true,
  template: '',
})
class WorkspaceInvitationsStubComponent {
  readonly workspaceId = input<typeof workspace.id | null>(null);
  readonly canInvite = input(false);
  readonly invitationAccepted = output<Workspace>();
}

@Component({
  selector: 'app-workspace-presence',
  standalone: true,
  template: '',
})
class WorkspacePresenceStubComponent {
  readonly workspaceId = input.required<typeof workspace.id>();
}

@Component({
  selector: 'app-workspace-message-search',
  standalone: true,
  template: '',
})
class WorkspaceMessageSearchStubComponent {
  readonly workspaceId = input.required<typeof workspace.id>();
  readonly resultSelected = output<WorkspaceMessageSearchResult>();
}

@Component({
  selector: 'app-archived-workspace-list',
  standalone: true,
  template: '',
})
class ArchivedWorkspaceListStubComponent {
  readonly refreshVersion = input(0);
  readonly workspaceRestored = output<Workspace>();
}

const configureComponent = async ({
  queryParams,
  workspaces = [workspace],
  selectedWorkspace = null,
}: {
  readonly queryParams: Params;
  readonly workspaces?: readonly Workspace[];
  readonly selectedWorkspace?: Workspace | null;
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
  const store = {
    workspaces: signal(workspaces),
    selectedWorkspaceId: signal(selectedWorkspace?.id ?? null),
    selectedWorkspace: signal(selectedWorkspace),
    isLoading: signal(false),
    isCreating: signal(false),
    isUpdating: signal(false),
    isArchiving: signal(false),
    isLeaving: signal(false),
    hasWorkspaces: signal(workspaces.length > 0),
    loadStatus: signal('loaded'),
    error: signal(null),
    realtimeStatus: signal('observing'),
    realtimeError: signal<{ readonly message: string } | null>(null),
    creationError: signal(null),
    updateError: signal(null),
    archiveError: signal(null),
    departureError: signal(null),
    load: vi.fn().mockResolvedValue(undefined),
    createWorkspace: vi.fn().mockResolvedValue(workspace),
    updateSelectedWorkspace: vi.fn().mockResolvedValue(updatedWorkspace),
    archiveSelectedWorkspace: vi.fn().mockResolvedValue(workspace.id),
    leaveSelectedWorkspace: vi.fn().mockResolvedValue(workspace.id),
    select: vi.fn().mockReturnValue(true),
    clearSelection: vi.fn(),
    clearCreationError: vi.fn(),
    clearUpdateError: vi.fn(),
    clearArchiveError: vi.fn(),
    clearDepartureError: vi.fn(),
    includeAccessibleWorkspace: vi.fn(),
    retryRealtime: vi.fn(),
  };

  TestBed.overrideComponent(WorkspaceNavigationComponent, {
    remove: {
      imports: [
        ArchivedWorkspaceListComponent,
        ChannelNavigationComponent,
        WorkspaceInvitationsComponent,
        WorkspaceMemberDirectoryComponent,
        WorkspacePresenceComponent,
        WorkspaceMessageSearchComponent,
      ],
    },
    add: {
      imports: [
        ArchivedWorkspaceListStubComponent,
        ChannelNavigationStubComponent,
        WorkspaceInvitationsStubComponent,
        WorkspaceMemberDirectoryStubComponent,
        WorkspacePresenceStubComponent,
        WorkspaceMessageSearchStubComponent,
      ],
    },
  });

  TestBed.overrideComponent(WorkspaceNavigationComponent, {
    set: {
      providers: [
        {
          provide: WorkspaceNavigationStore,
          useValue: store,
        },
      ],
    },
  });

  await TestBed.configureTestingModule({
    imports: [WorkspaceNavigationComponent],
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

  const fixture = TestBed.createComponent(WorkspaceNavigationComponent);
  fixture.detectChanges();
  await fixture.whenStable();

  return { fixture, route, router, store };
};

describe('WorkspaceNavigationComponent', () => {
  it('restores route selection and writes user selection to history', async () => {
    const { fixture, route, router, store } = await configureComponent({
      queryParams: {
        workspace: workspace.slug,
      },
    });

    expect(store.load).toHaveBeenCalledOnce();
    expect(store.select).toHaveBeenCalledExactlyOnceWith(workspace.id);
    expect(fixture.nativeElement.textContent).toContain(workspace.name);

    const button: HTMLButtonElement =
      fixture.nativeElement.querySelector('nav button');
    button.click();

    expect(router.navigate).toHaveBeenCalledExactlyOnceWith([], {
      relativeTo: route,
      queryParams: {
        workspace: workspace.slug,
        channel: null,
        message: null,
      },
      queryParamsHandling: 'merge',
    });
  });

  it('removes an inaccessible workspace slug from the URL', async () => {
    const { route, router, store } = await configureComponent({
      queryParams: {
        workspace: 'inaccessible',
        channel: 'general',
      },
      workspaces: [],
    });

    expect(store.clearSelection).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith([], {
      relativeTo: route,
      queryParams: {
        workspace: null,
        channel: null,
        message: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('clears workspace and channel URL state when realtime removes access', async () => {
    const { fixture, route, router, store } = await configureComponent({
      queryParams: {
        workspace: workspace.slug,
        channel: 'general',
      },
      selectedWorkspace: workspace,
    });

    expect(router.navigate).not.toHaveBeenCalled();

    store.workspaces.set([]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(store.clearSelection).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith([], {
      relativeTo: route,
      queryParams: {
        workspace: null,
        channel: null,
        message: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('refreshes archived history when active workspace identities change', async () => {
    const { fixture, store } = await configureComponent({
      queryParams: {},
    });
    const archivedList = fixture.debugElement.query(
      By.directive(ArchivedWorkspaceListStubComponent)
    ).componentInstance as ArchivedWorkspaceListStubComponent;

    expect(archivedList.refreshVersion()).toBe(0);

    store.workspaces.set([]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(archivedList.refreshVersion()).toBe(1);
  });

  it('renders a recoverable realtime failure and retries on request', async () => {
    const { fixture, store } = await configureComponent({ queryParams: {} });

    store.realtimeError.set({
      message:
        'Live workspace access updates are unavailable. Retry to reconnect.',
    });
    fixture.detectChanges();

    const retryButton = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button'
      ) as NodeListOf<HTMLButtonElement>
    ).find((button) => button.textContent?.trim() === 'Retry live updates');

    expect(fixture.nativeElement.textContent).toContain(
      'Live workspace access updates are unavailable.'
    );
    retryButton?.click();

    expect(store.retryRealtime).toHaveBeenCalledOnce();
  });

  it('creates a workspace and navigates to its canonical slug', async () => {
    const { fixture, route, router, store } = await configureComponent({
      queryParams: {},
    });
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button'
      ) as NodeListOf<HTMLButtonElement>
    );
    const createButton = buttons.find(
      (button) => button.textContent?.trim() === 'Create workspace'
    );

    createButton?.click();
    fixture.detectChanges();

    const nameInput: HTMLInputElement =
      fixture.nativeElement.querySelector('#workspace-name');
    const slugInput: HTMLInputElement =
      fixture.nativeElement.querySelector('#workspace-slug');
    const descriptionInput: HTMLTextAreaElement =
      fixture.nativeElement.querySelector('#workspace-description');
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');

    nameInput.value = 'Omoikane Development';
    slugInput.value = 'omoikane-development';
    descriptionInput.value = 'Team collaboration';
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );

    await fixture.whenStable();

    expect(store.createWorkspace).toHaveBeenCalledExactlyOnceWith({
      name: 'Omoikane Development',
      slug: 'omoikane-development',
      description: 'Team collaboration',
    });
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith([], {
      relativeTo: route,
      queryParams: {
        workspace: workspace.slug,
        channel: null,
        message: null,
      },
      queryParamsHandling: 'merge',
    });
  });

  it('adds a restored workspace to active navigation and selects it', async () => {
    const { fixture, route, router, store } = await configureComponent({
      queryParams: {},
      workspaces: [],
    });
    const archivedList = fixture.debugElement.query(
      By.directive(ArchivedWorkspaceListStubComponent)
    ).componentInstance as ArchivedWorkspaceListStubComponent;

    archivedList.workspaceRestored.emit(workspace);

    expect(store.includeAccessibleWorkspace).toHaveBeenCalledExactlyOnceWith(
      workspace
    );
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith([], {
      relativeTo: route,
      queryParams: {
        workspace: workspace.slug,
        channel: null,
        message: null,
      },
      queryParamsHandling: 'merge',
    });
  });

  it('lets an owner edit details and replaces a changed slug in the URL', async () => {
    const { fixture, route, router, store } = await configureComponent({
      queryParams: {
        workspace: workspace.slug,
        channel: 'general',
      },
      selectedWorkspace: workspace,
    });
    const directory = fixture.debugElement.query(
      By.directive(WorkspaceMemberDirectoryStubComponent)
    ).componentInstance as WorkspaceMemberDirectoryStubComponent;

    expect(fixture.nativeElement.textContent).not.toContain('Edit workspace');
    directory.canManageMembersChange.emit(true);
    fixture.detectChanges();

    const channelNavigation = fixture.debugElement.query(
      By.directive(ChannelNavigationStubComponent)
    ).componentInstance as ChannelNavigationStubComponent;
    expect(channelNavigation.canManageChannels()).toBe(true);
    expect(channelNavigation.canModerateMessages()).toBe(true);

    const editButton = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button'
      ) as NodeListOf<HTMLButtonElement>
    ).find((button) => button.textContent?.trim() === 'Edit workspace');
    editButton?.click();
    fixture.detectChanges();

    const nameInput = fixture.nativeElement.querySelector(
      '#workspace-edit-name'
    ) as HTMLInputElement;
    const slugInput = fixture.nativeElement.querySelector(
      '#workspace-edit-slug'
    ) as HTMLInputElement;
    const descriptionInput = fixture.nativeElement.querySelector(
      '#workspace-edit-description'
    ) as HTMLTextAreaElement;
    const form = nameInput.closest('form') as HTMLFormElement;
    nameInput.value = updatedWorkspace.name;
    slugInput.value = updatedWorkspace.slug;
    descriptionInput.value = updatedWorkspace.description ?? '';
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );

    await fixture.whenStable();

    expect(store.updateSelectedWorkspace).toHaveBeenCalledExactlyOnceWith({
      name: updatedWorkspace.name,
      slug: updatedWorkspace.slug,
      description: updatedWorkspace.description,
    });
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith([], {
      relativeTo: route,
      queryParams: { workspace: updatedWorkspace.slug },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('requires owner confirmation before archiving and clears its route', async () => {
    const { fixture, route, router, store } = await configureComponent({
      queryParams: {
        workspace: workspace.slug,
        channel: 'general',
      },
      selectedWorkspace: workspace,
    });
    const directory = fixture.debugElement.query(
      By.directive(WorkspaceMemberDirectoryStubComponent)
    ).componentInstance as WorkspaceMemberDirectoryStubComponent;

    expect(fixture.nativeElement.textContent).not.toContain(
      'Archive workspace'
    );
    directory.canManageMembersChange.emit(true);
    fixture.detectChanges();

    const archiveButton = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button'
      ) as NodeListOf<HTMLButtonElement>
    ).find((button) => button.textContent?.trim() === 'Archive workspace');
    archiveButton?.click();
    fixture.detectChanges();

    expect(store.archiveSelectedWorkspace).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain(
      `Archive ${workspace.name}?`
    );

    const confirmButton = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button'
      ) as NodeListOf<HTMLButtonElement>
    ).find((button) => button.textContent?.trim() === 'Confirm archive');
    confirmButton?.click();

    await fixture.whenStable();

    expect(store.archiveSelectedWorkspace).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith([], {
      relativeTo: route,
      queryParams: {
        workspace: null,
        channel: null,
        message: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('requires member confirmation before leaving and clears its route', async () => {
    const { fixture, route, router, store } = await configureComponent({
      queryParams: {
        workspace: workspace.slug,
        channel: 'general',
      },
      selectedWorkspace: workspace,
    });

    const leaveButton = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button'
      ) as NodeListOf<HTMLButtonElement>
    ).find((button) => button.textContent?.trim() === 'Leave workspace');
    leaveButton?.click();
    fixture.detectChanges();

    expect(store.leaveSelectedWorkspace).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain(
      `Leave ${workspace.name}?`
    );

    const confirmButton = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button'
      ) as NodeListOf<HTMLButtonElement>
    ).find((button) => button.textContent?.trim() === 'Confirm leave');
    confirmButton?.click();

    await fixture.whenStable();

    expect(store.leaveSelectedWorkspace).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith([], {
      relativeTo: route,
      queryParams: {
        workspace: null,
        channel: null,
        message: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });
});
