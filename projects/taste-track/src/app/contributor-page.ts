import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppRouter } from './app-router';
import { TasteTrackRepository } from './database';
import { CatalogLinks } from './catalog-links';

@Component({
  imports: [RouterLink],
  template: `
    <section class="page-stack">
      @if (contributor(); as person) {
        <header class="page-header">
          <div>
            <p class="eyebrow">{{ person.kind }}</p>
            <h1>{{ person.name }}</h1>
            <p>{{ person.description }}</p>
          </div>
        </header>
        <section class="panel">
          <h2>Filmography</h2>
          @for (credit of credits(); track credit.item.id) {
            <p>
              <a [routerLink]="links.item(credit.item)">{{ credit.item.title }}</a> ·
              {{ credit.roles.join(', ') }}
            </p>
          }
        </section>
      } @else if (repository.ready()) {
        <h1>Profile not found</h1>
      }
    </section>
  `,
})
export class ContributorPage {
  private readonly routes = inject(AppRouter);
  protected readonly repository = inject(TasteTrackRepository);
  protected readonly links = inject(CatalogLinks);
  private readonly active = this.routes.activeRoute({
    person: this.routes.ROOT.PEOPLE.DETAIL,
    company: this.routes.ROOT.COMPANIES.DETAIL,
  });
  protected readonly contributor = computed(() => {
    const active = this.active.value();
    const id =
      active.route === 'person' ? active.params.path.personId : active.params.path.companyId;
    return this.repository.contributors().find((contributor) => contributor.id === id);
  });
  protected readonly credits = computed(() =>
    this.repository
      .items()
      .filter((item) => item.kind !== 'episode')
      .flatMap((item) => {
        const roles = item.credits
          .filter((credit) => credit.contributorId === this.contributor()?.id)
          .map((credit) => credit.role);
        return roles.length ? [{ item, roles }] : [];
      }),
  );
}
