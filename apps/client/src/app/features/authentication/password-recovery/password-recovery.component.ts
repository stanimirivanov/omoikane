import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  LucideArrowRight,
  LucideCircleCheck,
  LucideLockKeyhole,
  LucideMail,
  LucideMailCheck,
} from '@lucide/angular';
import { AuthenticationStore } from '../store/authentication.store';

/**
 * Owns password-recovery form interaction for both email request and update.
 *
 * The root authentication store remains the consistency boundary because the
 * two forms coordinate with the same provider session stream. This component
 * does not inspect callback tokens or provider events.
 */
@Component({
  selector: 'app-password-recovery',
  standalone: true,
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    LucideArrowRight,
    LucideCircleCheck,
    LucideLockKeyhole,
    LucideMail,
    LucideMailCheck,
  ],
  templateUrl: './password-recovery.component.html',
  styleUrl: '../authentication-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordRecoveryComponent {
  protected readonly store = inject(AuthenticationStore);

  protected async requestReset(email: string): Promise<void> {
    await this.store.requestPasswordReset(email);
  }

  protected async updatePassword(
    password: string,
    passwordConfirmation: string
  ): Promise<void> {
    await this.store.updatePassword(password, passwordConfirmation);
  }
}
