import { Either, Schema } from 'effect';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ProfileRepositoryUnavailableError } from '@omoikane/application/profile';
import {
  type WorkspaceMemberCursor,
  type WorkspaceMemberPage,
  WorkspaceLastOwnerDemotionError,
  WorkspaceLastOwnerRemovalError,
  WorkspaceLastOwnerSuspensionError,
  WorkspaceRepositoryUnavailableError,
} from '@omoikane/application/workspace';
import { ProfileIdSchema, type Profile } from '@omoikane/domain/profile';
import {
  WorkspaceIdSchema,
  type WorkspaceMember,
} from '@omoikane/domain/workspace';
import { ProfileApplicationService } from '@client/core/profile/profile-application.service';
import { WorkspaceApplicationService } from '@client/core/workspace/workspace-application.service';
import { WorkspaceMemberDirectoryStore } from './workspace-member-directory.store';

const workspaceId = Schema.decodeUnknownSync(WorkspaceIdSchema)(
  '00000000-0000-4000-8000-000000000001'
);
const nextWorkspaceId = Schema.decodeUnknownSync(WorkspaceIdSchema)(
  '00000000-0000-4000-8000-000000000002'
);
const ownerId = Schema.decodeUnknownSync(ProfileIdSchema)(
  '00000000-0000-4000-8000-000000000003'
);
const memberId = Schema.decodeUnknownSync(ProfileIdSchema)(
  '00000000-0000-4000-8000-000000000004'
);
const owner: WorkspaceMember = {
  workspaceId,
  profileId: ownerId,
  role: 'owner',
};
const member: WorkspaceMember = {
  workspaceId,
  profileId: memberId,
  role: 'member',
};
const profiles: readonly Profile[] = [
  {
    id: memberId,
    username: 'member',
    displayName: 'Alpha Member',
    avatarUrl: null,
    status: 'active',
  },
  {
    id: ownerId,
    username: 'owner',
    displayName: 'Workspace Owner',
    avatarUrl: null,
    status: 'active',
  },
];
const page = (
  members: readonly WorkspaceMember[],
  nextCursor: WorkspaceMemberCursor | null = null
): WorkspaceMemberPage => ({ members, nextCursor });
const configureStore = (
  listWorkspaceMembers = vi
    .fn()
    .mockResolvedValue(Either.right(page([member, owner]))),
  listCurrentProfiles = vi.fn().mockResolvedValue(Either.right(profiles)),
  changeWorkspaceMemberRole = vi
    .fn()
    .mockResolvedValue(Either.right({ ...member, role: 'owner' as const })),
  removeWorkspaceMember = vi.fn().mockResolvedValue(Either.right(undefined)),
  suspendWorkspaceMember = vi.fn().mockResolvedValue(Either.right(undefined))
) => {
  TestBed.configureTestingModule({
    providers: [
      WorkspaceMemberDirectoryStore,
      {
        provide: WorkspaceApplicationService,
        useValue: {
          listWorkspaceMembers,
          changeWorkspaceMemberRole,
          removeWorkspaceMember,
          suspendWorkspaceMember,
        },
      },
      {
        provide: ProfileApplicationService,
        useValue: { listCurrentProfiles },
      },
    ],
  });

  return {
    store: TestBed.inject(WorkspaceMemberDirectoryStore),
    listWorkspaceMembers,
    listCurrentProfiles,
    changeWorkspaceMemberRole,
    removeWorkspaceMember,
    suspendWorkspaceMember,
  };
};

