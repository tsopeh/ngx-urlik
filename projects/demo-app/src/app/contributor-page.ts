import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AppRouter } from './app-router';
import { BackendApi, type ContributorCredit } from './backend';
import { CatalogLinks } from './catalog-links';
import { LoadingIndicator } from './loading-indicator';
import { TabTitle } from './tab-title';

type CreditRole = ContributorCredit['roles'][number];

const roleOrder: readonly CreditRole[] = ['Director', 'Writer', 'Actor', 'Production'];

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
          @if (roles().length > 1) {
            <div class="chip-row" aria-label="Roles">
              <button
                type="button"
                [class.selected]="role() === null"
                [attr.aria-pressed]="role() === null"
                (click)="showRole(null)"
              >
                All roles
              </button>
              @for (choice of roles(); track choice) {
                <button
                  type="button"
                  [class.selected]="role() === choice"
                  [attr.aria-pressed]="role() === choice"
                  (click)="showRole(choice)"
                >
                  {{ choice }}
                </button>
              }
            </div>
          }
          @for (credit of credits(); track credit.item.id) {
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
  styles: `
    .chip-row {
      margin-bottom: 1rem;
    }
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

  // Only a person's page has a role filter. A studio is credited only for production.
  protected readonly role = computed(
    () => this.routes.PERSON_DETAIL.ifActive()?.params().query.role ?? null,
  );
  protected readonly roles = computed(() => {
    const credited = new Set(this.profile()?.credits.flatMap((credit) => credit.roles));
    return roleOrder.filter((role) => credited.has(role));
  });
  protected readonly credits = computed(() => {
    const credits = this.profile()?.credits ?? [];
    const role = this.role();
    return role ? credits.filter((credit) => credit.roles.includes(role)) : credits;
  });

  constructor() {
    inject(TabTitle).showHeading(() => this.profile()?.contributor.name);
  }

  // A chip changes one query parameter and no form edits it, so it calls patchQuery() directly.
  // The patch adds a history entry, so Back returns to the previous role.
  protected showRole(role: CreditRole | null) {
    void this.routes.PERSON_DETAIL.patchQuery({ role });
  }
}
