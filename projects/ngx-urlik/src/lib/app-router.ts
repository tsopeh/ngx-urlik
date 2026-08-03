import {
  EnvironmentProviders,
  EnvironmentInjector,
  InjectionToken,
  Provider,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import {
  NavigationBehaviorOptions,
  Router,
  RouterConfigOptions,
  RouterConfigurationFeature,
  RouterFeatures,
  Routes,
  UrlTree,
  provideRouter,
  withRouterConfig,
} from '@angular/router';
import {
  AnyQueryParamDefinition,
  ArrayQueryParamDefinition,
  PathParamDefinition,
  QueryParamDefinition,
} from './params';
import { compileRouteDefinitions } from './compiled-route';
import { AppRouterDiagnostics, createDiagnosticReporter } from './route-diagnostics';
import {
  AngularRedirectOptions,
  AngularRouteOptions,
  QueryDefinitions,
  RouteDefinition,
  validateRouteDefinitions,
} from './route-definition';
import { AppRouterEscapeHatch, createRouterEscapeHatch } from './router-escape-hatch';
import { createParameterReader } from './route-params-runtime';
import { UrlParamsRef, createRouteTree, routeNodeInfo } from './route-node';

export type {
  AppRouterDiagnostic,
  AppRouterDiagnosticCode,
  AppRouterDiagnostics,
} from './route-diagnostics';
export type { AngularRedirectOptions, AngularRouteOptions } from './route-definition';
export type { UrlParamsRef } from './route-node';

type ForwardedRouterFeature = Exclude<RouterFeatures, RouterConfigurationFeature>;
type Merge<A, B> = Omit<A, keyof B> & B;
type Simplify<T> = { [K in keyof T]: T[K] };
type OwnPath<D> = D extends { pathParam: PathParamDefinition<infer T, infer Name> }
  ? Record<Name, T>
  : object;
type QueryValue<D> =
  D extends QueryParamDefinition<infer T, boolean, infer Defaulted>
    ? Defaulted extends true
      ? T
      : T | null
    : D extends ArrayQueryParamDefinition<infer T, boolean>
      ? readonly T[]
      : never;
type OwnQuery<D> = D extends { queryParams: infer Q extends QueryDefinitions }
  ? { [K in keyof Q]: QueryValue<Q[K]> }
  : object;
type RequiredQueryKeys<D> = D extends { queryParams: infer Q extends QueryDefinitions }
  ? { [K in keyof Q]: Q[K] extends { required: true } ? K : never }[keyof Q]
  : never;
type State<P, Q> = Readonly<{ path: Readonly<Simplify<P>>; query: Readonly<Simplify<Q>> }>;
type UrlStateEquality<P = unknown, Q = unknown> = (a: State<P, Q>, b: State<P, Q>) => boolean;
type TypedNavigationBehaviorOptions = Omit<NavigationBehaviorOptions, 'browserUrl'>;

type ConstructionArgs<P, Q, Required extends PropertyKey> = (keyof P extends never
  ? { path?: never }
  : { path: Simplify<P> }) &
  ([Required] extends [never]
    ? { query?: Partial<Simplify<Q>> }
    : { query: Partial<Simplify<Q>> & Pick<Simplify<Q>, Extract<Required, keyof Q>> }) & {
    fragment?: string | null;
  };
type MethodArgs<P, Q, Required extends PropertyKey> = keyof P extends never
  ? [Required] extends [never]
    ? [values?: ConstructionArgs<P, Q, Required>]
    : [values: ConstructionArgs<P, Q, Required>]
  : [values: ConstructionArgs<P, Q, Required>];
type BaseNode<P, Q, Required extends PropertyKey> = {
  createUrlTree(...args: MethodArgs<P, Q, Required>): UrlTree | null;
  navigate(
    ...args: [...MethodArgs<P, Q, Required>, options?: TypedNavigationBehaviorOptions]
  ): Promise<boolean>;
};
type StatefulNode<P, Q> = {
  readonly [routeNodeInfo]: unknown;
  urlParams(options?: { isEqual?: UrlStateEquality<P, Q> }): UrlParamsRef<P, Q>;
};

type AnyStatefulNode = StatefulNode<any, any>;
type StateOfNode<N> = N extends StatefulNode<infer P, infer Q> ? State<P, Q> : never;
export interface ActiveRouteRef<C extends Readonly<Record<PropertyKey, AnyStatefulNode>>> {
  readonly value: import('@angular/core').Signal<
    {
      readonly [K in keyof C]: Readonly<{
        route: K;
        node: C[K];
        params: StateOfNode<C[K]>;
      }>;
    }[keyof C]
  >;
}

type OrdinaryKey = 'path' | 'pathParam' | 'queryParams' | 'children' | 'angular' | 'isEqual';
type RedirectKey = 'path' | 'pathParam' | 'queryParams' | 'redirectTo' | 'angular';
type FallbackKey = 'path' | 'queryParams' | 'angular' | 'isEqual';
type ContextualRoute<D, AP, AQ> = 'redirectTo' extends keyof D
  ? D extends { readonly redirectTo: (...args: never[]) => unknown }
    ? ContextualRouteShape<D, AP, AQ>
    : never
  : ContextualRouteShape<D, AP, AQ>;
type ContextualRouteShape<D, AP, AQ> =
  Simplify<Merge<AP, OwnPath<D>>> extends infer P
    ? Simplify<Merge<AQ, OwnQuery<D>>> extends infer Q
      ? D &
          Record<
            Exclude<
              keyof D,
              D extends { path: '**' }
                ? FallbackKey
                : D extends { redirectTo: (...args: never[]) => unknown }
                  ? RedirectKey
                  : OrdinaryKey
            >,
            never
          > &
          (D extends { path: '**' }
            ? { readonly pathParam?: never; readonly children?: never; readonly redirectTo?: never }
            : D extends { redirectTo: (...args: never[]) => unknown }
              ? {
                  readonly redirectTo: (values: State<P, Q>) => UrlTree;
                  readonly children?: never;
                  readonly isEqual?: never;
                  readonly angular?: AngularRedirectOptions;
                }
              : {
                  readonly redirectTo?: never;
                  readonly children?: D extends { children: infer C }
                    ? ContextualRoutes<C, P, Q, false>
                    : never;
                })
      : never
    : never;
type ReservedIdentity = 'navigate' | 'createUrlTree' | 'urlParams';
type ContextualRoutes<R, AP = object, AQ = object, Root extends boolean = true> =
  R extends Readonly<Record<string, unknown>>
    ? {
        readonly [K in keyof R]: K extends
          ReservedIdentity | (Root extends true ? 'escapeHatch' | 'activeRoute' : never)
          ? never
          : ContextualRoute<R[K], AP, AQ>;
      }
    : never;

type ChildrenOf<D> = D extends { children: infer C extends Readonly<Record<string, unknown>> }
  ? C
  : object;
type IsFallback<D> = D extends { path: '**' } ? true : false;
type IsRedirect<D> = D extends { redirectTo: (...args: never[]) => unknown } ? true : false;
type NodeFor<D, AP, AQ, Required extends PropertyKey> =
  Simplify<Merge<AP, OwnPath<D>>> extends infer P
    ? Simplify<Merge<AQ, OwnQuery<D>>> extends infer Q
      ? (IsFallback<D> extends true
          ? StatefulNode<P, Q>
          : BaseNode<P, Q, Required | RequiredQueryKeys<D>> &
              (IsRedirect<D> extends true ? object : StatefulNode<P, Q>)) &
          RouterTree<ChildrenOf<D>, P, Q, Required | RequiredQueryKeys<D>>
      : never
    : never;
type RouterTree<R, AP = object, AQ = object, Required extends PropertyKey = never> = {
  readonly [K in keyof R]: NodeFor<R[K], AP, AQ, Required>;
};
type GeneratedAppRouter<R> = RouterTree<R> & {
  activeRoute<const C extends Readonly<Record<PropertyKey, AnyStatefulNode>>>(
    candidates: C,
  ): ActiveRouteRef<C>;
  readonly escapeHatch: AppRouterEscapeHatch;
};

const routerConfigurationFeatureKind = 5;
const isRouterConfigurationFeature = (feature: RouterFeatures) =>
  (feature.ɵkind as number) === routerConfigurationFeatureKind;

function createProviderFunction<T>(
  token: InjectionToken<T>,
  routes: Routes,
  routerConfig: Omit<RouterConfigOptions, 'paramsInheritanceStrategy'> | undefined,
  factory: () => T,
): (...features: ForwardedRouterFeature[]) => EnvironmentProviders {
  return (...features) => {
    if (features.some(isRouterConfigurationFeature))
      throw new Error(
        'withRouterConfig() is not accepted by provideAppRouter(); use defineAppRouter({ routerConfig })',
      );
    const tokenProvider: Provider = { provide: token, useFactory: factory };
    return makeEnvironmentProviders([
      provideRouter(
        routes,
        withRouterConfig({ ...routerConfig, paramsInheritanceStrategy: 'always' }),
        ...features,
      ),
      tokenProvider,
    ]);
  };
}

export function defineAppRouter<
  const R extends Readonly<Record<string, RouteDefinition>>,
>(options: {
  routes: R & ContextualRoutes<R>;
  routerConfig?: Omit<RouterConfigOptions, 'paramsInheritanceStrategy'>;
  diagnostics?: AppRouterDiagnostics;
}): {
  AppRouter: InjectionToken<GeneratedAppRouter<R>>;
  provideAppRouter: (...features: ForwardedRouterFeature[]) => EnvironmentProviders;
} {
  const errors = validateRouteDefinitions(options.routes);
  if (errors.length) throw new Error(`Invalid app router definition:\n- ${errors.join('\n- ')}`);
  let token!: InjectionToken<GeneratedAppRouter<R>>;
  const report = createDiagnosticReporter(options.diagnostics);
  const readState = createParameterReader(report);
  const { roots, routes } = compileRouteDefinitions(options.routes, readState);

  function factory(): GeneratedAppRouter<R> {
    const router = inject(Router);
    const injector = inject(EnvironmentInjector);
    const tree = createRouteTree(roots, router, injector, readState, report);
    tree['escapeHatch'] = createRouterEscapeHatch(router);
    return tree as GeneratedAppRouter<R>;
  }

  token = new InjectionToken<GeneratedAppRouter<R>>('AppRouter');
  const provideAppRouter = createProviderFunction(token, routes, options.routerConfig, factory);
  return { AppRouter: token, provideAppRouter };
}
