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
import { RouteDefinitions, validateRouteDefinitions } from './route-definition';
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
 * Gives Angular Router your routes, and gives you a typed entry in `AppRouter.routes` for each
 * route with a `routeName`.
 *
 * Pass your route names enum first. Give each named route one of its values, such as
 * `routeName: RouteNames.MOVIE_DETAIL`. Then Go to Definition on `routes.MOVIE_DETAIL` opens the
 * enum member, and Find References and Rename reach the route too. Keep the enum in this file and
 * don't export it: pages use `AppRouter.routes`. `AppRouter.routes` uses member names, so
 * `Movie = 'movie'` gives `routes.Movie`.
 *
 * Write `path` and `routeName` as literals, so TypeScript can read them. A named route, and every
 * route above it, needs a plain path in the primary outlet: fixed segments and `:name`
 * placeholders. It can't use `matcher`, `redirectTo`, `**`, `loadChildren`, or a named outlet.
 * Those routes still work without a name.
 *
 * Throws one error listing every problem, such as a repeated name. The route list is fixed once
 * this runs, so don't replace it with `Router.resetConfig()`.
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
  const errors = validateRouteDefinitions(definitions, routeNames);
  if (errors.length) {
    throw new Error(`defineAppRouter() found problems:\n- ${errors.join('\n- ')}`);
  }

  const report = createDiagnosticReporter(options.diagnostics);
  const { routes, namedRoutes } = compileRoutes(definitions);
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
