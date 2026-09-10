import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { LucideSearch } from '@lucide/angular';
import type { WorkspaceMessageSearchResult } from '@omoikane/application/message';
import type { WorkspaceId } from '@omoikane/domain/workspace';
import { WorkspaceMessageSearchStore } from './workspace-message-search.store';

/** Search form and ranked results for the selected workspace. */
@Component({
  selector: 'app-workspace-message-search',
  standalone: true,
  imports: [DatePipe, MatButtonModule, LucideSearch],
  providers: [WorkspaceMessageSearchStore],
  templateUrl: './workspace-message-search.component.html',
  styleUrl: './workspace-message-search.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceMessageSearchComponent {
  readonly workspaceId = input.required<WorkspaceId>();
  readonly resultSelected = output<WorkspaceMessageSearchResult>();
  protected readonly store = inject(WorkspaceMessageSearchStore);

  constructor() {
    effect(() => {
      this.store.selectWorkspace(this.workspaceId());
    });
  }

  protected submit(query: string): void {
    void this.store.search(query);
  }
}
