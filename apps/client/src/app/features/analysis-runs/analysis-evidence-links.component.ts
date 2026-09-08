import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AnalysisResultSource } from '@omoikane/domain/analysis';

/** Links ordered evidence to the existing authorized channel-message view. */
@Component({
  selector: 'app-analysis-evidence-links',
  standalone: true,
  imports: [RouterLink],
  template: `
    <ol>
      @for (source of sources(); track source.messageRevisionId) {
        <li>
          <a
            [routerLink]="[]"
            [queryParams]="{ message: source.messageId }"
            queryParamsHandling="merge"
          >
            Source message
          </a>
          <span
            >revision <code>{{ source.messageRevisionId }}</code></span
          >
        </li>
      }
    </ol>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisEvidenceLinksComponent {
  readonly sources = input.required<ReadonlyArray<AnalysisResultSource>>();
}
