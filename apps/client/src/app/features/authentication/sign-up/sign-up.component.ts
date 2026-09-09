import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  LucideArrowRight,
  LucideLockKeyhole,
  LucideMail,
  LucideMailCheck,
} from '@lucide/angular';
import { AuthenticationStore } from '../store/authentication.store';

/**
 * Email/password account-registration form.
 *
 * The component owns DOM interaction only. Validation, provider execution,
 * command serialization, retained confirmation address, and resend state
 * remain in the authentication application boundary and root store.
 */
@Component({
  selector: 'app-sign-up',
  standalone: true,
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    LucideArrowRight,
    LucideLockKeyhole,
    LucideMail,
    LucideMailCheck,
  ],
  templateUrl: './sign-up.component.html',
  styleUrl: '../authentication-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignUpComponent {
  protected readonly store = inject(AuthenticationStore);

  protected async submit(
    emailInput: HTMLInputElement,
    passwordInput: HTMLInputElement
  ): Promise<void> {
    await this.store.signUp(emailInput.value, passwordInput.value);
  }
}
