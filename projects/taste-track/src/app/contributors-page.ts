import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppRouter } from './app-router';
import { CatalogLinks } from './catalog-links';
import { TasteTrackRepository } from './database';

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
  private readonly repository = inject(TasteTrackRepository);
  protected readonly links = inject(CatalogLinks);
  private readonly active = this.routes.activeRoute({
    people: this.routes.routes.PEOPLE,
    companies: this.routes.routes.COMPANIES,
  });
  protected readonly kind = computed(() =>
    this.active().route === 'people' ? 'person' : 'company',
  );
  protected readonly contributors = computed(() =>
    this.repository.contributors().filter((contributor) => contributor.kind === this.kind()),
  );
}
