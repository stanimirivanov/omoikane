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
import type { Workspace, WorkspaceId } from '@omoikane/domain/workspace';
import { ArchivedWorkspaceListStore } from './archived-workspace-list.store';

/** Presents archived-workspace history and explicit restoration consent. */
@Component({
  selector: 'app-archived-workspace-list',
  standalone: true,
  imports: [DatePipe, MatButtonModule, LucideArchiveRestore],
  providers: [ArchivedWorkspaceListStore],
  templateUrl: './archived-workspace-list.component.html',
  styleUrl: './archived-workspace-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArchivedWorkspaceListComponent {
  /** Incremented when authoritative active workspace identities change. */
  readonly refreshVersion = input(0);
  readonly workspaceRestored = output<Workspace>();
  protected readonly store = inject(ArchivedWorkspaceListStore);
  protected readonly pendingRestorationWorkspaceId = signal<WorkspaceId | null>(
    null
  );

  constructor() {
    effect(() => {
      const refreshVersion = this.refreshVersion();
      void this.store.load(refreshVersion > 0);
    });
  }

  protected requestRestoration(workspaceId: WorkspaceId): void {
    this.store.clearRestorationError();
    this.pendingRestorationWorkspaceId.set(workspaceId);
  }

  protected cancelRestoration(): void {
    this.pendingRestorationWorkspaceId.set(null);
  }

  protected async confirmRestoration(workspaceId: WorkspaceId): Promise<void> {
    this.pendingRestorationWorkspaceId.set(null);
    const workspace = await this.store.restore(workspaceId);

    if (workspace !== null) {
      this.workspaceRestored.emit(workspace);
    }
  }
}
