import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AnalysisResultSource } from '@omoikane/domain/analysis';

/** Links ordered evidence to the existing authorized channel-message view. */
@Component({
  selector: 'app-analysis-evidence-links',
  standalone: true,
  imports: [RouterLink],
  template: `
    <ol class="evidence-links" aria-label="Source evidence">
      @for (
        source of sources();
        track source.messageRevisionId;
        let sourceNumber = $index
      ) {
        <li>
          <a
            [routerLink]="[]"
            [queryParams]="{ message: source.messageId }"
            queryParamsHandling="merge"
          >
            Open source {{ sourceNumber + 1 }}
          </a>
          <span class="revision">
            Immutable revision <code>{{ source.messageRevisionId }}</code>
          </span>
        </li>
      }
    </ol>
  `,
  styles: `
    .evidence-links {
      display: grid;
      gap: 0.35rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .evidence-links li {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.35rem 0.6rem;
      padding: 0.45rem 0.6rem;
      border-left: 0.1875rem solid var(--omo-accent);
      border-radius: 0.25rem;
      background: var(--omo-accent-soft);
      font-size: 0.75rem;
    }

    .evidence-links a {
      color: var(--omo-accent-strong);
      font-weight: 700;
    }

    .revision {
      min-width: 0;
      color: var(--omo-text-muted);
    }

    code {
      overflow-wrap: anywhere;
      font-size: 0.6875rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisEvidenceLinksComponent {
  readonly sources = input.required<ReadonlyArray<AnalysisResultSource>>();
}
