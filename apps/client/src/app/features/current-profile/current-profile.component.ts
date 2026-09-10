import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { LucidePencil } from '@lucide/angular';
import { CurrentProfileStore } from './current-profile.store';
import { ProfileAvatarComponent } from '@client/shared/profile-avatar/profile-avatar.component';

/**
 * Displays and edits the current user's profile while retaining session email
 * fallback.
 */
@Component({
  selector: 'app-current-profile',
  standalone: true,
  imports: [ProfileAvatarComponent, MatButtonModule, LucidePencil],
  providers: [CurrentProfileStore],
  templateUrl: './current-profile.component.html',
  styleUrl: './current-profile.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CurrentProfileComponent {
  readonly userId = input.required<string>();
  readonly fallbackEmail = input.required<string>();
  protected readonly store = inject(CurrentProfileStore);
  protected readonly isEditing = signal(false);

  constructor() {
    effect(() => {
      const userId = this.userId();

      this.isEditing.set(false);
      void this.store.load(userId);
    });
  }

  protected beginEdit(): void {
    this.store.clearUpdateError();
    this.isEditing.set(true);
  }

  protected cancelEdit(): void {
    this.store.clearUpdateError();
    this.isEditing.set(false);
  }

  protected async saveProfile(
    displayName: string,
    username: string,
    avatarUrl: string
  ): Promise<void> {
    const updated = await this.store.update({
      displayName,
      username,
      avatarUrl,
    });

    if (updated) {
      this.isEditing.set(false);
    }
  }
}
