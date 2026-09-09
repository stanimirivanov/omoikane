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

  protected readonly editingMessageId = signal<MessageId | null>(null);

  protected readonly deletingMessageId = signal<MessageId | null>(null);

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
    this.deletingMessageId.set(null);
    this.store.closeRevisionHistory();
    this.editingMessageId.set(messageId);
  }

  protected cancelEdit(): void {
    this.store.clearEditError();
    this.editingMessageId.set(null);
  }

  protected async saveEdit(
    messageId: MessageId,
    inputElement: HTMLInputElement
  ): Promise<void> {
    const edited = await this.store.edit(messageId, inputElement.value);

    if (edited) {
      this.editingMessageId.set(null);
    }
  }

  protected beginDelete(messageId: MessageId): void {
    this.store.clearDeleteError();
    this.editingMessageId.set(null);
    this.deletingMessageId.set(messageId);
  }

  protected cancelDelete(): void {
    this.store.clearDeleteError();
    this.deletingMessageId.set(null);
  }

  protected async confirmDelete(messageId: MessageId): Promise<void> {
    const deleted = await this.store.delete(messageId);

    if (deleted) {
      this.deletingMessageId.set(null);
    }
  }
}
