import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AppRouter } from './app-router';
import { TasteTrackRepository } from './database';

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
  private readonly repository = inject(TasteTrackRepository);
  private readonly params = this.routes.ROOT.SCREEN.SHOWS.DETAIL.SEASONS.urlParams();
  protected readonly showUrl = computed(() =>
    this.routes.ROOT.SCREEN.SHOWS.DETAIL.createUrlTree({
      path: this.params.value().path,
      query: this.params.value().query,
    }),
  );
  protected readonly links = computed(() =>
    this.repository
      .seasons()
      .filter((season) => season.showId === this.params.value().path.showId)
      .map((season) => ({
        label: season.title,
        url: this.routes.ROOT.SCREEN.SHOWS.DETAIL.SEASONS.DETAIL.createUrlTree({
          path: { showId: season.showId, seasonNumber: season.number },
          query: this.params.value().query,
        }),
      })),
  );
}
