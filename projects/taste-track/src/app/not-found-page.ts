import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppRouter } from './app-router';

@Component({
  imports: [RouterLink],
  template: `<section class="empty-state">
    <span>404</span>
    <p class="eyebrow">Page not found</p>
    <h1>This page isn’t in the catalog.</h1>
    <p>Try browsing movies or TV shows.</p>
    <a class="button primary" [routerLink]="routes.routes.MOVIES.createUrlTree()">Browse movies</a>
  </section>`,
})
export class NotFoundPage {
  protected readonly routes = inject(AppRouter);
}
