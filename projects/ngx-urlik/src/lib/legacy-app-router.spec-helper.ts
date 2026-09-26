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
import type {
  ContextualRoutes,
  GeneratedAppRouter,
  InferDefinition,
} from './legacy-app-router-types.spec-helper';
import { compileRouteDefinitions } from './compiled-route';
import {
  LegacyRouteDefinition,
  validateLegacyRouteDefinitions,
} from './legacy-route-definition.spec-helper';
import { AppRouterDiagnostics, createDiagnosticReporter } from './route-diagnostics';
import { createRouteTree } from './route-node';
import { createParameterReader } from './route-params-runtime';
import { createRouterEscapeHatch } from './router-escape-hatch';

type ForwardedRouterFeature = Exclude<RouterFeatures, RouterConfigurationFeature>;
const routerConfigurationFeatureKind = 5;

/** Test-only v1 harness for shared behavior regression checks. */
export function defineLegacyAppRouter<const R extends Readonly<Record<string, unknown>>>(options: {
  routes: InferDefinition<R> & ContextualRoutes<NoInfer<R>>;
  routerConfig?: Omit<RouterConfigOptions, 'paramsInheritanceStrategy'>;
  diagnostics?: AppRouterDiagnostics;
}): {
  AppRouter: InjectionToken<GeneratedAppRouter<R>>;
  provideAppRouter: (...features: ForwardedRouterFeature[]) => EnvironmentProviders;
} {
  const definitions = options.routes as Readonly<Record<string, LegacyRouteDefinition>>;
  const errors = validateLegacyRouteDefinitions(definitions);
  if (errors.length) throw new Error(`Invalid app router definition:\n- ${errors.join('\n- ')}`);

  const report = createDiagnosticReporter(options.diagnostics);
  const reader = createParameterReader(report);
  const { roots, routes } = compileRouteDefinitions(definitions, reader.readState);
  const AppRouter = new InjectionToken<GeneratedAppRouter<R>>('AppRouter');

  function provideAppRouter(...features: ForwardedRouterFeature[]): EnvironmentProviders {
    if (features.some((feature) => (feature.ɵkind as number) === routerConfigurationFeatureKind))
      throw new Error(
        'withRouterConfig() is not accepted by provideAppRouter(); use defineAppRouter({ routerConfig })',
      );
    return makeEnvironmentProviders([
      provideRouter(
        routes,
        withRouterConfig({ ...options.routerConfig, paramsInheritanceStrategy: 'always' }),
        ...features,
      ),
      {
        provide: AppRouter,
        useFactory: () => {
          const router = inject(Router);
          const tree = createRouteTree(roots, router, inject(EnvironmentInjector), reader, report);
          tree['escapeHatch'] = createRouterEscapeHatch(router);
          return tree as GeneratedAppRouter<R>;
        },
      },
    ]);
  }

  return { AppRouter, provideAppRouter };
}
