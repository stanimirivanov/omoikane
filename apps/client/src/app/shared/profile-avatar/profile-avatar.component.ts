import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import type { AvatarUrl } from '@omoikane/domain/profile';

/**
 * Renders a validated external avatar with a deterministic initials fallback.
 *
 * The image and fallback are decorative because every current consumer places
 * the component beside the profile's visible display name. A failed image is
 * remembered for that URL so change detection cannot create a retry loop.
 */
@Component({
  selector: 'app-profile-avatar',
  standalone: true,
  templateUrl: './profile-avatar.component.html',
  styleUrl: './profile-avatar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileAvatarComponent {
  readonly avatarUrl = input<AvatarUrl | null>(null);
  readonly displayName = input.required<string>();

  private readonly failedUrl = signal<AvatarUrl | null>(null);

  protected readonly imageUrl = computed(() => {
    const avatarUrl = this.avatarUrl();
    return avatarUrl !== this.failedUrl() ? avatarUrl : null;
  });

  protected readonly initials = computed(() => {
    const words = this.displayName().trim().split(/\s+/u).filter(Boolean);

    if (words.length === 0) {
      return '?';
    }

    return words
      .slice(0, 2)
      .map((word) => Array.from(word)[0] ?? '')
      .join('')
      .toLocaleUpperCase();
  });

  protected markFailed(avatarUrl: AvatarUrl): void {
    this.failedUrl.set(avatarUrl);
  }
}
