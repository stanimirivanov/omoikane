import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  LucideArrowRight,
  LucideLockKeyhole,
  LucideMail,
} from '@lucide/angular';
import { AuthenticationStore } from '../store/authentication.store';

/**
 * Email/password sign-in form.
 *
 * Authentication behavior and state remain in `AuthenticationStore`; the
 * component owns only DOM interaction.
 */
@Component({
  selector: 'app-sign-in',
  standalone: true,
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    LucideArrowRight,
    LucideLockKeyhole,
    LucideMail,
  ],
  templateUrl: './sign-in.component.html',
  styleUrl: '../authentication-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInComponent {
  protected readonly store = inject(AuthenticationStore);

  protected async submit(email: string, password: string): Promise<void> {
    await this.store.signIn(email, password);
  }
}
