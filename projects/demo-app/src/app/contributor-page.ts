import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AppRouter } from './app-router';
import { CatalogLinks } from './catalog-links';
import { LoadingIndicator } from './loading-indicator';
import { BackendApi } from './backend';

@Component({
  imports: [LoadingIndicator, RouterLink],
  template: `
    <section class="page-stack" [attr.aria-busy]="loaded.isLoading()">
      @if (profile()?.contributor; as person) {
        <header class="page-header">
          <div>
            <p class="eyebrow">{{ person.kind }}</p>
            <h1>{{ person.name }}</h1>
            <p>{{ person.description }}</p>
          </div>
          <app-loading-indicator [active]="loaded.isLoading()" />
        </header>
        <section class="panel">
          <h2>Filmography</h2>
          @for (credit of profile()?.credits ?? []; track credit.item.id) {
            <p>
              <a [routerLink]="links.item(credit.item)">{{ credit.item.title }}</a> ·
              {{ credit.roles.join(', ') }}
            </p>
          }
        </section>
      } @else if (profile() === null) {
        <h1>Profile not found</h1>
      } @else {
        <app-loading-indicator />
      }
    </section>
  `,
})
export class ContributorPage {
  private readonly routes = inject(AppRouter).routes;
  private readonly backendApi = inject(BackendApi);
  protected readonly links = inject(CatalogLinks);
  private readonly contributorId = computed(() => {
    const person = this.routes.PERSON_DETAIL.ifActive();
    if (person) {
      return person.params().path.personId;
    }
    const studio = this.routes.STUDIO_DETAIL.ifActive();
    if (studio) {
      return studio.params().path.studioId;
    }
    throw new Error('ContributorPage shows only person and studio routes');
  });
  protected readonly loaded = rxResource({
    params: this.contributorId,
    stream: ({ params }) => this.backendApi.getContributorProfile(params),
  });
  protected readonly profile = this.loaded.value;
}
