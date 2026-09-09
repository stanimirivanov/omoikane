import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Either } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticationSession } from '@omoikane/application/authentication';
import { ProfileApplicationService } from '@client/core/profile/profile-application.service';
import { WorkspaceApplicationService } from '@client/core/workspace/workspace-application.service';
import { AuthenticationStore } from './store/authentication.store';
import type {
  AuthenticationShellView,
  PasswordRecoveryView,
} from './store/authentication.state';
import { AuthenticationShellComponent } from './authentication-shell.component';

describe('AuthenticationShellComponent', () => {
  const configureComponent = async (
    options: {
      readonly view?: AuthenticationShellView;
      readonly session?: AuthenticationSession | null;
    } = {}
  ) => {
    const store = {
      shellView: signal<AuthenticationShellView>(options.view ?? 'anonymous'),

      passwordRecoveryView: signal<PasswordRecoveryView>(
        options.view === 'password-recovery' ? 'update-form' : 'request-form'
      ),

      isSigningIn: signal(false),

      isSigningUp: signal(false),

      isResendingConfirmationEmail: signal(false),

      isRequestingPasswordReset: signal(false),

      isUpdatingPassword: signal(false),

      isSigningOut: signal(false),

      session: signal(options.session ?? null),

      error: signal(null),

      requiresEmailConfirmation: signal(false),

      confirmationEmail: signal(null),

      wasConfirmationEmailResent: signal(false),

      initialize: vi.fn().mockResolvedValue(undefined),

      signIn: vi.fn().mockResolvedValue(true),

      signUp: vi.fn().mockResolvedValue(true),

      resendConfirmationEmail: vi.fn().mockResolvedValue(true),

      requestPasswordReset: vi.fn().mockResolvedValue(true),

      updatePassword: vi.fn().mockResolvedValue(true),

      signOut: vi.fn().mockResolvedValue(true),

      clearError: vi.fn(),

      resetSignUp: vi.fn(),

      resetPasswordResetRequest: vi.fn(),

      finishPasswordRecovery: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AuthenticationShellComponent],

      providers: [
        provideRouter([]),
        {
          provide: AuthenticationStore,
          useValue: store,
        },
        {
          provide: ProfileApplicationService,
          useValue: {
            getCurrentProfile: vi.fn().mockResolvedValue(
              Either.right({
                id: '00000000-0000-4000-8000-000000000001',
                username: 'owner',
                displayName: 'Workspace Owner',
                avatarUrl: null,
                status: 'active',
              })
            ),
            updateCurrentProfile: vi.fn(),
          },
        },
        {
          provide: WorkspaceApplicationService,
          useValue: {
            observeAccessibleWorkspaces: vi.fn(() => vi.fn()),
            listAccessibleWorkspaces: vi
              .fn()
              .mockResolvedValue(Either.right([])),
            listArchivedWorkspaces: vi.fn().mockResolvedValue(Either.right([])),
            listPendingWorkspaceInvitations: vi
              .fn()
              .mockResolvedValue(Either.right([])),
          },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<AuthenticationShellComponent> =
      TestBed.createComponent(AuthenticationShellComponent);

    fixture.detectChanges();

    return {
      fixture,
      store,
    };
  };

  it('initializes authentication once when created', async () => {
    const { store } = await configureComponent({
      view: 'initializing',
    });

    expect(store.initialize).toHaveBeenCalledOnce();
  });

  it('renders the restored session email', async () => {
    const { fixture } = await configureComponent({
      view: 'authenticated',

      session: {
        userId: '00000000-0000-4000-8000-000000000001',

        email: 'owner@omoikane.local',
      },
    });

    expect(fixture.nativeElement.textContent).toContain('owner@omoikane.local');
  });

  it('renders sign-in content for an anonymous user', async () => {
    const { fixture } = await configureComponent({
      view: 'anonymous',
    });

    expect(fixture.nativeElement.textContent).toContain('Omoikane');
    expect(fixture.nativeElement.textContent).toContain(
      'The Collaborative Intelligence Platform'
    );
    expect(fixture.nativeElement.textContent).toContain('Sign in to Omoikane');
  });

  it('switches anonymous users to account registration', async () => {
    const { fixture, store } = await configureComponent();
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('nav button')
    ) as HTMLButtonElement[];
    const createAccountButton = buttons.find((button) =>
      button.textContent?.includes('Create account')
    );

    createAccountButton?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Create your Omoikane account'
    );
    expect(store.clearError).toHaveBeenCalledOnce();
  });

  it('switches anonymous users to password recovery', async () => {
    const { fixture, store } = await configureComponent();
    const forgotPasswordButton = Array.from(
      fixture.nativeElement.querySelectorAll('button')
    ).find((button: Element) =>
      button.textContent?.includes('Forgot password')
    );

    (forgotPasswordButton as HTMLButtonElement | undefined)?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Reset your password');
    expect(store.clearError).toHaveBeenCalledOnce();
  });

  it('gives an active recovery session precedence over authenticated content', async () => {
    const { fixture } = await configureComponent({
      view: 'password-recovery',
      session: {
        userId: '00000000-0000-4000-8000-000000000001',
        email: 'owner@omoikane.local',
      },
    });

    expect(fixture.nativeElement.textContent).toContain(
      'Choose a new password'
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      'owner@omoikane.local'
    );
  });
});
