import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { LucideSparkles } from '@lucide/angular';
import type { WorkspaceId } from '@omoikane/domain/workspace';
import type { ChannelId } from '@omoikane/domain/channel';
import { AnalysisEvidenceLinksComponent } from './analysis-evidence-links.component';
import { AnalysisRunsStore } from './analysis-runs.store';

/** Presents one channel-scoped analysis workflow and its reviewable evidence. */
@Component({
  selector: 'app-analysis-runs',
  standalone: true,
  imports: [
    AnalysisEvidenceLinksComponent,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    LucideSparkles,
  ],
  providers: [AnalysisRunsStore],
  templateUrl: './analysis-runs.component.html',
  styleUrl: './analysis-runs.component.css',
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

  protected toDisplayDateTime(date: Date): string {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }

  protected toConfidencePercentage(confidence: number): number {
    return Math.round(confidence * 100);
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
