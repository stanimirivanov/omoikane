import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type {
  Workspace,
  WorkspaceId,
  WorkspaceInvitationId,
} from '@omoikane/domain/workspace';
import { WorkspaceInvitationsStore } from './workspace-invitations.store';

/** Presents recipient consent and selected-owner invitation creation. */
@Component({
  selector: 'app-workspace-invitations',
  standalone: true,
  providers: [WorkspaceInvitationsStore],
  templateUrl: './workspace-invitations.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceInvitationsComponent {
  readonly workspaceId = input<WorkspaceId | null>(null);
  readonly canInvite = input(false);
  readonly invitationAccepted = output<Workspace>();
  protected readonly store = inject(WorkspaceInvitationsStore);
  protected readonly pendingCancellationInvitationId =
    signal<WorkspaceInvitationId | null>(null);
  protected readonly invitationUsername = signal('');

  constructor() {
    void this.store.load();

    effect(() => {
      const workspaceId = this.canInvite() ? this.workspaceId() : null;
      this.pendingCancellationInvitationId.set(null);
      void this.store.loadManagedInvitations(workspaceId);
    });
  }

  protected async invite(
    workspaceId: WorkspaceId,
    username: string
  ): Promise<void> {
    if (await this.store.invite(workspaceId, username)) {
      this.invitationUsername.set('');
    }
  }

  protected async accept(invitationId: WorkspaceInvitationId): Promise<void> {
    const workspace = await this.store.accept(invitationId);

    if (workspace !== null) {
      this.invitationAccepted.emit(workspace);
    }
  }

  protected decline(invitationId: WorkspaceInvitationId): void {
    void this.store.decline(invitationId);
  }

  protected requestCancellation(invitationId: WorkspaceInvitationId): void {
    this.pendingCancellationInvitationId.set(invitationId);
  }

  protected cancelCancellation(): void {
    this.pendingCancellationInvitationId.set(null);
  }

  protected confirmCancellation(invitationId: WorkspaceInvitationId): void {
    this.pendingCancellationInvitationId.set(null);
    void this.store.cancel(invitationId);
  }
}
