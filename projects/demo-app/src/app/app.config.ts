import {
  ApplicationConfig,
  inject,
  provideBrowserGlobalErrorListeners,
  provideEnvironmentInitializer,
} from '@angular/core';
import { withInMemoryScrolling } from '@angular/router';
import { provideAppRouter } from './app-router';
import { Preferences } from './preferences';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Section links on a detail page, like #credits, scroll to their section. Scroll restoration
    // stays off, because it would scroll to the top on every filter change a form writes.
    provideAppRouter(withInMemoryScrolling({ anchorScrolling: 'enabled' })),
    // Start Preferences with the app so it saves remembered values from every page.
    provideEnvironmentInitializer(() => {
      inject(Preferences);
    }),
  ],
};
