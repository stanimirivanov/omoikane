import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
  signal,
} from '@angular/core';
import { ChannelMessagesStore } from '../channel-messages.store';

@Component({
  selector: 'app-channel-message-composer',
  standalone: true,
  templateUrl: './channel-message-composer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelMessageComposerComponent {
  readonly typingActivity = output<void>();
  readonly typingStopped = output<void>();
  protected readonly store = inject(ChannelMessagesStore);
  protected readonly draft = signal('');

  protected updateDraft(content: string): void {
    this.draft.set(content);
    this.typingActivity.emit();
  }

  protected async sendMessage(content: string): Promise<void> {
    this.typingStopped.emit();
    const sent = await this.store.send(content);

    if (sent) {
      this.draft.set('');
    }
  }
}
