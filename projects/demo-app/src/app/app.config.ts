import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideAppRouter } from './app-router';

export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideAppRouter()],
};
