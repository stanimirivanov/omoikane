import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AuthenticationStore } from '../store/authentication.store';
import type { PasswordRecoveryView } from '../store/authentication.state';
import { PasswordRecoveryComponent } from './password-recovery.component';

describe('PasswordRecoveryComponent', () => {
  const configureComponent = async (
    options: {
      readonly view?: PasswordRecoveryView;
    } = {}
  ) => {
    const store = {
      passwordRecoveryView: signal<PasswordRecoveryView>(
        options.view ?? { kind: 'request-form', isSubmitting: false }
      ),
      error: signal(null),
      requestPasswordReset: vi.fn().mockResolvedValue(true),
      updatePassword: vi.fn().mockResolvedValue(true),
      signOut: vi.fn().mockResolvedValue(true),
      resetPasswordResetRequest: vi.fn(),
      finishPasswordRecovery: vi.fn(),
      clearError: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [PasswordRecoveryComponent],
      providers: [
        {
          provide: AuthenticationStore,
          useValue: store,
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<PasswordRecoveryComponent> =
      TestBed.createComponent(PasswordRecoveryComponent);
    fixture.detectChanges();

    return { fixture, store };
  };

  it('submits an email for password recovery', async () => {
    const { fixture, store } = await configureComponent();
    const emailInput = fixture.nativeElement.querySelector(
      '#password-reset-email'
    ) as HTMLInputElement;
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;

    emailInput.value = 'owner@omoikane.local';
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(store.requestPasswordReset).toHaveBeenCalledExactlyOnceWith(
      'owner@omoikane.local'
    );
  });

  it('renders the same completion notice regardless of account existence', async () => {
    const { fixture, store } = await configureComponent({
      view: { kind: 'email-sent' },
    });

    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      'If an account exists for that address'
    );

    (
      fixture.nativeElement.querySelector('button') as HTMLButtonElement
    ).click();

    expect(store.resetPasswordResetRequest).toHaveBeenCalledOnce();
  });

  it('submits matching fields through the recovery session boundary', async () => {
    const { fixture, store } = await configureComponent({
      view: { kind: 'update-form', isSubmitting: false },
    });
    const passwordInput = fixture.nativeElement.querySelector(
      '#recovery-password'
    ) as HTMLInputElement;
    const confirmationInput = fixture.nativeElement.querySelector(
      '#recovery-password-confirmation'
    ) as HTMLInputElement;
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;

    passwordInput.value = 'Replacement123!';
    confirmationInput.value = 'Replacement123!';
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(store.updatePassword).toHaveBeenCalledExactlyOnceWith(
      'Replacement123!',
      'Replacement123!'
    );
  });

  it('cancels recovery through the existing sign-out workflow', async () => {
    const { fixture, store } = await configureComponent({
      view: { kind: 'update-form', isSubmitting: false },
    });
    const element = fixture.nativeElement as HTMLElement;
    const cancelButton = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Cancel recovery')
    );

    cancelButton?.click();
    await fixture.whenStable();

    expect(store.signOut).toHaveBeenCalledOnce();
  });

  it('leaves a completed recovery screen only on explicit continuation', async () => {
    const { fixture, store } = await configureComponent({
      view: { kind: 'update-complete' },
    });

    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Password updated');

    (
      fixture.nativeElement.querySelector('button') as HTMLButtonElement
    ).click();

    expect(store.finishPasswordRecovery).toHaveBeenCalledOnce();
  });
});
