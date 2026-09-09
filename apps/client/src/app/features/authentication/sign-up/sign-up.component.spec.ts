import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AuthenticationStore } from '../store/authentication.store';
import type { SignUpView } from '../store/authentication.state';
import { SignUpComponent } from './sign-up.component';

describe('SignUpComponent', () => {
  const configureComponent = async (confirmationRequired = false) => {
    const store = {
      signUpView: signal<SignUpView>(
        confirmationRequired
          ? {
              kind: 'confirmation-required',
              email: 'new-user@example.com',
              isResending: false,
              wasResent: false,
            }
          : { kind: 'form', isSubmitting: false }
      ),
      error: signal(null),
      signUp: vi.fn().mockResolvedValue(true),
      resendConfirmationEmail: vi.fn().mockResolvedValue(true),
      clearError: vi.fn(),
      resetSignUp: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [SignUpComponent],
      providers: [
        {
          provide: AuthenticationStore,
          useValue: store,
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<SignUpComponent> =
      TestBed.createComponent(SignUpComponent);
    fixture.detectChanges();

    return { fixture, store };
  };

  it('submits email and password to the store', async () => {
    const { fixture, store } = await configureComponent();
    const emailInput = fixture.nativeElement.querySelector(
      '#sign-up-email'
    ) as HTMLInputElement;
    const passwordInput = fixture.nativeElement.querySelector(
      '#sign-up-password'
    ) as HTMLInputElement;
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;

    emailInput.value = 'new-user@example.com';
    passwordInput.value = 'Password123!';
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(store.signUp).toHaveBeenCalledExactlyOnceWith(
      'new-user@example.com',
      'Password123!'
    );
  });

  it('renders the confirmation completion without the form', async () => {
    const { fixture, store } = await configureComponent(true);

    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Check your email');

    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button')
    ) as HTMLButtonElement[];
    buttons
      .find((button) => button.textContent?.includes('Register another'))
      ?.click();

    expect(store.resetSignUp).toHaveBeenCalledOnce();
  });

  it('resends confirmation for the address retained by the store', async () => {
    const { fixture, store } = await configureComponent(true);
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button')
    ) as HTMLButtonElement[];

    buttons
      .find((button) => button.textContent?.includes('Resend confirmation'))
      ?.click();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('new-user@example.com');
    expect(store.resendConfirmationEmail).toHaveBeenCalledOnce();
  });
});
