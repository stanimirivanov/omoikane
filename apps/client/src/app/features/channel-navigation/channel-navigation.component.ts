import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Schema } from 'effect';
import type { Channel } from '@omoikane/domain/channel';
import { MessageIdSchema } from '@omoikane/domain/message';
import type { WorkspaceId } from '@omoikane/domain/workspace';
import { AnalysisRunsComponent } from '@client/features/analysis-runs/analysis-runs.component';
import { ArchivedChannelListComponent } from '@client/features/archived-channel-list/archived-channel-list.component';
import { ChannelMessagesComponent } from '@client/features/channel-messages/channel-messages.component';
import { ChannelNavigationStore } from './channel-navigation.store';

/**
 * Lists selectable channels for the workspace supplied by its parent.
 *
 * Workspace-owned capabilities arrive as explicit inputs and are forwarded to
 * the feature that owns each affordance; this component does not query or
 * infer membership policy itself.
 */
@Component({
  selector: 'app-channel-navigation',
  standalone: true,
  imports: [
    ArchivedChannelListComponent,
    ChannelMessagesComponent,
    AnalysisRunsComponent,
  ],
  providers: [ChannelNavigationStore],
  templateUrl: './channel-navigation.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelNavigationComponent {
  readonly workspaceId = input.required<WorkspaceId>();
  readonly canManageChannels = input(false);
  readonly canModerateMessages = input(false);
  protected readonly store = inject(ChannelNavigationStore);
  protected readonly isCreatingChannel = signal(false);
  protected readonly isEditingChannel = signal(false);
  protected readonly isConfirmingChannelArchive = signal(false);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected readonly focusedMessageId = computed(() => {
    const value = this.queryParamMap().get('message');

    return value !== null && Schema.is(MessageIdSchema)(value) ? value : null;
  });

  constructor() {
    effect(() => {
      const value = this.queryParamMap().get('message');

      if (value !== null && this.focusedMessageId() === null) {
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { message: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
    });

    effect(() => {
      const workspaceId = this.workspaceId();
      this.isCreatingChannel.set(false);
      this.isEditingChannel.set(false);
      this.isConfirmingChannelArchive.set(false);
      void this.store.load(workspaceId);
    });

    effect(() => {
      const workspaceId = this.workspaceId();
      const channelSlug = this.queryParamMap().get('channel');
      const loadedWorkspaceId = this.store.workspaceId();
      const loadStatus = this.store.loadStatus();
      const channels = this.store.channels();

      if (loadedWorkspaceId !== workspaceId || loadStatus !== 'loaded') {
        return;
      }

      this.selectChannelFromRoute(channelSlug, channels);
    });

    effect(() => {
      if (!this.canManageChannels()) {
        this.isEditingChannel.set(false);
        this.isConfirmingChannelArchive.set(false);
      }
    });
  }

  /**
   * Writes channel selection to browser history.
   */
  protected navigateToChannel(channelSlug: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        channel: channelSlug,
        message: null,
      },
      queryParamsHandling: 'merge',
    });
  }

  protected beginChannelCreation(): void {
    this.store.clearCreationError();
    this.store.clearUpdateError();
    this.store.clearArchiveError();
    this.isEditingChannel.set(false);
    this.isConfirmingChannelArchive.set(false);
    this.isCreatingChannel.set(true);
  }

  protected cancelChannelCreation(): void {
    this.store.clearCreationError();
    this.isCreatingChannel.set(false);
  }

  protected async saveChannel(
    nameInput: HTMLInputElement,
    slugInput: HTMLInputElement,
    descriptionInput: HTMLTextAreaElement
  ): Promise<void> {
    const channel = await this.store.createChannel({
      name: nameInput.value,
      slug: slugInput.value,
      description: descriptionInput.value,
    });

    if (channel !== null) {
      this.isCreatingChannel.set(false);
      this.navigateToChannel(channel.slug);
    }
  }

  protected beginChannelEditing(): void {
    this.store.clearCreationError();
    this.store.clearUpdateError();
    this.store.clearArchiveError();
    this.isCreatingChannel.set(false);
    this.isConfirmingChannelArchive.set(false);
    this.isEditingChannel.set(true);
  }

  protected cancelChannelEditing(): void {
    this.store.clearUpdateError();
    this.isEditingChannel.set(false);
  }

  protected async saveChannelChanges(
    nameInput: HTMLInputElement,
    descriptionInput: HTMLTextAreaElement
  ): Promise<void> {
    const updatedChannel = await this.store.updateSelectedChannel({
      name: nameInput.value,
      description: descriptionInput.value,
    });

    if (updatedChannel !== null) {
      this.isEditingChannel.set(false);
    }
  }

  protected beginChannelArchive(): void {
    this.store.clearArchiveError();
    this.isEditingChannel.set(false);
    this.isConfirmingChannelArchive.set(true);
  }

  protected cancelChannelArchive(): void {
    this.store.clearArchiveError();
    this.isConfirmingChannelArchive.set(false);
  }

  /**
   * Archives the selected channel after explicit owner confirmation.
   *
   * Both workspace and channel identities are checked after the command so a
   * late completion cannot clear a same-slug channel in a newer workspace.
   */
  protected async confirmChannelArchive(channel: Channel): Promise<void> {
    const archivedChannelId = await this.store.archiveSelectedChannel();
    this.isConfirmingChannelArchive.set(false);

    if (
      archivedChannelId !== channel.id ||
      this.workspaceId() !== channel.workspaceId ||
      this.queryParamMap().get('channel') !== channel.slug
    ) {
      return;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { channel: null, message: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Adds a restored channel to navigation and lets the route select it. */
  protected onChannelRestored(channel: Channel): void {
    if (!this.store.includeRestoredChannel(channel)) {
      return;
    }

    this.navigateToChannel(channel.slug);
  }

  private selectChannelFromRoute(
    channelSlug: string | null,
    channels: readonly Channel[]
  ): void {
    if (this.store.selectedChannel()?.slug !== channelSlug) {
      this.isEditingChannel.set(false);
      this.isConfirmingChannelArchive.set(false);
    }

    if (channelSlug === null) {
      this.store.clearSelection();

      if (this.queryParamMap().has('message')) {
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { message: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
      return;
    }

    const channel = channels.find(
      (candidate) => candidate.slug === channelSlug
    );

    if (channel !== undefined) {
      this.store.select(channel.id);
      return;
    }

    this.store.clearSelection();

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        channel: null,
        message: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
