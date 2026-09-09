import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import type { Message, MessageId } from '@omoikane/domain/message';
import type { AvatarUrl, Profile } from '@omoikane/domain/profile';
import { AuthenticationStore } from '@client/features/authentication/store/authentication.store';
import { ProfileAvatarComponent } from '@client/shared/profile-avatar/profile-avatar.component';
import { ChannelMessagesStore } from '../channel-messages.store';

type MessageInteraction =
  | { readonly kind: 'idle' }
  | { readonly kind: 'editing'; readonly messageId: MessageId }
  | { readonly kind: 'confirming-delete'; readonly messageId: MessageId };

/**
 * Renders channel history, lifecycle metadata, and mutation affordances.
 *
 * Validated domain dates are formatted only for display while their ISO values
 * remain in semantic `time` elements. Browser authorization checks improve
 * presentation correctness; Supabase remains the security boundary.
 */
@Component({
  selector: 'app-channel-message-history',
  standalone: true,
  imports: [DatePipe, ProfileAvatarComponent],
  templateUrl: './channel-message-history.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelMessageHistoryComponent {
  /** Presentation affordance derived from the selected workspace owner role. */
  readonly canModerateMessages = input(false);

  protected readonly store = inject(ChannelMessagesStore);

  private readonly authenticationStore = inject(AuthenticationStore);

  private readonly authorProfilesById = computed(
    () =>
      new Map(
        this.store
          .authorProfiles()
          .map((profile) => [profile.id, profile] as const)
      )
  );

  protected readonly interaction = signal<MessageInteraction>({ kind: 'idle' });

  protected isAuthoredByCurrentUser(message: Message): boolean {
    return message.authorId === this.authenticationStore.currentUserId();
  }

  protected canDeleteMessage(message: Message): boolean {
    return this.isAuthoredByCurrentUser(message) || this.canModerateMessages();
  }

  protected canViewRevisionHistory(message: Message): boolean {
    return (
      message.editedAt !== null &&
      (this.isAuthoredByCurrentUser(message) || this.canModerateMessages())
    );
  }

  protected retryFocusedMessage(): void {
    const channelId = this.store.channelId();
    const messageId = this.store.focusedMessageId();

    if (channelId !== null && messageId !== null) {
      void this.store.selectFocusedMessage(channelId, messageId);
    }
  }

  protected toggleRevisionHistory(messageId: MessageId): void {
    if (this.store.revisionHistoryMessageId() === messageId) {
      this.store.closeRevisionHistory();
      return;
    }

    void this.store.openRevisionHistory(messageId);
  }

  protected authorLabel(message: Message): string {
    if (this.isAuthoredByCurrentUser(message)) {
      return 'You';
    }

    return this.authorProfile(message)?.displayName ?? 'Another user';
  }

  protected authorAvatarUrl(message: Message): AvatarUrl | null {
    return this.authorProfile(message)?.avatarUrl ?? null;
  }

  protected authorAvatarName(message: Message): string {
    return (
      this.authorProfile(message)?.displayName ?? this.authorLabel(message)
    );
  }

  private authorProfile(message: Message): Profile | undefined {
    return this.authorProfilesById().get(message.authorId);
  }

  protected beginEdit(messageId: MessageId): void {
    this.store.clearEditError();
    this.store.closeRevisionHistory();
    this.interaction.set({ kind: 'editing', messageId });
  }

  protected cancelEdit(): void {
    this.store.clearEditError();
    this.interaction.set({ kind: 'idle' });
  }

  protected async saveEdit(
    messageId: MessageId,
    content: string
  ): Promise<void> {
    const edited = await this.store.edit(messageId, content);

    if (edited) {
      this.interaction.set({ kind: 'idle' });
    }
  }

  protected beginDelete(messageId: MessageId): void {
    this.store.clearDeleteError();
    this.interaction.set({ kind: 'confirming-delete', messageId });
  }

  protected cancelDelete(): void {
    this.store.clearDeleteError();
    this.interaction.set({ kind: 'idle' });
  }

  protected async confirmDelete(messageId: MessageId): Promise<void> {
    const deleted = await this.store.delete(messageId);

    if (deleted) {
      this.interaction.set({ kind: 'idle' });
    }
  }
}
