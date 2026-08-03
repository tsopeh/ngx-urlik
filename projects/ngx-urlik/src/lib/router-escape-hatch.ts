import { IsActiveMatchOptions, Router, UrlTree } from '@angular/router';

export interface AppRouterEscapeHatch {
  readonly createUrlTree: Router['createUrlTree'];
  readonly navigate: Router['navigate'];
  readonly navigateByUrl: Router['navigateByUrl'];
  readonly parseUrl: Router['parseUrl'];
  readonly serializeUrl: Router['serializeUrl'];
  readonly isActive: Router['isActive'];
  readonly url: Router['url'];
  readonly events: Router['events'];
  readonly currentNavigation: Router['currentNavigation'];
  readonly lastSuccessfulNavigation: Router['lastSuccessfulNavigation'];
  readonly navigated: Router['navigated'];
  readonly componentInputBindingEnabled: Router['componentInputBindingEnabled'];
}

export function createRouterEscapeHatch(router: Router): AppRouterEscapeHatch {
  function isActive(url: string | UrlTree, exact: boolean): boolean;
  function isActive(url: string | UrlTree, matchOptions: Partial<IsActiveMatchOptions>): boolean;
  function isActive(
    url: string | UrlTree,
    options: boolean | Partial<IsActiveMatchOptions>,
  ): boolean {
    return typeof options === 'boolean'
      ? router.isActive(url, options)
      : router.isActive(url, options);
  }
  return {
    createUrlTree: (...args) => router.createUrlTree(...args),
    navigate: (...args) => router.navigate(...args),
    navigateByUrl: (...args) => router.navigateByUrl(...args),
    parseUrl: (...args) => router.parseUrl(...args),
    serializeUrl: (...args) => router.serializeUrl(...args),
    isActive,
    get url() {
      return router.url;
    },
    get events() {
      return router.events;
    },
    get currentNavigation() {
      return router.currentNavigation;
    },
    get lastSuccessfulNavigation() {
      return router.lastSuccessfulNavigation;
    },
    get navigated() {
      return router.navigated;
    },
    get componentInputBindingEnabled() {
      return router.componentInputBindingEnabled;
    },
  };
}
