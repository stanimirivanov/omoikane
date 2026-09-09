import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LucideArrowRight, LucideSparkles } from '@lucide/angular';
import { SignInComponent } from './sign-in/sign-in.component';
import { SignUpComponent } from './sign-up/sign-up.component';
import { PasswordRecoveryComponent } from './password-recovery/password-recovery.component';
import { AuthenticationStore } from './store/authentication.store';
import { CurrentProfileComponent } from '../current-profile/current-profile.component';
import { WorkspaceNavigationComponent } from '../workspace-navigation/workspace-navigation.component';

/**
 * Application entry shell selected by authentication state.
 *
 * The shell triggers explicit one-time store initialization and renders either
 * anonymous account access or authenticated application content. Its local
 * signal selects anonymous account-access forms without duplicating command
 * state. Observed password-recovery intent takes precedence over the ordinary
 * authenticated shell.
 */
@Component({
  selector: 'app-authentication-shell',
  standalone: true,
  imports: [
    SignInComponent,
    SignUpComponent,
    PasswordRecoveryComponent,
    CurrentProfileComponent,
    WorkspaceNavigationComponent,
    MatButtonModule,
    MatProgressSpinnerModule,
    LucideArrowRight,
    LucideSparkles,
  ],
  templateUrl: './authentication-shell.component.html',
  styleUrl: './authentication-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthenticationShellComponent {
  protected readonly store = inject(AuthenticationStore);

  protected readonly anonymousView = signal<
    'sign-in' | 'sign-up' | 'password-recovery'
  >('sign-in');

  constructor() {
    /*
     * Initialization is an explicit lifecycle action, not a reaction to a
     * signal dependency. Therefore an Angular effect() is unnecessary.
     */
    void this.store.initialize();
  }

  protected showAnonymousView(
    view: 'sign-in' | 'sign-up' | 'password-recovery'
  ): void {
    this.store.clearError();
    this.anonymousView.set(view);
  }
}
