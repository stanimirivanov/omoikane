import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { LucideArchiveRestore } from '@lucide/angular';
import type { Channel, ChannelId } from '@omoikane/domain/channel';
import type { WorkspaceId } from '@omoikane/domain/workspace';
import { ArchivedChannelListStore } from './archived-channel-list.store';

/** Presents owner-only archived-channel history and explicit restoration consent. */
@Component({
  selector: 'app-archived-channel-list',
  standalone: true,
  imports: [DatePipe, MatButtonModule, LucideArchiveRestore],
  providers: [ArchivedChannelListStore],
  templateUrl: './archived-channel-list.component.html',
  styleUrl: './archived-channel-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArchivedChannelListComponent {
  readonly workspaceId = input.required<WorkspaceId>();
  readonly activeChannels = input.required<readonly Channel[]>();
  readonly channelRestored = output<Channel>();
  protected readonly store = inject(ArchivedChannelListStore);
  protected readonly pendingRestorationChannelId = signal<ChannelId | null>(
    null
  );
  private activeIdentitySnapshot: string | null = null;

  constructor() {
    effect(() => {
      const workspaceId = this.workspaceId();
      this.pendingRestorationChannelId.set(null);
      const identitySnapshot = `${workspaceId}:${this.activeChannels()
        .map((channel) => channel.id)
        .sort()
        .join(',')}`;

      if (identitySnapshot === this.activeIdentitySnapshot) {
        return;
      }

      const force = this.store.workspaceId() === workspaceId;
      this.activeIdentitySnapshot = identitySnapshot;
      void this.store.load(workspaceId, force);
    });
  }

  protected requestRestoration(channelId: ChannelId): void {
    this.store.clearRestorationError();
    this.pendingRestorationChannelId.set(channelId);
  }

  protected cancelRestoration(): void {
    this.pendingRestorationChannelId.set(null);
  }

  protected async confirmRestoration(channelId: ChannelId): Promise<void> {
    this.pendingRestorationChannelId.set(null);
    const channel = await this.store.restore(channelId);

    if (channel !== null) {
      this.channelRestored.emit(channel);
    }
  }
}
