import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AppRouter } from './app-router';
import { BackendApi } from './backend';
import { CatalogLinks } from './catalog-links';
import { LoadingIndicator } from './loading-indicator';

@Component({
  imports: [LoadingIndicator, RouterLink],
  template: `
    <section class="page-stack">
      <header class="page-header">
        <h1>{{ kind() === 'person' ? 'People' : 'Studios' }}</h1>
        <app-loading-indicator [active]="contributors.isLoading()" />
      </header>
      <div class="contributor-list" [attr.aria-busy]="contributors.isLoading()">
        @for (contributor of contributors.value() ?? []; track contributor.id) {
          <article class="panel">
            <h2>
              <a [routerLink]="links.contributor(contributor)">{{ contributor.name }}</a>
            </h2>
            <p>{{ contributor.description }}</p>
          </article>
        }
      </div>
    </section>
  `,
  styles: `
    .contributor-list {
      display: grid;
      gap: clamp(2rem, 4vw, 4rem);
    }
  `,
})
export class ContributorsPage {
  private readonly routes = inject(AppRouter).routes;
  private readonly backendApi = inject(BackendApi);
  protected readonly links = inject(CatalogLinks);
  protected readonly kind = computed(() => (this.routes.PEOPLE.ifActive() ? 'person' : 'studio'));
  protected readonly contributors = rxResource({
    params: this.kind,
    stream: ({ params }) => this.backendApi.getContributors(params),
  });
}
