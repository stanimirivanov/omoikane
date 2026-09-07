import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
} from '@angular/core';
import type { WorkspaceId } from '@omoikane/domain/workspace';
import type { ChannelId } from '@omoikane/domain/channel';
import { AnalysisRunsStore } from './analysis-runs.store';

/** Minimal UI proving the authenticated server-backed Analysis Run path. */
@Component({
  selector: 'app-analysis-runs',
  standalone: true,
  providers: [AnalysisRunsStore],
  templateUrl: './analysis-runs.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisRunsComponent {
  readonly workspaceId = input.required<WorkspaceId>();
  readonly channelId = input.required<ChannelId>();
  protected readonly store = inject(AnalysisRunsStore);

  constructor() {
    effect(() => this.store.selectScope(this.workspaceId(), this.channelId()));
  }

  protected toLocalDateTime(date: Date): string {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }

  protected toUtcDateTime(date: Date): string {
    return date.toISOString();
  }

  protected setTimeRangeStart(event: Event): void {
    const input = this.readDateTimeInput(event);
    if (
      input !== null &&
      !this.store.setTimeRangeStart(new Date(input.value))
    ) {
      input.value = this.toLocalDateTime(this.store.timeRangeStart());
    }
  }

  protected setTimeRangeEnd(event: Event): void {
    const input = this.readDateTimeInput(event);
    if (input !== null && !this.store.setTimeRangeEnd(new Date(input.value))) {
      input.value = this.toLocalDateTime(this.store.timeRangeEnd());
    }
  }

  private readDateTimeInput(event: Event): HTMLInputElement | null {
    return event.target instanceof HTMLInputElement ? event.target : null;
  }
}
