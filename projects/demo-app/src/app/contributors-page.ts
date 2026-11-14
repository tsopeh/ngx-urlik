import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { AppRouter } from './app-router';
import { BackendApi, type Contributor } from './backend';
import { CatalogLinks } from './catalog-links';

@Component({
  imports: [RouterLink],
  template: `
    <section class="page-stack">
      <header class="page-header">
        <h1>{{ kind() === 'person' ? 'People' : 'Studios' }}</h1>
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
  private readonly routes = inject(AppRouter).routes;
  private readonly backendApi = inject(BackendApi);
  protected readonly links = inject(CatalogLinks);
  protected readonly kind = computed(() => (this.routes.PEOPLE.ifActive() ? 'person' : 'studio'));
  protected readonly contributors = toSignal(
    toObservable(this.kind).pipe(switchMap((kind) => this.backendApi.getContributors(kind))),
    { initialValue: [] as readonly Contributor[] },
  );
}
