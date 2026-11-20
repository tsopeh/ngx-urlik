import {
  DestroyRef,
  EnvironmentProviders,
  inject,
  InjectionToken,
  makeEnvironmentProviders,
} from '@angular/core';
import { provideRouter, Router, RouterFeatures } from '@angular/router';
import type { RouteArrayInput, TypedAppRouter } from './app-router-types';
import { compileRoutes } from './compiled-route';
import type { RouteDefinitions } from './route-definition';
import { AppRouterDiagnostics, createDiagnosticReporter } from './route-diagnostics';
import { createAppRouter } from './route-node';

export type {
  AppRouterDiagnostic,
  AppRouterDiagnosticCode,
  AppRouterDiagnostics,
} from './route-diagnostics';
export type {
  TypedAppRouter,
  PathParamsOf,
  QueryParamsOf,
  RouteNode,
  QueryPatchOf,
  RoutesOf,
  ParamsOf,
} from './app-router-types';
export type { RouteDefinition, RouteDefinitions } from './route-definition';

/**
 * Returns the `AppRouter` token and `provideAppRouter()`, which passes the routes to Angular's
 * `provideRouter()`. `AppRouter.routes` has one typed entry per route with a `routeName`.
 *
 * Pass the route names enum first. Set each named route's `routeName` to one of its values, such
 * as `RouteNames.MOVIE_DETAIL`. Go to Definition on `routes.MOVIE_DETAIL` then opens the enum
 * member, and Find References and Rename reach the route. Keep the enum in this file and don't
 * export it. Pages use `AppRouter.routes`. Its keys are member names: `Movie = 'movie'` gives
 * `routes.Movie`.
 *
 * Write `path` and `routeName` as literals. TypeScript can't read them otherwise. A named route and
 * every route above it need a plain path in the primary outlet: fixed segments and `:name`
 * placeholders. They can't use `matcher`, `redirectTo`, `**`, `loadChildren`, or a named outlet.
 * Unnamed routes can.
 *
 * Throws one error that lists every problem, such as a repeated name. The route list is fixed after
 * this call, so don't call `Router.resetConfig()`.
 */
export function defineAppRouter<
  const E extends Record<string, string>,
  const R extends readonly unknown[],
>(
  routeNames: E,
  options: {
    routes: RouteArrayInput<R>;
    diagnostics?: AppRouterDiagnostics;
  },
): {
  AppRouter: InjectionToken<TypedAppRouter<E, R>>;
  provideAppRouter: (...features: RouterFeatures[]) => EnvironmentProviders;
} {
  const definitions = options.routes as RouteDefinitions;
  const { routes, namedRoutes } = compileRoutes(definitions, routeNames);
  const report = createDiagnosticReporter(options.diagnostics);
  const AppRouter = new InjectionToken<TypedAppRouter<E, R>>('AppRouter');

  function provideAppRouter(...features: RouterFeatures[]): EnvironmentProviders {
    return makeEnvironmentProviders([
      provideRouter(routes, ...features),
      {
        provide: AppRouter,
        useFactory: () =>
          createAppRouter(
            routeNames,
            namedRoutes,
            inject(Router),
            inject(DestroyRef),
            report,
          ) as TypedAppRouter<E, R>,
      },
    ]);
  }

  return { AppRouter, provideAppRouter };
}
