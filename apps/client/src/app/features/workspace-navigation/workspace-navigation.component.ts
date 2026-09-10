import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideMenu,
  LucidePanelRight,
  LucidePlus,
  LucideSearch,
  LucideX,
} from '@lucide/angular';
import type { WorkspaceMessageSearchResult } from '@omoikane/application/message';
import type { Workspace } from '@omoikane/domain/workspace';
import { map } from 'rxjs';
import { ArchivedWorkspaceListComponent } from '@client/features/archived-workspace-list/archived-workspace-list.component';
import { ChannelNavigationComponent } from '@client/features/channel-navigation/channel-navigation.component';
import { WorkspaceMemberDirectoryComponent } from '@client/features/workspace-member-directory/workspace-member-directory.component';
import { WorkspaceInvitationsComponent } from '@client/features/workspace-invitations/workspace-invitations.component';
import { WorkspacePresenceComponent } from '@client/features/workspace-presence/workspace-presence.component';
import { WorkspaceMessageSearchComponent } from '@client/features/workspace-message-search/workspace-message-search.component';
import { WorkspaceNavigationStore } from './workspace-navigation.store';
import type { WorkspaceLoadStatus } from './workspace-navigation.state';

type WorkspaceInteraction =
  | 'idle'
  | 'creating'
  | 'editing'
  | 'confirming-archive'
  | 'confirming-departure';

type WorkspaceContextView = 'search' | 'management';

interface WorkspaceContextPanelView {
  readonly kind: WorkspaceContextView;
  readonly label: string;
  readonly closeLabel: string;
  readonly eyebrow: string;
  readonly title: string;
}

/**
 * Lists accessible workspaces and owns one feature-scoped selection store.
 */
