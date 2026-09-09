import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { ProfileIdSchema } from '@omoikane/domain/profile';
import {
  WorkspaceIdSchema,
  WorkspaceInvitationIdSchema,
  type Workspace,
} from '@omoikane/domain/workspace';
import { WorkspaceInvitationsComponent } from './workspace-invitations.component';
import { WorkspaceInvitationsStore } from './workspace-invitations.store';

const workspace: Workspace = {
  id: Schema.decodeUnknownSync(WorkspaceIdSchema)(
    '00000000-0000-4000-8000-000000000001'
  ),
  name: 'Omoikane Development',
  slug: 'omoikane-development',
  description: null,
};

const invitationId = Schema.decodeUnknownSync(WorkspaceInvitationIdSchema)(
  '00000000-0000-4000-8000-000000000002'
);

const renderComponent = async () => {
  const recipientInvitation = {
    invitation: {
      id: invitationId,
      workspaceId: workspace.id,
      invitedProfileId: Schema.decodeUnknownSync(ProfileIdSchema)(
        '00000000-0000-4000-8000-000000000003'
      ),
      status: 'pending' as const,
    },
    workspace,
  };
  const managedInvitation = {
    invitation: recipientInvitation.invitation,
    username: 'candidate',
  };
  const store = {
    view: signal({
      isBusy: false,
      recipient: {
        kind: 'invitations',
        invitations: [recipientInvitation],
        response: { kind: 'idle' },
        responseError: null,
      } as const,
      owner: {
        kind: 'ready',
        invitations: [managedInvitation],
        isMutating: false,
        isCreating: false,
        cancellationError: null,
      } as const,
      creationFeedback: { kind: 'none' } as const,
    }),
    load: vi.fn().mockResolvedValue(undefined),
    loadManagedInvitations: vi.fn().mockResolvedValue(undefined),
    invite: vi.fn().mockResolvedValue(true),
    accept: vi.fn().mockResolvedValue(workspace),
    decline: vi.fn().mockResolvedValue(true),
    cancel: vi.fn().mockResolvedValue(true),
    clearCreationFeedback: vi.fn(),
    clearResponseError: vi.fn(),
    clearCancellationError: vi.fn(),
  };

  TestBed.overrideComponent(WorkspaceInvitationsComponent, {
    set: {
      providers: [{ provide: WorkspaceInvitationsStore, useValue: store }],
    },
  });
  await TestBed.configureTestingModule({
    imports: [WorkspaceInvitationsComponent],
  }).compileComponents();

  const fixture = TestBed.createComponent(WorkspaceInvitationsComponent);
  fixture.componentRef.setInput('workspaceId', workspace.id);
  fixture.componentRef.setInput('canInvite', true);
  fixture.detectChanges();
  await fixture.whenStable();

  return { fixture, store };
};

describe('WorkspaceInvitationsComponent', () => {
  it('loads invitations and lets a selected owner invite by exact username', async () => {
    const { fixture, store } = await renderComponent();
    const input = fixture.nativeElement.querySelector(
      'input[name="username"]'
    ) as HTMLInputElement;
    input.value = 'candidate';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    input
      .closest('form')
      ?.dispatchEvent(
        new SubmitEvent('submit', { bubbles: true, cancelable: true })
      );
    await fixture.whenStable();

    expect(store.load).toHaveBeenCalledOnce();
    expect(store.loadManagedInvitations).toHaveBeenCalledWith(workspace.id);
    expect(store.invite).toHaveBeenCalledWith(workspace.id, 'candidate');
    expect(input.value).toBe('');
  });

  it('emits the joined workspace after acceptance', async () => {
    const { fixture, store } = await renderComponent();
    const accepted: Workspace[] = [];
    fixture.componentInstance.invitationAccepted.subscribe((value) =>
      accepted.push(value)
    );

    const button = fixture.nativeElement.querySelector(
      'button[aria-label="Accept invitation to Omoikane Development"]'
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();

    expect(store.accept).toHaveBeenCalledWith(invitationId);
    expect(accepted).toEqual([workspace]);
  });

  it('requires confirmation before cancelling an owner-managed invitation', async () => {
    const { fixture, store } = await renderComponent();
    const requestButton = fixture.nativeElement.querySelector(
      'button[aria-label="Cancel invitation for candidate"]'
    ) as HTMLButtonElement;

    requestButton.click();
    fixture.detectChanges();

    const confirmButton = fixture.nativeElement.querySelector(
      'button[aria-label="Confirm cancellation for candidate"]'
    ) as HTMLButtonElement;
    confirmButton.click();
    await fixture.whenStable();

    expect(store.cancel).toHaveBeenCalledWith(invitationId);
  });
});
