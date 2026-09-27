import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { AppRouter } from './app-router';
import { CatalogLinks } from './catalog-links';
import { BackendApi } from './backend-api';
import type { Contributor } from './domain';

@Component({
  imports: [RouterLink],
  template: `
    <section class="page-stack">
      <header class="page-header">
        <h1>{{ kind() === 'person' ? 'People' : 'Companies' }}</h1>
      </header>
      @for (contributor of contributors(); track contributor.id) {
        <article class="panel">
          <h2>
            <a [routerLink]="links.contributor(contributor)">{{ contributor.name }}</a>
          </h2>
          <p>{{ contributor.description }}</p>
        </article>
      }
    </section>
  `,
})
export class ContributorsPage {
  private readonly routes = inject(AppRouter);
  private readonly backendApi = inject(BackendApi);
  protected readonly links = inject(CatalogLinks);
  private readonly active = this.routes.activeRoute({
    people: this.routes.routes.PEOPLE,
    companies: this.routes.routes.COMPANIES,
  });
  protected readonly kind = computed(() =>
    this.active().route === 'people' ? 'person' : 'company',
  );
  protected readonly contributors = toSignal(
    toObservable(this.kind).pipe(switchMap((kind) => this.backendApi.getContributors(kind))),
    { initialValue: [] as readonly Contributor[] },
  );
}
