import {
  EnvironmentInjector,
  EnvironmentProviders,
  inject,
  InjectionToken,
  makeEnvironmentProviders,
  PLATFORM_ID,
  provideEnvironmentInitializer,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  provideRouter,
  Router,
  RouterConfigOptions,
  RouterConfigurationFeature,
  RouterFeatures,
  withRouterConfig,
} from '@angular/router';
import type { ContextualRouteArray, GeneratedAppRouter, InferDefinition } from './app-router-types';
import { RouteDefinitions, validateRouteDefinitions } from './route-definition';
import {
  AppRouterDiagnostics,
  createDiagnosticReporter,
  createDiagnosticWarn,
} from './route-diagnostics';
import { compileRoutes } from './compiled-route';
import { createAppRouter } from './route-node';
import { createParameterReader } from './route-params-runtime';
import {
  createPathRestoreReader,
  createPersistence,
  createStorageGate,
  defaultPersistencePrefix,
  Persistence,
} from './persistence';

export type {
  AppRouterDiagnostic,
  AppRouterDiagnosticCode,
  AppRouterParameterDiagnostic,
  AppRouterUnknownKeyDiagnostic,
  AppRouterDiagnostics,
} from './route-diagnostics';
export type {
  ActiveRoute,
  GeneratedAppRouter,
  PathParamsOf,
  QueryParamsOf,
  RouteNode,
  RouteQueryPatch,
  RouteStateOf,
} from './app-router-types';
export type { RouteDefinition, RouteDefinitions } from './route-definition';
export type { UrlParamsState } from './route-node';

type ForwardedRouterFeature = Exclude<RouterFeatures, RouterConfigurationFeature>;
const routerConfigurationFeatureKind = 5;

/**
 * Defines typed route names and provides Angular Router with the ordered route array.
 *
 * A route with `routeName` needs a statically declared primary-outlet `path`. Its ancestors
 * need such paths and statically declared `children`. Named routes cannot use `matcher`,
 * `redirectTo`, `**`, `loadChildren`, or a named outlet. Those Angular routes can stay unnamed
 * and still work.
 * Named paths use static segments and `:name` placeholders, not matrix parameters or custom
 * matching. Pass a route names map or enum as the first argument, such as `RouteNames`, and assign
 * each named route a string name, such as `routeName: RouteNames.MOVIE_DETAIL`.
 * This lets Go to Definition take you from `router.routes.MOVIE_DETAIL` to the route name
 * declaration. Keep `path` and the route name literal so TypeScript can infer the nodes.
 * Route names must be unique values of `routeNames`; this function throws during definition if
 * they are not. `AppRouter.routes` is keyed by member name, so `Movie = 'movie'` creates
 * `routes.Movie`. The typed
 * catalog is fixed at definition time, so replacing it with `Router.resetConfig()` is unsupported.
 */
export function defineAppRouter<
  const E extends Record<string, string>,
  const R extends readonly unknown[],
>(
  routeNames: E,
  options: {
    routes: InferDefinition<R> & ContextualRouteArray<NoInfer<R>>;
    routerConfig?: RouterConfigOptions;
    diagnostics?: AppRouterDiagnostics;
    /** `prefix` starts every storage key that `persist` options use. Default: `'ngx-urlik:'`. */
    persistence?: { prefix?: string };
  },
): {
  AppRouter: InjectionToken<GeneratedAppRouter<E, R>>;
  provideAppRouter: (...features: ForwardedRouterFeature[]) => EnvironmentProviders;
} {
  const definitions = options.routes as RouteDefinitions;
  const errors = validateRouteDefinitions(definitions, routeNames);
  if (errors.length) throw new Error(`Invalid app router definition:\n- ${errors.join('\n- ')}`);

  const warn = createDiagnosticWarn(options.diagnostics);
  const report = createDiagnosticReporter(warn);
  const reader = createParameterReader(report);
  const prefix = options.persistence?.prefix ?? defaultPersistencePrefix;
  const PersistenceRuntime = new InjectionToken<Persistence>('AppRouter persistence');
  const storageGate = createStorageGate();
  const { routes, catalog, persistKeys } = compileRoutes(
    definitions,
    PersistenceRuntime,
    createPathRestoreReader(prefix, report, storageGate),
  );
  const AppRouter = new InjectionToken<GeneratedAppRouter<E, R>>('AppRouter');

  function provideAppRouter(...features: ForwardedRouterFeature[]): EnvironmentProviders {
    if (features.some((feature) => (feature.ɵkind as number) === routerConfigurationFeatureKind))
      throw new Error(
        'withRouterConfig() is not accepted by provideAppRouter(); use defineAppRouter(routeNames, { routerConfig })',
      );
    return makeEnvironmentProviders([
      provideRouter(
        routes,
        ...(options.routerConfig ? [withRouterConfig(options.routerConfig)] : []),
        ...features,
      ),
      provideEnvironmentInitializer(() =>
        storageGate.register(isPlatformBrowser(inject(PLATFORM_ID))),
      ),
      {
        provide: PersistenceRuntime,
        useFactory: () =>
          createPersistence(
            prefix,
            persistKeys,
            report,
            warn,
            isPlatformBrowser(inject(PLATFORM_ID)),
            inject(EnvironmentInjector),
          ),
      },
      {
        provide: AppRouter,
        useFactory: () =>
          createAppRouter(
            routeNames,
            catalog,
            inject(Router),
            inject(EnvironmentInjector),
            reader,
            report,
            inject(PersistenceRuntime),
          ) as GeneratedAppRouter<E, R>,
      },
    ]);
  }

  return { AppRouter, provideAppRouter };
}
