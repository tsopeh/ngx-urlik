// These types infer the public route tree. app-router.ts builds the tree at runtime.
import type { Signal } from '@angular/core';
import type { UrlTree } from '@angular/router';
import type {
  ArrayQueryParamDefinition,
  PathParamDefinition,
  QueryParamDefinition,
} from './params';
import type {
  AngularRedirectOptions,
  AngularRouteOptions,
  ExactMatchDefinition,
  QueryDefinitions,
  RouteDefinition,
} from './route-definition';
import type {
  QueryPatch,
  routeNodeInfo,
  TypedNavigationBehaviorOptions,
  UrlParamsState,
} from './route-node';
import type { AppRouterEscapeHatch } from './router-escape-hatch';
import type { Simplify } from './type-utils';

type Merge<A, B> = Omit<A, keyof B> & B;
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
  readonly params: Signal<UrlParamsState<P, Q>>;
  patchQuery(patch: QueryPatch<Q>, options?: { replaceUrl?: boolean }): Promise<boolean>;
};

type AnyStatefulNode = StatefulNode<any, any>;
type StateOfNode<N> = N extends StatefulNode<infer P, infer Q> ? UrlParamsState<P, Q> : never;
export type ActiveRoute<C extends Readonly<Record<PropertyKey, AnyStatefulNode>>> = {
  readonly [K in keyof C]: Readonly<{
    route: K;
    node: C[K];
    params: StateOfNode<C[K]>;
  }>;
}[keyof C];

// Infer each route object before adding callback context. Inferring the whole object at once
// loses the nested objects whose functions depend on the route state.
export type InferDefinition<T> = {
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
type ReservedIdentity = 'navigate' | 'createUrlTree' | 'params' | 'patchQuery';
export type ContextualRoutes<R, AP = object, AQ = object, Root extends boolean = true> =
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

export type GeneratedAppRouter<R> = RouterTree<R> & {
  globalQueryParams<const Q extends QueryDefinitions>(
    definitions: Q,
    options?: {
      isEqual?: (
        previous: Readonly<GlobalQueryValues<Q>>,
        next: Readonly<GlobalQueryValues<Q>>,
      ) => boolean;
    },
  ): Signal<Readonly<GlobalQueryValues<Q>>>;
  activeRoute<const C extends Readonly<Record<PropertyKey, AnyStatefulNode>>>(
    candidates: C,
  ): Signal<ActiveRoute<C>>;
  readonly escapeHatch: AppRouterEscapeHatch;
};
