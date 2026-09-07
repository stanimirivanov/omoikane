import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import type { WorkspaceMessageSearchResult } from '@omoikane/application/message';
import type { Workspace } from '@omoikane/domain/workspace';
import { ArchivedWorkspaceListComponent } from '@client/features/archived-workspace-list/archived-workspace-list.component';
import { ChannelNavigationComponent } from '@client/features/channel-navigation/channel-navigation.component';
import { WorkspaceMemberDirectoryComponent } from '@client/features/workspace-member-directory/workspace-member-directory.component';
import { WorkspaceInvitationsComponent } from '@client/features/workspace-invitations/workspace-invitations.component';
import { WorkspacePresenceComponent } from '@client/features/workspace-presence/workspace-presence.component';
import { WorkspaceMessageSearchComponent } from '@client/features/workspace-message-search/workspace-message-search.component';
import { WorkspaceNavigationStore } from './workspace-navigation.store';
import type { WorkspaceLoadStatus } from './workspace-navigation.state';

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
  ],
  providers: [WorkspaceNavigationStore],
  templateUrl: './workspace-navigation.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceNavigationComponent {
  protected readonly store = inject(WorkspaceNavigationStore);
  protected readonly isCreatingWorkspace = signal(false);
  protected readonly isEditingWorkspace = signal(false);
  protected readonly isConfirmingWorkspaceArchive = signal(false);
  protected readonly isConfirmingWorkspaceDeparture = signal(false);
  protected readonly archivedWorkspaceRefreshVersion = signal(0);
  protected readonly canManageSelectedWorkspace = signal(false);
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

  protected beginWorkspaceCreation(): void {
    this.store.clearCreationError();
    this.store.clearUpdateError();
    this.store.clearArchiveError();
    this.store.clearDepartureError();
    this.isEditingWorkspace.set(false);
    this.isConfirmingWorkspaceArchive.set(false);
    this.isConfirmingWorkspaceDeparture.set(false);
    this.isCreatingWorkspace.set(true);
  }

  protected cancelWorkspaceCreation(): void {
    this.store.clearCreationError();
    this.isCreatingWorkspace.set(false);
  }

  protected async saveWorkspace(
    nameInput: HTMLInputElement,
    slugInput: HTMLInputElement,
    descriptionInput: HTMLTextAreaElement
  ): Promise<void> {
    const workspace = await this.store.createWorkspace({
      name: nameInput.value,
      slug: slugInput.value,
      description: descriptionInput.value,
    });

    if (workspace !== null) {
      this.isCreatingWorkspace.set(false);
      this.navigateToWorkspace(workspace.slug);
    }
  }

  protected beginWorkspaceEditing(): void {
    this.store.clearCreationError();
    this.store.clearUpdateError();
    this.store.clearArchiveError();
    this.store.clearDepartureError();
    this.isCreatingWorkspace.set(false);
    this.isConfirmingWorkspaceArchive.set(false);
    this.isConfirmingWorkspaceDeparture.set(false);
    this.isEditingWorkspace.set(true);
  }

  protected cancelWorkspaceEditing(): void {
    this.store.clearUpdateError();
    this.isEditingWorkspace.set(false);
  }

  protected async saveWorkspaceChanges(
    workspace: Workspace,
    nameInput: HTMLInputElement,
    slugInput: HTMLInputElement,
    descriptionInput: HTMLTextAreaElement
  ): Promise<void> {
    const updatedWorkspace = await this.store.updateSelectedWorkspace({
      name: nameInput.value,
      slug: slugInput.value,
      description: descriptionInput.value,
    });

    if (updatedWorkspace === null) {
      return;
    }

    this.isEditingWorkspace.set(false);

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
    this.isEditingWorkspace.set(false);
    this.isConfirmingWorkspaceDeparture.set(false);
    this.isConfirmingWorkspaceArchive.set(true);
  }

  protected cancelWorkspaceArchive(): void {
    this.store.clearArchiveError();
    this.isConfirmingWorkspaceArchive.set(false);
  }

  /**
   * Archives the selected workspace after an explicit owner confirmation.
   *
   * The store returns the stable identity it archived. The URL is cleared
   * only when it still names that workspace, so a late command completion
   * cannot replace navigation that moved elsewhere while the request ran.
   */
  protected async confirmWorkspaceArchive(workspace: Workspace): Promise<void> {
    this.isConfirmingWorkspaceArchive.set(false);

    const archivedWorkspaceId = await this.store.archiveSelectedWorkspace();

    this.clearRemovedWorkspaceRoute(workspace, archivedWorkspaceId);
  }

  protected beginWorkspaceDeparture(): void {
    this.store.clearDepartureError();
    this.store.clearCreationError();
    this.store.clearUpdateError();
    this.store.clearArchiveError();
    this.isCreatingWorkspace.set(false);
    this.isEditingWorkspace.set(false);
    this.isConfirmingWorkspaceArchive.set(false);
    this.isConfirmingWorkspaceDeparture.set(true);
  }

  protected cancelWorkspaceDeparture(): void {
    this.store.clearDepartureError();
    this.isConfirmingWorkspaceDeparture.set(false);
  }

  /**
   * Leaves the selected workspace after explicit member confirmation.
   */
  protected async confirmWorkspaceDeparture(
    workspace: Workspace
  ): Promise<void> {
    this.isConfirmingWorkspaceDeparture.set(false);

    const departedWorkspaceId = await this.store.leaveSelectedWorkspace();

    this.clearRemovedWorkspaceRoute(workspace, departedWorkspaceId);
  }

  protected handleCanManageMembersChange(canManage: boolean): void {
    this.canManageSelectedWorkspace.set(canManage);

    if (!canManage) {
      this.isEditingWorkspace.set(false);
      this.isConfirmingWorkspaceArchive.set(false);
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
      this.isEditingWorkspace.set(false);
      this.isConfirmingWorkspaceArchive.set(false);
      this.isConfirmingWorkspaceDeparture.set(false);
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
