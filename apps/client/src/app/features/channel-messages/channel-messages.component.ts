import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import type { MarkChannelReadInput } from '@omoikane/application/message';
import { MatButtonModule } from '@angular/material/button';
import { LucideRefreshCw } from '@lucide/angular';
import type { ChannelId } from '@omoikane/domain/channel';
import type { MessageId } from '@omoikane/domain/message';
import { ChannelMessageComposerComponent } from './composer/channel-message-composer.component';
import { ChannelMessageHistoryComponent } from './history/channel-message-history.component';
import { ChannelMessagesStore } from './channel-messages.store';
import { ChannelTypingStore } from '@client/features/channel-typing/channel-typing.store';

/** Coordinates one selected channel's message store and child views. */
@Component({
  selector: 'app-channel-messages',
  standalone: true,
  imports: [
    ChannelMessageHistoryComponent,
    ChannelMessageComposerComponent,
    MatButtonModule,
    LucideRefreshCw,
  ],
  templateUrl: './channel-messages.component.html',
  styleUrl: './channel-messages.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ChannelMessagesStore, ChannelTypingStore],
})
export class ChannelMessagesComponent {
  readonly channelId = input.required<ChannelId>();
  readonly focusedMessageId = input<MessageId | null>(null);
  readonly canModerateMessages = input(false);
  readonly readThrough = output<MarkChannelReadInput>();

  private readonly store = inject(ChannelMessagesStore);
  protected readonly typingStore = inject(ChannelTypingStore);
  private lastReadThrough: MarkChannelReadInput | null = null;

  constructor() {
    effect(() => {
      void this.store.selectChannel(this.channelId());
      this.typingStore.connect(this.channelId());
    });

    effect(() => {
      void this.store.selectFocusedMessage(
        this.channelId(),
        this.focusedMessageId()
      );
    });

    effect(() => {
      const channelId = this.channelId();
      const newestMessage = this.store.messages()[0];

      if (
        this.store.channelId() !== channelId ||
        this.store.loadStatus() !== 'loaded' ||
        newestMessage === undefined
      ) {
        return;
      }

      if (
        this.lastReadThrough?.channelId === channelId &&
        this.lastReadThrough.messageId === newestMessage.id
      ) {
        return;
      }

      this.lastReadThrough = {
        channelId,
        messageId: newestMessage.id,
      };
      this.readThrough.emit(this.lastReadThrough);
    });
  }
}
