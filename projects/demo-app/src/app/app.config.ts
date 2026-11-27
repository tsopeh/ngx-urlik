import {
  ApplicationConfig,
  inject,
  provideBrowserGlobalErrorListeners,
  provideEnvironmentInitializer,
} from '@angular/core';
import { withInMemoryScrolling } from '@angular/router';
import { provideAppRouter } from './app-router';
import { BACKEND_LATENCY } from './backend';
import { DemoLab } from './demo-lab';
import { Preferences } from './preferences';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Section links on a detail page, like #credits, scroll to their section. Scroll restoration
    // stays off, because it would scroll to the top on every filter change a form writes.
    provideAppRouter(withInMemoryScrolling({ anchorScrolling: 'enabled' })),
    // The backend answers at the speed picked in Settings.
    {
      provide: BACKEND_LATENCY,
      useFactory: () => {
        const lab = inject(DemoLab);
        return () => lab.latency();
      },
    },
    // Start Preferences with the app so it saves remembered values from every page.
    provideEnvironmentInitializer(() => {
      inject(Preferences);
    }),
  ],
};
