import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppRouter } from './app-router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  private readonly routes = inject(AppRouter);

  constructor() {
    if (location.pathname === '/') void this.routes.ROOT.DASHBOARD.navigate();
  }
}