@Component({
  selector: 'app-workspace-navigation',
  standalone: true,
  imports: [
    ArchivedWorkspaceListComponent,
    ChannelNavigationComponent,
    WorkspaceInvitationsComponent,
    WorkspaceMemberDirectoryComponent,
    WorkspacePresenceComponent,
    WorkspaceMessageSearchComponent,
    MatButtonModule,
    MatSidenavModule,
    MatTooltipModule,
    LucideMenu,
    LucidePanelRight,
    LucidePlus,
    LucideSearch,
    LucideX,
  ],
  providers: [WorkspaceNavigationStore],
  templateUrl: './workspace-navigation.component.html',
  styleUrl: './workspace-navigation.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceNavigationComponent {
  protected readonly store = inject(WorkspaceNavigationStore);
  protected readonly interaction = signal<WorkspaceInteraction>('idle');
  protected readonly archivedWorkspaceRefreshVersion = signal(0);
  protected readonly canManageSelectedWorkspace = signal(false);
  protected readonly workspaceNavigationOpen = signal(false);
  protected readonly contextPanelOpen = signal(false);
  protected readonly contextView = signal<WorkspaceContextView>('management');
  protected readonly contextPanelView = computed<WorkspaceContextPanelView>(
    () =>
      this.contextView() === 'search'
        ? {
            kind: 'search',
            label: 'Workspace message search',
            closeLabel: 'Close workspace message search',
            eyebrow: 'Discovery',
            title: 'Search messages',
          }
        : {
            kind: 'management',
            label: 'Workspace management',
            closeLabel: 'Close workspace management',
            eyebrow: 'Collaboration',
            title: 'Workspace management',
          }
  );
  private readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly compactWorkspaceNavigation = toSignal(
    this.breakpointObserver
      .observe('(max-width: 63.999rem)')
      .pipe(map(({ matches }) => matches)),
    { initialValue: false }
  );
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private accessibleWorkspaceIdentitySnapshot: string | null = null;

  constructor() {
    void this.store.load();

    effect(() => {
      const workspaceSlug = this.queryParamMap().get('workspace');
      const loadStatus = this.store.loadStatus();
      const workspaces = this.store.workspaces();

      this.selectWorkspaceFromRoute(workspaceSlug, loadStatus, workspaces);
    });

    effect(() => {
      if (this.store.loadStatus() !== 'loaded') {
        return;
      }

      const identitySnapshot = this.store
        .workspaces()
        .map((workspace) => workspace.id)
        .sort()
        .join(',');

      if (this.accessibleWorkspaceIdentitySnapshot === null) {
        this.accessibleWorkspaceIdentitySnapshot = identitySnapshot;
        return;
      }

      if (this.accessibleWorkspaceIdentitySnapshot !== identitySnapshot) {
        this.accessibleWorkspaceIdentitySnapshot = identitySnapshot;
        this.archivedWorkspaceRefreshVersion.update((version) => version + 1);
      }
    });
  }

  /**
   * Writes workspace selection to browser history.
   *
   * Selecting another workspace also clears the channel parameter because a
   * channel slug is meaningful only inside its owning workspace.
   */
  protected navigateToWorkspace(workspaceSlug: string): void {
    this.workspaceNavigationOpen.set(false);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        workspace: workspaceSlug,
        channel: null,
        message: null,
      },
      queryParamsHandling: 'merge',
    });
  }

  protected toggleWorkspaceNavigation(): void {
    this.workspaceNavigationOpen.update((open) => !open);
  }

  protected closeWorkspaceNavigation(): void {
    this.workspaceNavigationOpen.set(false);
  }

  protected toggleContextPanel(view: WorkspaceContextView): void {
    if (this.contextPanelOpen() && this.contextView() === view) {
      this.contextPanelOpen.set(false);
      return;
    }

    this.contextView.set(view);
    this.contextPanelOpen.set(true);
  }

  protected closeContextPanel(): void {
    this.contextPanelOpen.set(false);
  }

  protected beginWorkspaceCreation(): void {
    this.store.clearCreationError();
    this.store.clearUpdateError();
    this.store.clearArchiveError();
    this.store.clearDepartureError();
    this.interaction.set('creating');
    this.contextView.set('management');
    this.contextPanelOpen.set(true);
  }

  protected cancelWorkspaceCreation(): void {
    this.store.clearCreationError();
    this.interaction.set('idle');
  }

  protected async saveWorkspace(
    name: string,
    slug: string,
    description: string
  ): Promise<void> {
    const workspace = await this.store.createWorkspace({
      name,
      slug,
      description,
    });

    if (workspace !== null) {
      this.interaction.set('idle');
      this.navigateToWorkspace(workspace.slug);
    }
  }

  protected beginWorkspaceEditing(): void {
    this.store.clearCreationError();
    this.store.clearUpdateError();
    this.store.clearArchiveError();
    this.store.clearDepartureError();
    this.interaction.set('editing');
  }

  protected cancelWorkspaceEditing(): void {
    this.store.clearUpdateError();
    this.interaction.set('idle');
  }

  protected async saveWorkspaceChanges(
    workspace: Workspace,
    name: string,
    slug: string,
    description: string
  ): Promise<void> {
    const updatedWorkspace = await this.store.updateSelectedWorkspace({
      name,
      slug,
      description,
    });

    if (updatedWorkspace === null) {
      return;
    }

    this.interaction.set('idle');

    if (updatedWorkspace.slug !== workspace.slug) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { workspace: updatedWorkspace.slug },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  protected beginWorkspaceArchive(): void {
    this.store.clearArchiveError();
    this.store.clearDepartureError();
    this.interaction.set('confirming-archive');
  }

  protected cancelWorkspaceArchive(): void {
    this.store.clearArchiveError();
    this.interaction.set('idle');
  }

  /**
   * Archives the selected workspace after an explicit owner confirmation.
   *
   * The store returns the stable identity it archived. The URL is cleared
   * only when it still names that workspace, so a late command completion
   * cannot replace navigation that moved elsewhere while the request ran.
   */
  protected async confirmWorkspaceArchive(workspace: Workspace): Promise<void> {
    this.interaction.set('idle');

    const archivedWorkspaceId = await this.store.archiveSelectedWorkspace();

    this.clearRemovedWorkspaceRoute(workspace, archivedWorkspaceId);
  }

  protected beginWorkspaceDeparture(): void {
    this.store.clearDepartureError();
    this.store.clearCreationError();
    this.store.clearUpdateError();
    this.store.clearArchiveError();
    this.interaction.set('confirming-departure');
  }

  protected cancelWorkspaceDeparture(): void {
    this.store.clearDepartureError();
    this.interaction.set('idle');
  }

  /**
   * Leaves the selected workspace after explicit member confirmation.
   */
  protected async confirmWorkspaceDeparture(
    workspace: Workspace
  ): Promise<void> {
    this.interaction.set('idle');

    const departedWorkspaceId = await this.store.leaveSelectedWorkspace();

    this.clearRemovedWorkspaceRoute(workspace, departedWorkspaceId);
  }

  protected handleCanManageMembersChange(canManage: boolean): void {
    this.canManageSelectedWorkspace.set(canManage);

    if (!canManage) {
      if (
        this.interaction() === 'editing' ||
        this.interaction() === 'confirming-archive'
      ) {
        this.interaction.set('idle');
      }
    }
  }

  /** Reconciles newly accepted access and selects the joined workspace. */
  protected handleInvitationAccepted(workspace: Workspace): void {
    this.store.includeAccessibleWorkspace(workspace);
    this.navigateToWorkspace(workspace.slug);
  }

  /** Reconciles a restored workspace into active navigation and selects it. */
  protected handleWorkspaceRestored(workspace: Workspace): void {
    this.store.includeAccessibleWorkspace(workspace);
    this.navigateToWorkspace(workspace.slug);
  }

  /** Navigates directly to the stable message selected from workspace search. */
  protected handleMessageSearchResult(
    result: WorkspaceMessageSearchResult
  ): void {
    this.contextPanelOpen.set(false);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        channel: result.channel.slug,
        message: result.message.id,
      },
      queryParamsHandling: 'merge',
    });
  }

  private selectWorkspaceFromRoute(
    workspaceSlug: string | null,
    loadStatus: WorkspaceLoadStatus,
    workspaces: readonly Workspace[]
  ): void {
    if (loadStatus !== 'loaded') {
      return;
    }

    if (this.store.selectedWorkspace()?.slug !== workspaceSlug) {
      this.canManageSelectedWorkspace.set(false);
      this.interaction.set('idle');
    }

    if (workspaceSlug === null) {
      this.store.clearSelection();
      return;
    }

    const workspace = workspaces.find(
      (candidate) => candidate.slug === workspaceSlug
    );

    if (workspace !== undefined) {
      this.store.select(workspace.id);
      return;
    }

    this.store.clearSelection();

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        workspace: null,
        channel: null,
        message: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /**
   * Clears a removed workspace route only while it still names the command
   * target. Navigation that happened during the request is preserved.
   */
  private clearRemovedWorkspaceRoute(
    workspace: Workspace,
    removedWorkspaceId: Workspace['id'] | null
  ): void {
    if (
      removedWorkspaceId !== workspace.id ||
      this.queryParamMap().get('workspace') !== workspace.slug
    ) {
      return;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        workspace: null,
        channel: null,
        message: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
