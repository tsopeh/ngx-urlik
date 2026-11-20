import {
  ApplicationConfig,
  inject,
  provideBrowserGlobalErrorListeners,
  provideEnvironmentInitializer,
} from '@angular/core';
import { provideAppRouter } from './app-router';
import { Preferences } from './preferences';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAppRouter(),
    // Start Preferences with the app so it saves remembered values from every page.
    provideEnvironmentInitializer(() => {
      inject(Preferences);
    }),
  ],
};
