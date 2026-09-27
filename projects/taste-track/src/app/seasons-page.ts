import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterOutlet } from '@angular/router';
import { switchMap } from 'rxjs';
import { AppRouter } from './app-router';
import { CatalogApiService } from './catalog-api';
import type { Season } from './domain';

@Component({
  imports: [RouterLink, RouterOutlet],
  template: `
    <nav class="anchor-links season-links" aria-label="Seasons">
      <a [routerLink]="showUrl()">Back to show</a>
      @for (link of links(); track link.label) {
        <a [routerLink]="link.url">{{ link.label }}</a>
      }
    </nav>
    <router-outlet />
  `,
  styles: `
    .season-links {
      padding: 1rem clamp(1.25rem, 4vw, 4rem);
    }
  `,
})
export class SeasonsPage {
  private readonly routes = inject(AppRouter);
  private readonly catalogApi = inject(CatalogApiService);
  private readonly route = this.routes.routes.SEASONS;
  protected readonly showUrl = computed(() =>
    this.routes.routes.SHOW_DETAIL.createUrlTree({
      path: this.route.params().path,
      query: this.route.params().query,
    }),
  );
  private readonly showId = computed(() => this.route.params().path.showId);
  private readonly seasons = toSignal(
    toObservable(this.showId).pipe(switchMap((showId) => this.catalogApi.getSeasons(showId))),
    { initialValue: [] as readonly Season[] },
  );
  protected readonly links = computed(() =>
    this.seasons().map((season) => ({
      label: season.title,
      url: this.routes.routes.SEASON_DETAIL.createUrlTree({
        path: { showId: season.showId, seasonNumber: season.number },
        query: this.route.params().query,
      }),
    })),
  );
}
