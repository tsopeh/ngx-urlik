import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AppRouter } from './app-router';

@Component({
  imports: [RouterLink, RouterOutlet],
  template: `
    <header class="page-header compact">
      <div>
        <p class="eyebrow">Browse</p>
        <h1>{{ title() }}</h1>
      </div>
      <nav aria-label="Section navigation">
        @for (link of links(); track link.label) {
          <a [routerLink]="link.url">{{ link.label }}</a>
        }
      </nav>
    </header>
    <router-outlet />
  `,
})
export class SectionPage {
  private readonly routes = inject(AppRouter);
  private readonly active = this.routes.activeRoute({
    screen: this.routes.ROOT.SCREEN,
    music: this.routes.ROOT.MUSIC,
    theatre: this.routes.ROOT.THEATRE,
    seasons: this.routes.ROOT.SCREEN.SHOWS.DETAIL.SEASONS,
  });
  protected readonly title = computed(
    () =>
      ({ screen: 'Screen', music: 'Music', theatre: 'Theatre', seasons: 'Seasons' })[
        this.active.value().route
      ],
  );
  protected readonly links = computed(() => {
    switch (this.active.value().route) {
      case 'screen':
        return [
          { label: 'Movies', url: this.routes.ROOT.SCREEN.MOVIES.createUrlTree() },
          { label: 'TV shows', url: this.routes.ROOT.SCREEN.SHOWS.createUrlTree() },
        ];
      case 'music':
        return [
          { label: 'Albums', url: this.routes.ROOT.MUSIC.ALBUMS.createUrlTree() },
          { label: 'Songs', url: this.routes.ROOT.MUSIC.SONGS.createUrlTree() },
        ];
      case 'theatre':
        return [
          { label: 'Works', url: this.routes.ROOT.THEATRE.WORKS.createUrlTree() },
          { label: 'Productions', url: this.routes.ROOT.THEATRE.PRODUCTIONS.createUrlTree() },
          { label: 'Venues', url: this.routes.ROOT.THEATRE.VENUES.createUrlTree() },
        ];
      case 'seasons':
        return [];
    }
  });
}