describe('WorkspaceMemberDirectoryStore', () => {
  it('loads once, batch-enriches profiles, and displays owners first', async () => {
    const { store, listWorkspaceMembers, listCurrentProfiles } =
      configureStore();

    const firstLoad = store.load(workspaceId);
    expect(store.load(workspaceId)).toBe(firstLoad);
    await firstLoad;

    expect(listWorkspaceMembers).toHaveBeenCalledExactlyOnceWith(
      workspaceId,
      undefined
    );
    expect(listCurrentProfiles).toHaveBeenCalledExactlyOnceWith([
      memberId,
      ownerId,
    ]);
    expect(store.entries()).toEqual([
      {
        profileId: ownerId,
        displayName: 'Workspace Owner',
        avatarUrl: null,
        role: 'owner',
      },
      {
        profileId: memberId,
        displayName: 'Alpha Member',
        avatarUrl: null,
        role: 'member',
      },
    ]);

    await store.load(workspaceId);
    expect(listWorkspaceMembers).toHaveBeenCalledOnce();
  });

  it('appends and enriches the next member page without duplicating identities', async () => {
    const cursor: WorkspaceMemberCursor = {
      role: 'owner',
      profileId: ownerId,
    };
    const listWorkspaceMembers = vi
      .fn()
      .mockResolvedValueOnce(Either.right(page([owner], cursor)))
      .mockResolvedValueOnce(Either.right(page([owner, member])));
    const listCurrentProfiles = vi
      .fn()
      .mockResolvedValueOnce(Either.right([profiles[1]]))
      .mockResolvedValueOnce(Either.right(profiles));
    const { store } = configureStore(listWorkspaceMembers, listCurrentProfiles);
    await store.load(workspaceId);

    const loading = store.loadMore();
    expect(store.view().content).toMatchObject({
      kind: 'members',
      pagination: { isLoading: true },
    });
    await loading;

    expect(listWorkspaceMembers).toHaveBeenNthCalledWith(
      2,
      workspaceId,
      cursor
    );
    expect(store.members()).toEqual([owner, member]);
    expect(store.profiles()).toEqual([profiles[1], profiles[0]]);
    expect(store.view().content).toMatchObject({
      kind: 'members',
      pagination: { hasMore: false },
    });
    expect(store.paginationError()).toBeNull();
  });

  it('loads owner-only pages until the current user role is known', async () => {
    const cursor: WorkspaceMemberCursor = {
      role: 'owner',
      profileId: ownerId,
    };
    const listWorkspaceMembers = vi
      .fn()
      .mockResolvedValueOnce(Either.right(page([owner], cursor)))
      .mockResolvedValueOnce(Either.right(page([member])));
    const { store } = configureStore(listWorkspaceMembers);

    await store.load(workspaceId, memberId);

    expect(listWorkspaceMembers).toHaveBeenCalledTimes(2);
    expect(listWorkspaceMembers).toHaveBeenNthCalledWith(
      2,
      workspaceId,
      cursor
    );
    expect(store.members()).toEqual([owner, member]);
  });

  it('retains loaded pages and permits retry after pagination fails', async () => {
    const cursor: WorkspaceMemberCursor = {
      role: 'member',
      profileId: memberId,
    };
    const failure = new WorkspaceRepositoryUnavailableError({
      cause: new Error('Provider unavailable'),
    });
    const listWorkspaceMembers = vi
      .fn()
      .mockResolvedValueOnce(Either.right(page([member], cursor)))
      .mockResolvedValueOnce(Either.left(failure))
      .mockResolvedValueOnce(Either.right(page([owner])));
    const { store } = configureStore(listWorkspaceMembers);
    await store.load(workspaceId);

    await store.loadMore();
    expect(store.members()).toEqual([member]);
    expect(store.paginationStatus()).toBe('failed');
    expect(store.paginationError()).toEqual({
      message: 'More workspace members could not be loaded. Please try again.',
    });

    await store.loadMore();
    expect(store.members()).toEqual([member, owner]);
    expect(store.paginationStatus()).toBe('idle');
  });

  it('replaces loaded pages during an authoritative refresh', async () => {
    const listWorkspaceMembers = vi
      .fn()
      .mockResolvedValueOnce(Either.right(page([member])))
      .mockResolvedValueOnce(Either.right(page([owner])));
    const { store } = configureStore(listWorkspaceMembers);
    await store.load(workspaceId);

    await store.load(workspaceId, memberId, { force: true });

    expect(listWorkspaceMembers).toHaveBeenCalledTimes(2);
    expect(store.members()).toEqual([owner]);
  });

  it('exposes a safe membership error and permits retry', async () => {
    const failure = new WorkspaceRepositoryUnavailableError({
      cause: new Error('Provider unavailable'),
    });
    const listWorkspaceMembers = vi
      .fn()
      .mockResolvedValueOnce(Either.left(failure))
      .mockResolvedValueOnce(Either.right(page([owner])));
    const { store, listCurrentProfiles } = configureStore(listWorkspaceMembers);

    await store.load(workspaceId);

    expect(store.loadStatus()).toBe('failed');
    expect(store.error()).toEqual({
      message: 'Workspace members are currently unavailable. Please try again.',
    });
    expect(listCurrentProfiles).not.toHaveBeenCalled();

    await store.load(workspaceId);
    expect(store.loadStatus()).toBe('loaded');
  });

  it('retains roles with fallback names when profile enrichment fails', async () => {
    const profileFailure = new ProfileRepositoryUnavailableError({
      cause: new Error('Profiles unavailable'),
    });
    const listCurrentProfiles = vi
      .fn()
      .mockResolvedValue(Either.left(profileFailure));
    const { store } = configureStore(undefined, listCurrentProfiles);

    await store.load(workspaceId);

    expect(store.loadStatus()).toBe('loaded');
    expect(store.error()).toBeNull();
    expect(store.entries()).toEqual([
      {
        profileId: ownerId,
        displayName: 'Another member',
        avatarUrl: null,
        role: 'owner',
      },
      {
        profileId: memberId,
        displayName: 'Another member',
        avatarUrl: null,
        role: 'member',
      },
    ]);
  });

  it('ignores a stale membership result after the workspace changes', async () => {
    let resolveFirst:
      | ((result: Either.Either<WorkspaceMemberPage, never>) => void)
      | undefined;
    const firstResult = new Promise<Either.Either<WorkspaceMemberPage, never>>(
      (resolve) => {
        resolveFirst = resolve;
      }
    );
    const nextMember: WorkspaceMember = {
      workspaceId: nextWorkspaceId,
      profileId: memberId,
      role: 'member',
    };
    const listWorkspaceMembers = vi
      .fn()
      .mockReturnValueOnce(firstResult)
      .mockResolvedValueOnce(Either.right(page([nextMember])));
    const { store } = configureStore(listWorkspaceMembers);

    const oldLoad = store.load(workspaceId);
    await store.load(nextWorkspaceId);
    resolveFirst?.(Either.right(page([owner])));
    await oldLoad;

    expect(store.workspaceId()).toBe(nextWorkspaceId);
    expect(store.members()).toEqual([nextMember]);
  });

  it('replaces the changed member with the canonical role projection', async () => {
    const changedMember: WorkspaceMember = { ...member, role: 'owner' };
    const changeWorkspaceMemberRole = vi
      .fn()
      .mockResolvedValue(Either.right(changedMember));
    const { store } = configureStore(
      undefined,
      undefined,
      changeWorkspaceMemberRole
    );
    await store.load(workspaceId);

    const change = store.changeMemberRole(memberId, 'owner');

    expect(store.view().content).toMatchObject({
      kind: 'members',
      mutation: { kind: 'role-change', profileId: memberId },
    });
    expect(store.mutatingProfileId()).toBe(memberId);
    await expect(change).resolves.toBe(true);
    expect(changeWorkspaceMemberRole).toHaveBeenCalledExactlyOnceWith({
      workspaceId,
      profileId: memberId,
      role: 'owner',
    });
    expect(store.members()).toEqual([changedMember, owner]);
    expect(store.mutationStatus()).toBe('idle');
    expect(store.mutationError()).toBeNull();
  });

  it('presents the protected last-owner rule and permits dismissal', async () => {
    const failure = new WorkspaceLastOwnerDemotionError({
      workspaceId,
      profileId: ownerId,
    });
    const changeWorkspaceMemberRole = vi
      .fn()
      .mockResolvedValue(Either.left(failure));
    const { store } = configureStore(
      vi.fn().mockResolvedValue(Either.right(page([owner]))),
      undefined,
      changeWorkspaceMemberRole
    );
    await store.load(workspaceId);

    await expect(store.changeMemberRole(ownerId, 'member')).resolves.toBe(
      false
    );

    expect(store.mutationStatus()).toBe('failed');
    expect(store.mutationError()).toEqual({
      message:
        'Assign another owner before changing the last owner to a member.',
    });

    store.clearMemberMutationError();
    expect(store.mutationStatus()).toBe('idle');
    expect(store.mutationError()).toBeNull();
  });

  it('ignores a role-change result after the selected workspace changes', async () => {
    let resolveChange:
      | ((result: Either.Either<WorkspaceMember, never>) => void)
      | undefined;
    const changeResult = new Promise<Either.Either<WorkspaceMember, never>>(
      (resolve) => {
        resolveChange = resolve;
      }
    );
    const nextMember: WorkspaceMember = {
      workspaceId: nextWorkspaceId,
      profileId: memberId,
      role: 'member',
    };
    const listWorkspaceMembers = vi
      .fn()
      .mockResolvedValueOnce(Either.right(page([member])))
      .mockResolvedValueOnce(Either.right(page([nextMember])));
    const { store } = configureStore(
      listWorkspaceMembers,
      undefined,
      vi.fn().mockReturnValue(changeResult)
    );
    await store.load(workspaceId);

    const oldChange = store.changeMemberRole(memberId, 'owner');
    await store.load(nextWorkspaceId);
    resolveChange?.(Either.right({ ...member, role: 'owner' }));
    await oldChange;

    expect(store.workspaceId()).toBe(nextWorkspaceId);
    expect(store.members()).toEqual([nextMember]);
    expect(store.mutationStatus()).toBe('idle');
  });

  it('removes membership and profile projections after command success', async () => {
    const removeWorkspaceMember = vi
      .fn()
      .mockResolvedValue(Either.right(undefined));
    const { store } = configureStore(
      undefined,
      undefined,
      undefined,
      removeWorkspaceMember
    );
    await store.load(workspaceId);

    const removal = store.removeMember(memberId, 'No longer participating');

    expect(store.view().content).toMatchObject({
      kind: 'members',
      mutation: { kind: 'removal', profileId: memberId },
    });
    expect(store.mutatingProfileId()).toBe(memberId);
    await expect(removal).resolves.toBe(true);
    expect(removeWorkspaceMember).toHaveBeenCalledExactlyOnceWith({
      workspaceId,
      profileId: memberId,
      reason: 'No longer participating',
    });
    expect(store.members()).toEqual([owner]);
    expect(store.profiles()).toEqual([profiles[1]]);
    expect(store.mutationStatus()).toBe('idle');
  });

  it('presents the protected last-owner removal rule', async () => {
    const failure = new WorkspaceLastOwnerRemovalError({
      workspaceId,
      profileId: ownerId,
    });
    const removeWorkspaceMember = vi
      .fn()
      .mockResolvedValue(Either.left(failure));
    const { store } = configureStore(
      vi.fn().mockResolvedValue(Either.right(page([owner]))),
      undefined,
      undefined,
      removeWorkspaceMember
    );
    await store.load(workspaceId);

    await expect(store.removeMember(ownerId)).resolves.toBe(false);

    expect(store.mutationStatus()).toBe('failed');
    expect(store.mutationError()).toEqual({
      message: 'The last active workspace owner cannot be removed.',
    });
  });

  it('removes active projections after suspension succeeds', async () => {
    const suspendWorkspaceMember = vi
      .fn()
      .mockResolvedValue(Either.right(undefined));
    const { store } = configureStore(
      undefined,
      undefined,
      undefined,
      undefined,
      suspendWorkspaceMember
    );
    await store.load(workspaceId);

    const suspension = store.suspendMember(memberId, 'Temporary access hold');

    expect(store.view().content).toMatchObject({
      kind: 'members',
      mutation: { kind: 'suspension', profileId: memberId },
    });
    expect(store.mutatingProfileId()).toBe(memberId);
    await expect(suspension).resolves.toBe(true);
    expect(suspendWorkspaceMember).toHaveBeenCalledExactlyOnceWith({
      workspaceId,
      profileId: memberId,
      reason: 'Temporary access hold',
    });
    expect(store.members()).toEqual([owner]);
    expect(store.profiles()).toEqual([profiles[1]]);
    expect(store.mutationStatus()).toBe('idle');
  });

  it('presents the protected last-owner suspension rule', async () => {
    const failure = new WorkspaceLastOwnerSuspensionError({
      workspaceId,
      profileId: ownerId,
    });
    const suspendWorkspaceMember = vi
      .fn()
      .mockResolvedValue(Either.left(failure));
    const { store } = configureStore(
      vi.fn().mockResolvedValue(Either.right(page([owner]))),
      undefined,
      undefined,
      undefined,
      suspendWorkspaceMember
    );
    await store.load(workspaceId);

    await expect(store.suspendMember(ownerId)).resolves.toBe(false);

    expect(store.mutationStatus()).toBe('failed');
    expect(store.mutationError()).toEqual({
      message: 'The last active workspace owner cannot be suspended.',
    });
  });

  it('ignores a removal result after the selected workspace changes', async () => {
    let resolveRemoval:
      | ((result: Either.Either<void, never>) => void)
      | undefined;
    const removalResult = new Promise<Either.Either<void, never>>((resolve) => {
      resolveRemoval = resolve;
    });
    const nextMember: WorkspaceMember = {
      workspaceId: nextWorkspaceId,
      profileId: memberId,
      role: 'member',
    };
    const listWorkspaceMembers = vi
      .fn()
      .mockResolvedValueOnce(Either.right(page([member])))
      .mockResolvedValueOnce(Either.right(page([nextMember])));
    const { store } = configureStore(
      listWorkspaceMembers,
      undefined,
      undefined,
      vi.fn().mockReturnValue(removalResult)
    );
    await store.load(workspaceId);

    const oldRemoval = store.removeMember(memberId);
    await store.load(nextWorkspaceId);
    resolveRemoval?.(Either.right(undefined));
    await oldRemoval;

    expect(store.workspaceId()).toBe(nextWorkspaceId);
    expect(store.members()).toEqual([nextMember]);
    expect(store.mutationStatus()).toBe('idle');
  });
});
