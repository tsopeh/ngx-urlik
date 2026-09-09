import { Component, computed, effect, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AppRouter } from './app-router';

@Component({
  imports: [RouterLink, RouterOutlet],
  template: `
    <header class="page-header compact">
      <div>
        <p class="eyebrow">Browse</p>
        <h1>Movies & TV</h1>
      </div>
      <nav aria-label="Section navigation">
        <a [routerLink]="moviesUrl()">Movies</a>
        <a [routerLink]="showsUrl()">TV shows</a>
      </nav>
    </header>
    <router-outlet />
  `,
})
export class SectionPage {
  private readonly routes = inject(AppRouter);
  private readonly active = this.routes.activeRoute({
    movies: this.routes.ROOT.SCREEN.MOVIES,
    shows: this.routes.ROOT.SCREEN.SHOWS,
    screen: this.routes.ROOT.SCREEN,
  });
  constructor() {
    effect(() => {
      if (this.active.value().route === 'screen')
        void this.routes.ROOT.SCREEN.MOVIES.navigate(
          { query: this.params.value().query },
          { replaceUrl: true },
        );
    });
  }
  private readonly params = this.routes.ROOT.SCREEN.urlParams();
  protected readonly moviesUrl = computed(() =>
    this.routes.ROOT.SCREEN.MOVIES.createUrlTree({
      query: { ...this.params.value().query, page: 1 },
    }),
  );
  protected readonly showsUrl = computed(() =>
    this.routes.ROOT.SCREEN.SHOWS.createUrlTree({
      query: { ...this.params.value().query, page: 1 },
    }),
  );
}
