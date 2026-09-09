import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { ProfileId } from '@omoikane/domain/profile';
import type {
  WorkspaceId,
  WorkspaceMemberRole,
} from '@omoikane/domain/workspace';
import { AuthenticationStore } from '@client/features/authentication/store/authentication.store';
import { ProfileAvatarComponent } from '@client/shared/profile-avatar/profile-avatar.component';
import { WorkspaceMemberDirectoryStore } from './workspace-member-directory.store';

type MemberConfirmation =
  | { readonly kind: 'none' }
  | { readonly kind: 'removal' | 'suspension'; readonly profileId: ProfileId };

/**
 * Displays active workspace members and their current roles.
 */
@Component({
  selector: 'app-workspace-member-directory',
  standalone: true,
  imports: [ProfileAvatarComponent],
  providers: [WorkspaceMemberDirectoryStore],
  templateUrl: './workspace-member-directory.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceMemberDirectoryComponent {
  readonly workspaceId = input.required<WorkspaceId>();

  /**
   * Shares the directory's derived owner affordance without exposing its store.
   * Database commands still authorize every management action independently.
   */
  readonly canManageMembersChange = output<boolean>();
  protected readonly store = inject(WorkspaceMemberDirectoryStore);
  private readonly authenticationStore = inject(AuthenticationStore);

  /**
   * Owner status is a presentation affordance only. Membership RPCs
   * independently authorize the current provider session.
   */
  protected readonly canManageMembers = computed(() => {
    const currentProfileId = this.authenticationStore.currentUserId();

    return this.store
      .entries()
      .some(
        (entry) =>
          entry.profileId === currentProfileId && entry.role === 'owner'
      );
  });
  protected readonly confirmation = signal<MemberConfirmation>({
    kind: 'none',
  });

  constructor() {
    effect(() => {
      const workspaceId = this.workspaceId();
      const currentProfileId = this.authenticationStore.currentUserId();
      this.confirmation.set({ kind: 'none' });
      void this.store.load(workspaceId, currentProfileId);
    });

    effect(() => {
      this.canManageMembersChange.emit(this.canManageMembers());
    });
  }

  protected isCurrentUser(profileId: ProfileId): boolean {
    return this.authenticationStore.currentUserId() === profileId;
  }

  protected retryLoad(): void {
    void this.store.load(
      this.workspaceId(),
      this.authenticationStore.currentUserId()
    );
  }

  protected refreshMembers(): void {
    void this.store.load(
      this.workspaceId(),
      this.authenticationStore.currentUserId(),
      { force: true }
    );
  }

  protected changeRole(
    profileId: ProfileId,
    currentRole: WorkspaceMemberRole
  ): void {
    void this.store.changeMemberRole(
      profileId,
      currentRole === 'owner' ? 'member' : 'owner'
    );
  }

  protected requestRemoval(profileId: ProfileId): void {
    this.confirmation.set({ kind: 'removal', profileId });
  }

  protected cancelRemoval(): void {
    this.confirmation.set({ kind: 'none' });
  }

  protected confirmRemoval(profileId: ProfileId): void {
    this.confirmation.set({ kind: 'none' });
    void this.store.removeMember(profileId);
  }

  protected requestSuspension(profileId: ProfileId): void {
    this.confirmation.set({ kind: 'suspension', profileId });
  }

  protected cancelSuspension(): void {
    this.confirmation.set({ kind: 'none' });
  }

  protected confirmSuspension(profileId: ProfileId): void {
    this.confirmation.set({ kind: 'none' });
    void this.store.suspendMember(profileId);
  }
}
