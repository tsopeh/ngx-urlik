import { Component, computed, inject } from '@angular/core';
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
  private readonly route = this.routes.ROOT.SCREEN;
  protected readonly moviesUrl = computed(() =>
    this.routes.ROOT.SCREEN.MOVIES.createUrlTree({
      query: { ...this.route.params().query, page: 1 },
    }),
  );
  protected readonly showsUrl = computed(() =>
    this.routes.ROOT.SCREEN.SHOWS.createUrlTree({
      query: { ...this.route.params().query, page: 1 },
    }),
  );
}
