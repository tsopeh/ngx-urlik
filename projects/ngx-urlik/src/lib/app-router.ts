import {
  EnvironmentProviders,
  EnvironmentInjector,
  InjectionToken,
  Provider,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import {
  Router,
  RouterConfigOptions,
  RouterConfigurationFeature,
  RouterFeatures,
  Routes,
  UrlTree,
  provideRouter,
  withRouterConfig,
} from '@angular/router';
import { ArrayQueryParamDefinition, PathParamDefinition, QueryParamDefinition } from './params';
import { compileRouteDefinitions } from './compiled-route';
import { AppRouterDiagnostics, createDiagnosticReporter } from './route-diagnostics';
import {
  AngularRedirectOptions,
  AngularRouteOptions,
  ExactMatchDefinition,
  QueryDefinitions,
  RouteDefinition,
  validateRouteDefinitions,
} from './route-definition';
import { AppRouterEscapeHatch, createRouterEscapeHatch } from './router-escape-hatch';
import { createParameterReader } from './route-params-runtime';
import {
  TypedNavigationBehaviorOptions,
  GlobalQueryParamsRef,
  UrlParamsRef,
  UrlParamsState,
  UrlStateEquality,
  createRouteTree,
  routeNodeInfo,
} from './route-node';

export type {
  AppRouterDiagnostic,
  AppRouterDiagnosticCode,
  AppRouterDiagnostics,
} from './route-diagnostics';
export type { AngularRedirectOptions, AngularRouteOptions } from './route-definition';
export type { GlobalQueryParamsRef, UrlParamsRef } from './route-node';

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
type StateOfNode<N> = N extends StatefulNode<infer P, infer Q> ? UrlParamsState<P, Q> : never;
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

// Infer data throughout the tree before contextualizing callbacks. Inferring the whole
// object directly skips nested objects containing context-sensitive functions.
type InferDefinition<T> = {
  [K in keyof T]: T[K] &
    (unknown extends T[K]
      ? unknown
      : T[K] extends (...args: never[]) => unknown
        ? unknown
        : InferDefinition<T[K]>);
};
type OrdinaryKey =
  'path' | 'pathParam' | 'queryParams' | 'children' | 'angular' | 'isEqual' | 'exactMatch';
type RedirectKey = 'path' | 'pathParam' | 'queryParams' | 'redirectTo' | 'angular';
type FallbackKey = 'path' | 'queryParams' | 'angular' | 'isEqual';
type StrictOptions<T, Allowed> = Allowed & Record<Exclude<keyof T, keyof Allowed>, never>;
type ContextualExact<E, State> = ExactMatchDefinition<State> &
  Record<Exclude<keyof E, 'angular' | 'redirectTo'>, never> & {
    angular?: E extends { angular: infer A }
      ? StrictOptions<
          A,
          'redirectTo' extends keyof E ? AngularRedirectOptions : AngularRouteOptions
        >
      : never;
  };
type ContextualRoute<D, AP, AQ, Root extends boolean> = {
  [K in keyof D]: K extends (
    D extends { path: '**' }
      ? FallbackKey
      : 'redirectTo' extends keyof D
        ? RedirectKey
        : OrdinaryKey
  )
    ? K extends 'children'
      ? ContextualRoutes<D[K], Merge<AP, OwnPath<D>>, Merge<AQ, OwnQuery<D>>, false>
      : K extends 'redirectTo'
        ? (
            values: UrlParamsState<
              Simplify<Merge<AP, OwnPath<D>>>,
              Simplify<Merge<AQ, OwnQuery<D>>>
            >,
          ) => UrlTree
        : K extends 'exactMatch'
          ? ContextualExact<
              D[K],
              UrlParamsState<Simplify<Merge<AP, OwnPath<D>>>, Simplify<Merge<AQ, OwnQuery<D>>>>
            >
          : K extends 'angular'
            ? StrictOptions<
                D[K],
                'redirectTo' extends keyof D ? AngularRedirectOptions : AngularRouteOptions
              >
            : K extends 'isEqual'
              ? RouteDefinition['isEqual']
              : K extends 'path'
                ? Root extends false
                  ? D[K] extends ''
                    ? never
                    : string
                  : string
                : K extends keyof RouteDefinition
                  ? D[K] extends RouteDefinition[K]
                    ? unknown
                    : never
                  : never
    : never;
} & { readonly path: string };
type ReservedIdentity = 'navigate' | 'createUrlTree' | 'urlParams';
type ContextualRoutes<R, AP = object, AQ = object, Root extends boolean = true> =
  R extends Readonly<Record<string, unknown>>
    ? {
        readonly [K in keyof R]: K extends
          | ReservedIdentity
          | (Root extends true ? 'escapeHatch' | 'activeRoute' | 'globalQueryParams' : never)
          ? never
          : ContextualRoute<R[K], AP, AQ, Root>;
      }
    : never;

type ChildrenOf<D> = D extends { children: infer C extends Readonly<Record<string, unknown>> }
  ? C
  : object;
type IsFallback<D> = D extends { path: '**' } ? true : false;
type IsRedirect<D> = 'redirectTo' extends keyof D ? true : false;
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
type GlobalQueryValues<Q extends QueryDefinitions> = { [K in keyof Q]: QueryValue<Q[K]> };

type GeneratedAppRouter<R> = RouterTree<R> & {
  globalQueryParams<const Q extends QueryDefinitions>(
    definitions: Q,
    options?: {
      isEqual?: (
        previous: Readonly<GlobalQueryValues<Q>>,
        next: Readonly<GlobalQueryValues<Q>>,
      ) => boolean;
    },
  ): GlobalQueryParamsRef<GlobalQueryValues<Q>>;
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

export function defineAppRouter<const R extends Readonly<Record<string, unknown>>>(options: {
  routes: InferDefinition<R> & ContextualRoutes<NoInfer<R>>;
  routerConfig?: Omit<RouterConfigOptions, 'paramsInheritanceStrategy'>;
  diagnostics?: AppRouterDiagnostics;
}): {
  AppRouter: InjectionToken<GeneratedAppRouter<R>>;
  provideAppRouter: (...features: ForwardedRouterFeature[]) => EnvironmentProviders;
} {
  // The input mapping checks the public shape; runtime validation also handles
  // JavaScript callers and values crossing untyped boundaries.
  const definitions = options.routes as Readonly<Record<string, RouteDefinition>>;
  const errors = validateRouteDefinitions(definitions);
  if (errors.length) throw new Error(`Invalid app router definition:\n- ${errors.join('\n- ')}`);
  let token!: InjectionToken<GeneratedAppRouter<R>>;
  const report = createDiagnosticReporter(options.diagnostics);
  const readState = createParameterReader(report);
  const { roots, routes } = compileRouteDefinitions(definitions, readState);

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
