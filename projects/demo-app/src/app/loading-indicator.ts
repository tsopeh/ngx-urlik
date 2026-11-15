import { Component, input } from '@angular/core';

/**
 * Says "Loading…" while `active` is true. The status region stays in the page when it's idle, so
 * screen readers announce each new load.
 */
@Component({
  selector: 'app-loading-indicator',
  template: `
    <span class="loading-indicator" role="status">
      @if (active()) {
        <span class="spinner" aria-hidden="true"></span>Loading…
      }
    </span>
  `,
  styles: `
    .loading-indicator {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--text-muted);
      font-size: 0.9rem;
    }
    .spinner {
      width: 0.9rem;
      aspect-ratio: 1;
      border: 2px solid var(--border-subtle);
      border-top-color: var(--accent-primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(1turn);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .spinner {
        animation: none;
      }
    }
  `,
})
export class LoadingIndicator {
  readonly active = input(true);
}
