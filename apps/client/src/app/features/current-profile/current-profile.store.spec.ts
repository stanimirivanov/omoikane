import { Either, Schema } from 'effect';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  InvalidProfileUpdateInputError,
  ProfileRepositoryUnavailableError,
  ProfileUsernameUnavailableError,
} from '@omoikane/application/profile';
import { ProfileIdSchema, type Profile } from '@omoikane/domain/profile';
import { ProfileApplicationService } from '@client/core/profile/profile-application.service';
import { CurrentProfileStore } from './current-profile.store';

const userId = Schema.decodeUnknownSync(ProfileIdSchema)(
  '00000000-0000-4000-8000-000000000001'
);
const nextUserId = Schema.decodeUnknownSync(ProfileIdSchema)(
  '00000000-0000-4000-8000-000000000002'
);

const profile: Profile = {
  id: userId,
  username: 'owner',
  displayName: 'Workspace Owner',
  avatarUrl: null,
  status: 'active',
};

const configureStore = (
  getCurrentProfile = vi.fn().mockResolvedValue(Either.right(profile)),
  updateCurrentProfile = vi.fn().mockResolvedValue(Either.right(profile))
) => {
  TestBed.configureTestingModule({
    providers: [
      CurrentProfileStore,
      {
        provide: ProfileApplicationService,
        useValue: { getCurrentProfile, updateCurrentProfile },
      },
    ],
  });

  return {
    store: TestBed.inject(CurrentProfileStore),
    getCurrentProfile,
    updateCurrentProfile,
  };
};

describe('CurrentProfileStore', () => {
  it('loads each session profile once and shares an active request', async () => {
    const { store, getCurrentProfile } = configureStore();

    const firstLoad = store.load(userId);
    expect(store.load(userId)).toBe(firstLoad);
    await firstLoad;

    expect(store.profile()).toEqual(profile);
    expect(store.loadStatus()).toBe('loaded');
    expect(store.view()).toEqual({
      kind: 'profile',
      profile,
      isUpdating: false,
      updateError: null,
    });

    await store.load(userId);
    expect(getCurrentProfile).toHaveBeenCalledOnce();
  });

  it('exposes a safe error and permits retry', async () => {
    const failure = new ProfileRepositoryUnavailableError({
      cause: new Error('Provider unavailable'),
    });
    const getCurrentProfile = vi
      .fn()
      .mockResolvedValueOnce(Either.left(failure))
      .mockResolvedValueOnce(Either.right(profile));
    const { store } = configureStore(getCurrentProfile);

    await store.load(userId);

    expect(store.loadStatus()).toBe('failed');
    expect(store.error()).toEqual({
      message: 'Profile details are currently unavailable. Please try again.',
    });

    await store.load(userId);

    expect(store.loadStatus()).toBe('loaded');
    expect(store.profile()).toEqual(profile);
  });

  it('ignores a stale result after the session identity changes', async () => {
    let resolveFirst:
      | ((result: Either.Either<Profile, never>) => void)
      | undefined;
    const firstResult = new Promise<Either.Either<Profile, never>>(
      (resolve) => {
        resolveFirst = resolve;
      }
    );
    const nextProfile: Profile = {
      ...profile,
      id: nextUserId,
      username: 'member',
      displayName: 'Workspace Member',
    };
    const getCurrentProfile = vi
      .fn()
      .mockReturnValueOnce(firstResult)
      .mockResolvedValueOnce(Either.right(nextProfile));
    const { store } = configureStore(getCurrentProfile);

    const oldLoad = store.load(userId);
    await store.load(nextUserId);
    resolveFirst?.(Either.right(profile));
    await oldLoad;

    expect(store.userId()).toBe(nextUserId);
    expect(store.profile()).toEqual(nextProfile);
  });

  it('replaces the loaded profile with the canonical update result', async () => {
    const updatedProfile: Profile = {
      ...profile,
      username: 'updated-owner',
      displayName: 'Updated Owner',
    };
    const updateCurrentProfile = vi
      .fn()
      .mockResolvedValue(Either.right(updatedProfile));
    const { store } = configureStore(
      vi.fn().mockResolvedValue(Either.right(profile)),
      updateCurrentProfile
    );
    await store.load(userId);

    const updated = await store.update({
      displayName: ' Updated Owner ',
      username: ' updated-owner ',
      avatarUrl: '',
    });

    expect(updated).toBe(true);
    expect(updateCurrentProfile).toHaveBeenCalledExactlyOnceWith({
      displayName: ' Updated Owner ',
      username: ' updated-owner ',
      avatarUrl: '',
    });
    expect(store.profile()).toEqual(updatedProfile);
    expect(store.updateStatus()).toBe('idle');
  });

  it('exposes a specific username conflict without losing the profile', async () => {
    const failure = new ProfileUsernameUnavailableError({
      username: 'owner',
    });
    const updateCurrentProfile = vi
      .fn()
      .mockResolvedValue(Either.left(failure));
    const { store } = configureStore(
      vi.fn().mockResolvedValue(Either.right(profile)),
      updateCurrentProfile
    );
    await store.load(userId);

    const updated = await store.update({
      displayName: 'Workspace Owner',
      username: 'owner',
      avatarUrl: '',
    });

    expect(updated).toBe(false);
    expect(store.profile()).toEqual(profile);
    expect(store.updateError()).toEqual({
      message: 'That username is already in use.',
    });

    store.clearUpdateError();
    expect(store.updateStatus()).toBe('idle');
    expect(store.updateError()).toBeNull();
  });

  it('presents actionable avatar URL validation feedback', async () => {
    const failure = new InvalidProfileUpdateInputError({
      field: 'avatarUrl',
      cause: new Error('Invalid URL'),
    });
    const { store } = configureStore(
      vi.fn().mockResolvedValue(Either.right(profile)),
      vi.fn().mockResolvedValue(Either.left(failure))
    );
    await store.load(userId);

    await store.update({
      displayName: profile.displayName,
      avatarUrl: 'http://example.com/avatar.png',
    });

    expect(store.updateError()).toEqual({
      message: 'Use an HTTPS avatar URL, or leave it blank.',
    });
  });

  it('ignores an update result after the session identity changes', async () => {
    const nextProfile: Profile = {
      ...profile,
      id: nextUserId,
      username: 'member',
      displayName: 'Workspace Member',
    };
    let resolveUpdate:
      | ((result: Either.Either<Profile, never>) => void)
      | undefined;
    const updateResult = new Promise<Either.Either<Profile, never>>(
      (resolve) => {
        resolveUpdate = resolve;
      }
    );
    const getCurrentProfile = vi
      .fn()
      .mockResolvedValueOnce(Either.right(profile))
      .mockResolvedValueOnce(Either.right(nextProfile));
    const { store } = configureStore(
      getCurrentProfile,
      vi.fn().mockReturnValue(updateResult)
    );
    await store.load(userId);

    const oldUpdate = store.update({
      displayName: 'Updated Owner',
      username: 'updated-owner',
      avatarUrl: '',
    });
    await store.load(nextUserId);
    resolveUpdate?.(
      Either.right({
        ...profile,
        displayName: 'Updated Owner',
      })
    );

    expect(await oldUpdate).toBe(false);
    expect(store.userId()).toBe(nextUserId);
    expect(store.profile()).toEqual(nextProfile);
    expect(store.updateStatus()).toBe('idle');
  });
});
