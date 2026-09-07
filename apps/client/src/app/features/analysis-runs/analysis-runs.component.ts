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
}
