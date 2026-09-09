import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideHash, LucideMenu, LucidePlus, LucideX } from '@lucide/angular';
import { Schema } from 'effect';
import type { Channel } from '@omoikane/domain/channel';
import { MessageIdSchema } from '@omoikane/domain/message';
import type { WorkspaceId } from '@omoikane/domain/workspace';
import { map } from 'rxjs';
import { AnalysisRunsComponent } from '@client/features/analysis-runs/analysis-runs.component';
import { ArchivedChannelListComponent } from '@client/features/archived-channel-list/archived-channel-list.component';
import { ChannelMessagesComponent } from '@client/features/channel-messages/channel-messages.component';
import { ChannelNavigationStore } from './channel-navigation.store';

type ChannelInteraction =
  | 'idle'
  | 'creating'
  | 'editing'
  | 'confirming-archive';

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
    MatButtonModule,
    MatSidenavModule,
    MatTooltipModule,
    LucideHash,
    LucideMenu,
    LucidePlus,
    LucideX,
  ],
  providers: [ChannelNavigationStore],
  templateUrl: './channel-navigation.component.html',
  styleUrl: './channel-navigation.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelNavigationComponent {
  readonly workspaceId = input.required<WorkspaceId>();
  readonly canManageChannels = input(false);
  readonly canModerateMessages = input(false);
  protected readonly store = inject(ChannelNavigationStore);
  protected readonly interaction = signal<ChannelInteraction>('idle');
  protected readonly channelNavigationOpen = signal(false);
  private readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly compactChannelNavigation = toSignal(
    this.breakpointObserver
      .observe('(max-width: 47.999rem)')
      .pipe(map(({ matches }) => matches)),
    { initialValue: false }
  );
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
      this.interaction.set('idle');
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
        this.interaction.set('idle');
      }
    });
  }

  /**
   * Writes channel selection to browser history.
   */
  protected navigateToChannel(channelSlug: string): void {
    this.channelNavigationOpen.set(false);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        channel: channelSlug,
        message: null,
      },
      queryParamsHandling: 'merge',
    });
  }

  protected toggleChannelNavigation(): void {
    this.channelNavigationOpen.update((open) => !open);
  }

  protected closeChannelNavigation(): void {
    this.channelNavigationOpen.set(false);
  }

  protected beginChannelCreation(): void {
    this.store.clearCreationError();
    this.store.clearUpdateError();
    this.store.clearArchiveError();
    this.interaction.set('creating');
  }

  protected cancelChannelCreation(): void {
    this.store.clearCreationError();
    this.interaction.set('idle');
  }

  protected async saveChannel(
    name: string,
    slug: string,
    description: string
  ): Promise<void> {
    const channel = await this.store.createChannel({
      name,
      slug,
      description,
    });

    if (channel !== null) {
      this.interaction.set('idle');
      this.navigateToChannel(channel.slug);
    }
  }

  protected beginChannelEditing(): void {
    this.store.clearCreationError();
    this.store.clearUpdateError();
    this.store.clearArchiveError();
    this.interaction.set('editing');
  }

  protected cancelChannelEditing(): void {
    this.store.clearUpdateError();
    this.interaction.set('idle');
  }

  protected async saveChannelChanges(
    name: string,
    description: string
  ): Promise<void> {
    const updatedChannel = await this.store.updateSelectedChannel({
      name,
      description,
    });

    if (updatedChannel !== null) {
      this.interaction.set('idle');
    }
  }

  protected beginChannelArchive(): void {
    this.store.clearArchiveError();
    this.interaction.set('confirming-archive');
  }

  protected cancelChannelArchive(): void {
    this.store.clearArchiveError();
    this.interaction.set('idle');
  }

  /**
   * Archives the selected channel after explicit owner confirmation.
   *
   * Both workspace and channel identities are checked after the command so a
   * late completion cannot clear a same-slug channel in a newer workspace.
   */
  protected async confirmChannelArchive(channel: Channel): Promise<void> {
    const archivedChannelId = await this.store.archiveSelectedChannel();
    this.interaction.set('idle');

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
      this.interaction.set('idle');
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
