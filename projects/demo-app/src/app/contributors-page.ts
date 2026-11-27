import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormField, FormRoot } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { createQueryParamsSignalForm } from 'ngx-urlik/forms';
import { AppRouter } from './app-router';
import { BackendApi } from './backend';
import { CatalogLinks } from './catalog-links';
import { LoadingIndicator } from './loading-indicator';

@Component({
  imports: [FormField, FormRoot, LoadingIndicator, RouterLink],
  template: `
    <section class="page-stack">
      <header class="page-header">
        <h1>{{ kind === 'person' ? 'People' : 'Studios' }}</h1>
        <app-loading-indicator [active]="contributors.isLoading()" />
      </header>
      <form class="search-form" [formRoot]="search.form">
        <label
          ><span>Search {{ kind === 'person' ? 'people' : 'studios' }}</span
          ><input type="search" [formField]="search.form.search" placeholder="Name…"
        /></label>
        <button class="button primary" type="submit">Search</button>
        @if (searchInUrl()) {
          <button class="button" type="button" (click)="clear()">Clear</button>
        }
      </form>
      @if (unsubmitted()) {
        <p class="hint">Press Search to filter the list. The URL changes only then.</p>
      }
      <div class="contributor-list" [attr.aria-busy]="contributors.isLoading()">
        @for (contributor of contributors.value() ?? []; track contributor.id) {
          <article class="panel">
            <h2>
              <a [routerLink]="links.contributor(contributor)">{{ contributor.name }}</a>
            </h2>
            <p>{{ contributor.description }}</p>
          </article>
        } @empty {
          @if (contributors.hasValue()) {
            <p class="empty">No names contain “{{ searchInUrl() }}”.</p>
          }
        }
      </div>
    </section>
  `,
  styles: `
    .contributor-list {
      display: grid;
      gap: clamp(2rem, 4vw, 4rem);
    }
    .search-form {
      display: flex;
      gap: 0.75rem;
      align-items: end;
      max-width: 36rem;
    }
    .search-form label {
      flex: 1;
    }
    .hint {
      margin: 0;
      color: var(--text-muted);
    }
  `,
})
export class ContributorsPage {
  private readonly routes = inject(AppRouter).routes;
  private readonly backendApi = inject(BackendApi);
  protected readonly links = inject(CatalogLinks);
  // Angular creates this page again for each list, so it picks its route once. Each URL change
  // sends a request, so the search writes only when the user presses Search.
  protected readonly kind: 'person' | 'studio' = this.routes.PEOPLE.ifActive()
    ? 'person'
    : 'studio';
  private readonly route = this.kind === 'person' ? this.routes.PEOPLE : this.routes.STUDIOS;
  protected readonly search = createQueryParamsSignalForm(this.route, { writeOn: 'submit' });
  protected readonly searchInUrl = computed(() => this.route.params().query.search);
  // The model changes on every keystroke, while the URL changes only on Search.
  protected readonly unsubmitted = computed(
    () => this.search.model().search !== this.searchInUrl(),
  );
  protected readonly contributors = rxResource({
    params: () => ({ kind: this.kind, search: this.searchInUrl() }),
    stream: ({ params }) => this.backendApi.getContributors(params),
  });

  protected clear() {
    this.search.model.set({ search: '' });
    void this.search.write();
  }
}
