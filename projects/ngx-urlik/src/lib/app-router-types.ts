import type { Signal } from '@angular/core';
import type { Route, UrlTree } from '@angular/router';
import type { ArrayQueryParamDefinition, QueryParamDefinition, UrlParamCodec } from './params';
import type { QueryDefinitions, RouteDefinition } from './route-definition';
import type { QueryPatch, TypedNavigationBehaviorOptions, UrlParamsState } from './route-node';
import type { routeNodeInfo } from './route-symbols';
import type { AppRouterEscapeHatch } from './router-escape-hatch';
import type { Simplify } from './type-utils';

type Merge<A, B> = Omit<A, keyof B> & B;
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

// Infer each route object before applying contextual checks to nested fields.
export type InferDefinition<T> = {
  [K in keyof T]: T[K] &
    (unknown extends T[K]
      ? unknown
      : T[K] extends (...args: never[]) => unknown
        ? unknown
        : InferDefinition<T[K]>);
};

type PathSegmentName<S extends string> = S extends `:${infer Name}` ? Name : never;
type PathNames<S extends string> = S extends `${infer Head}/${infer Tail}`
  ? PathSegmentName<Head> | PathNames<Tail>
  : PathSegmentName<S>;
type OwnPathNames<D> = D extends { path: infer P extends string } ? PathNames<P> : never;
type CodecOption = Readonly<{ codec: UrlParamCodec<any> }>;
type CodecValue<C> = C extends { codec: UrlParamCodec<infer T> } ? T : string;
type IsUnion<T, C = T> = T extends C ? ([C] extends [T] ? false : true) : never;
type StrictCodecOption<C> = CodecOption & Record<Exclude<keyof C, 'codec'>, never>;
type KeyedPathConfig<Names extends string, Supplied> = {
  readonly [K in Names]: K extends keyof Supplied ? StrictCodecOption<Supplied[K]> : CodecOption;
} & Record<Exclude<keyof Supplied, Names>, never>;
type PathConfig<Names extends string, Supplied> = [Names] extends [never]
  ? never
  : IsUnion<Names> extends true
    ? KeyedPathConfig<Names, Supplied>
    : StrictCodecOption<Supplied> | KeyedPathConfig<Names, Supplied>;
type OwnPath<D> = {
  [K in OwnPathNames<D>]: D extends { pathParam: infer P }
    ? P extends CodecOption
      ? CodecValue<P>
      : K extends keyof P
        ? CodecValue<P[K]>
        : string
    : string;
};
type AccumulatedPath<D, Ancestor> = Simplify<Merge<Ancestor, OwnPath<D>>>;
type AccumulatedQuery<D, Ancestor> = Simplify<Merge<Ancestor, OwnQuery<D>>>;
type RouteKey = keyof Route | 'identifier' | 'pathParam' | 'queryParams' | 'isEqual';

type ContextualRoute<D, AncestorQuery> = {
  [K in keyof D]: K extends RouteKey
    ? K extends 'children'
      ? D[K] extends readonly unknown[]
        ? ContextualRouteArray<D[K], AccumulatedQuery<D, AncestorQuery>>
        : never
      : K extends 'identifier'
        ? D extends { path: '**' } | { redirectTo: unknown }
          ? never
          : string
        : K extends 'pathParam'
          ? PathConfig<OwnPathNames<D>, D[K]>
          : K extends 'queryParams'
            ? D[K] extends QueryDefinitions
              ? Record<Extract<keyof D[K], keyof AncestorQuery>, never>
              : never
            : K extends 'isEqual'
              ? RouteDefinition['isEqual']
              : K extends keyof Route
                ? Route[K]
                : never
    : never;
} & (D extends { matcher: unknown } ? { readonly path?: string } : { readonly path: string });

/** Contextual checks for a literal Angular-shaped route array. */
export type ContextualRouteArray<R, AncestorQuery = object> = R extends readonly unknown[]
  ? number extends R['length']
    ? R extends readonly Route[]
      ? R
      : { readonly [K in keyof R]: ContextualRoute<R[K], AncestorQuery> }
    : { readonly [K in keyof R]: ContextualRoute<R[K], AncestorQuery> }
  : never;

type RouteNode<D, AP, AQ, Required extends PropertyKey> = BaseNode<
  AccumulatedPath<D, AP>,
  AccumulatedQuery<D, AQ>,
  Required | RequiredQueryKeys<D>
> &
  StatefulNode<AccumulatedPath<D, AP>, AccumulatedQuery<D, AQ>>;
type RouteEntries<
  R,
  AP = object,
  AQ = object,
  Required extends PropertyKey = never,
> = R extends readonly unknown[]
  ? R[number] extends infer D
    ? | (D extends { path: string; identifier: infer Name extends string }
          ? D extends { path: '**' } | { redirectTo: unknown }
            ? never
            : { readonly [K in Name]: RouteNode<D, AP, AQ, Required> }
          : never)
      | (D extends { children: infer Children extends readonly unknown[] }
          ? RouteEntries<
              Children,
              AccumulatedPath<D, AP>,
              AccumulatedQuery<D, AQ>,
              Required | RequiredQueryKeys<D>
            >
          : never)
    : never
  : never;
type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (
  value: infer I,
) => void
  ? I
  : never;
type IdentifiedRoutes<R> = [RouteEntries<R>] extends [never]
  ? object
  : Simplify<UnionToIntersection<RouteEntries<R>>>;
type GlobalQueryValues<Q extends QueryDefinitions> = { [K in keyof Q]: QueryValue<Q[K]> };

/** The flat, identifier-keyed public router generated from a route array. */
export type GeneratedAppRouter<R> = {
  readonly routes: IdentifiedRoutes<R>;
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
