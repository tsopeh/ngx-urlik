import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppRouter } from './app-router';

@Component({
  imports: [RouterLink],
  template: `<section class="empty-state">
    <span>404</span>
    <p class="eyebrow">Off the program</p>
    <h1>This route isn’t in the repertoire.</h1>
    <p>The typed catalog has no canonical entry for this address.</p>
    <a class="button primary" [routerLink]="routes.ROOT.DASHBOARD.createUrlTree()"
      >Return to dashboard</a
    >
  </section>`,
})
export class NotFoundPage {
  protected readonly routes = inject(AppRouter);
}
