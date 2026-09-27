import {
  EnvironmentInjector,
  EnvironmentProviders,
  inject,
  InjectionToken,
  makeEnvironmentProviders,
} from '@angular/core';
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
import { AppRouterDiagnostics, createDiagnosticReporter } from './route-diagnostics';
import { compileRoutes } from './compiled-route';
import { createAppRouter } from './route-node';
import { createParameterReader } from './route-params-runtime';

export type {
  AppRouterDiagnostic,
  AppRouterDiagnosticCode,
  AppRouterDiagnostics,
} from './route-diagnostics';
export type { ActiveRoute } from './app-router-types';
export type { QueryPatch, UrlParamsState } from './route-node';

type ForwardedRouterFeature = Exclude<RouterFeatures, RouterConfigurationFeature>;
const routerConfigurationFeatureKind = 5;

export function defineAppRouter<const R extends readonly unknown[]>(options: {
  routes: InferDefinition<R> & ContextualRouteArray<NoInfer<R>>;
  routerConfig?: RouterConfigOptions;
  diagnostics?: AppRouterDiagnostics;
}): {
  AppRouter: InjectionToken<GeneratedAppRouter<R>>;
  provideAppRouter: (...features: ForwardedRouterFeature[]) => EnvironmentProviders;
} {
  const definitions = options.routes as RouteDefinitions;
  const errors = validateRouteDefinitions(definitions);
  if (errors.length) throw new Error(`Invalid app router definition:\n- ${errors.join('\n- ')}`);

  const report = createDiagnosticReporter(options.diagnostics);
  const reader = createParameterReader(report);
  const { routes, catalog } = compileRoutes(definitions);
  const AppRouter = new InjectionToken<GeneratedAppRouter<R>>('AppRouter');

  function provideAppRouter(...features: ForwardedRouterFeature[]): EnvironmentProviders {
    if (features.some((feature) => (feature.ɵkind as number) === routerConfigurationFeatureKind))
      throw new Error(
        'withRouterConfig() is not accepted by provideAppRouter(); use defineAppRouter({ routerConfig })',
      );
    return makeEnvironmentProviders([
      provideRouter(
        routes,
        ...(options.routerConfig ? [withRouterConfig(options.routerConfig)] : []),
        ...features,
      ),
      {
        provide: AppRouter,
        useFactory: () =>
          createAppRouter(
            catalog,
            inject(Router),
            inject(EnvironmentInjector),
            reader,
            report,
          ) as GeneratedAppRouter<R>,
      },
    ]);
  }

  return { AppRouter, provideAppRouter };
}
