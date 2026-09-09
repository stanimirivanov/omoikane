import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import {
  ArchivedWorkspaceSchema,
  type Workspace,
} from '@omoikane/domain/workspace';
import { ArchivedWorkspaceListComponent } from './archived-workspace-list.component';
import { ArchivedWorkspaceListStore } from './archived-workspace-list.store';

describe('ArchivedWorkspaceListComponent', () => {
  it('confirms restoration and emits the restored workspace', async () => {
    const workspace = Schema.decodeUnknownSync(ArchivedWorkspaceSchema)({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Archived Omoikane',
      slug: 'archived-omoikane',
      description: 'Preserved history',
      archivedAt: '2026-08-08T09:00:00.000Z',
    });
    const store = {
      workspaces: signal([workspace]),
      view: signal({
        content: { kind: 'workspaces', workspaces: [workspace] } as const,
        isRestoring: false,
        restorationError: null,
      }),
      load: vi.fn().mockResolvedValue(undefined),
      clearRestorationError: vi.fn(),
      restore: vi.fn().mockResolvedValue({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        description: workspace.description,
      } satisfies Workspace),
    };

    TestBed.overrideComponent(ArchivedWorkspaceListComponent, {
      set: {
        providers: [{ provide: ArchivedWorkspaceListStore, useValue: store }],
      },
    });
    await TestBed.configureTestingModule({
      imports: [ArchivedWorkspaceListComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(ArchivedWorkspaceListComponent);
    const restored = vi.fn();
    fixture.componentInstance.workspaceRestored.subscribe(restored);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Archived Omoikane');
    expect(fixture.nativeElement.querySelector('time').dateTime).toBe(
      '2026-08-08T09:00:00.000Z'
    );
    const restoreButton: HTMLButtonElement =
      fixture.nativeElement.querySelector('li button');
    restoreButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Only an active workspace owner'
    );

    const confirmButton = Array.from(
      fixture.nativeElement.querySelectorAll(
        'li button'
      ) as NodeListOf<HTMLButtonElement>
    ).find((button) => button.textContent?.trim() === 'Confirm restoration');
    confirmButton?.click();
    await fixture.whenStable();

    expect(store.restore).toHaveBeenCalledExactlyOnceWith(workspace.id);
    expect(restored).toHaveBeenCalledOnce();
    expect(store.load).toHaveBeenCalledOnce();
  });
});
