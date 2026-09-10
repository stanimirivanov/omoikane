import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { LucideRefreshCw } from '@lucide/angular';
import type { WorkspaceId } from '@omoikane/domain/workspace';
import { WorkspacePresenceStore } from './workspace-presence.store';

/** Displays the advisory online-member count for one selected workspace. */
@Component({
  selector: 'app-workspace-presence',
  standalone: true,
  imports: [MatButtonModule, LucideRefreshCw],
  providers: [WorkspacePresenceStore],
  templateUrl: './workspace-presence.component.html',
  styleUrl: './workspace-presence.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspacePresenceComponent {
  readonly workspaceId = input.required<WorkspaceId>();
  protected readonly store = inject(WorkspacePresenceStore);

  constructor() {
    effect(() => {
      this.store.observe(this.workspaceId());
    });
  }
}
