import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AppRouter } from './app-router';
import { TasteTrackRepository } from './database';
import { CatalogLinks } from './catalog-links';

@Component({
  imports: [RouterLink, RouterOutlet],
  template: `
    @if (!detailActive()) {
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
    }
    <router-outlet (activate)="detailActive.set(true)" (deactivate)="detailActive.set(false)" />
  `,
})
export class ContributorsPage {
  private readonly routes = inject(AppRouter);
  private readonly repository = inject(TasteTrackRepository);
  protected readonly links = inject(CatalogLinks);
  protected readonly detailActive = signal(false);
  private readonly active = this.routes.activeRoute({
    people: this.routes.ROOT.PEOPLE,
    companies: this.routes.ROOT.COMPANIES,
  });
  protected readonly kind = computed(() =>
    this.active.value().route === 'people' ? 'person' : 'company',
  );
  protected readonly contributors = computed(() =>
    this.repository.contributors().filter((contributor) => contributor.kind === this.kind()),
  );
}
