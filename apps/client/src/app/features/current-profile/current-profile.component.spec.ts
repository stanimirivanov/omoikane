import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { ProfileSchema, type Profile } from '@omoikane/domain/profile';
import { CurrentProfileComponent } from './current-profile.component';
import { CurrentProfileStore } from './current-profile.store';

const profile = Schema.decodeUnknownSync(ProfileSchema)({
  id: '00000000-0000-4000-8000-000000000001',
  username: 'owner',
  displayName: 'Workspace Owner',
  avatarUrl: null,
  status: 'active',
});
const profileWithAvatar = Schema.decodeUnknownSync(ProfileSchema)({
  ...profile,
  avatarUrl: 'https://example.com/owner.png',
});

describe('CurrentProfileComponent', () => {
  const configureComponent = async (profile: Profile | null) => {
    const store = {
      profile: signal(profile),
      view: signal(
        profile === null
          ? ({ kind: 'loading' } as const)
          : ({
              kind: 'profile',
              profile,
              isUpdating: false,
              updateError: null,
            } as const)
      ),
      load: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(true),
      clearUpdateError: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CurrentProfileComponent],
    })
      .overrideComponent(CurrentProfileComponent, {
        set: {
          providers: [
            {
              provide: CurrentProfileStore,
              useValue: store,
            },
          ],
        },
      })
      .compileComponents();

    const fixture: ComponentFixture<CurrentProfileComponent> =
      TestBed.createComponent(CurrentProfileComponent);

    fixture.componentRef.setInput(
      'userId',
      '00000000-0000-4000-8000-000000000001'
    );
    fixture.componentRef.setInput('fallbackEmail', 'owner@omoikane.local');
    fixture.detectChanges();

    return { fixture, store };
  };

  it('loads and displays profile identity with the session email', async () => {
    const { fixture, store } = await configureComponent(profile);

    expect(store.load).toHaveBeenCalledWith(profile.id);
    expect(fixture.nativeElement.textContent).toContain('Workspace Owner');
    expect(fixture.nativeElement.textContent).toContain('@owner');
    expect(fixture.nativeElement.textContent).toContain('owner@omoikane.local');
  });

  it('renders the validated current-profile avatar', async () => {
    const { fixture } = await configureComponent(profileWithAvatar);
    const image = fixture.nativeElement.querySelector(
      'app-profile-avatar img'
    ) as HTMLImageElement;

    expect(image.src).toBe(profileWithAvatar.avatarUrl);
    expect(image.alt).toBe('');
  });

  it('submits editable profile values and closes the editor on success', async () => {
    const { fixture, store } = await configureComponent(profile);
    const editButton = Array.from<HTMLButtonElement>(
      fixture.nativeElement.querySelectorAll('button')
    ).find(
      (button) => button.textContent.trim() === 'Edit profile'
    ) as HTMLButtonElement;

    editButton.click();
    fixture.detectChanges();

    const displayNameInput: HTMLInputElement =
      fixture.nativeElement.querySelector('#profile-display-name');
    const usernameInput: HTMLInputElement =
      fixture.nativeElement.querySelector('#profile-username');
    const avatarUrlInput: HTMLInputElement =
      fixture.nativeElement.querySelector('#profile-avatar-url');
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');

    displayNameInput.value = 'Updated Owner';
    usernameInput.value = 'updated-owner';
    avatarUrlInput.value = '';
    form.dispatchEvent(new Event('submit'));
    await Promise.resolve();
    fixture.detectChanges();

    expect(store.update).toHaveBeenCalledExactlyOnceWith({
      displayName: 'Updated Owner',
      username: 'updated-owner',
      avatarUrl: '',
    });
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it('closes the editor when the session identity changes', async () => {
    const { fixture, store } = await configureComponent(profile);
    const editButton = Array.from<HTMLButtonElement>(
      fixture.nativeElement.querySelectorAll('button')
    ).find(
      (button) => button.textContent.trim() === 'Edit profile'
    ) as HTMLButtonElement;

    editButton.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();

    fixture.componentRef.setInput(
      'userId',
      '00000000-0000-4000-8000-000000000002'
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(store.load).toHaveBeenLastCalledWith(
      '00000000-0000-4000-8000-000000000002'
    );
  });

  it('keeps the session email visible while profile data is unavailable', async () => {
    const { fixture } = await configureComponent(null);

    expect(fixture.nativeElement.textContent).toContain('owner@omoikane.local');
  });
});
