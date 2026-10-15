import type { Signal } from '@angular/core';
import type { ActivatedRouteSnapshot, Route, UrlTree } from '@angular/router';
import type {
  ArrayQueryParamDefinition,
  PersistOptions,
  QueryParamDefinition,
  UrlParamCodec,
} from './params';
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

export type RouteNode<P = unknown, Q = unknown, Required extends PropertyKey = never> = {
  createUrlTree(...args: MethodArgs<P, Q, Required>): UrlTree;
  navigate(
    ...args: [...MethodArgs<P, Q, Required>, options?: TypedNavigationBehaviorOptions]
  ): Promise<boolean>;
  readonly [routeNodeInfo]: unknown;
  readonly params: Signal<UrlParamsState<P, Q>>;
  /** Decodes this route from a snapshot, such as the one a guard or resolver receives. */
  paramsFrom(snapshot: ActivatedRouteSnapshot): UrlParamsState<P, Q>;
  patchQuery(patch: QueryPatch<Q>, options?: { replaceUrl?: boolean }): Promise<boolean>;
};

type AnyStatefulNode = {
  readonly [routeNodeInfo]: unknown;
  readonly params: Signal<UrlParamsState<unknown, unknown>>;
  patchQuery(patch: never, options?: { replaceUrl?: boolean }): Promise<boolean>;
};
type StateOfNode<N> = N extends { params: Signal<infer S> } ? S : never;
type QueryOfNode<N> = N extends {
  patchQuery(patch: QueryPatch<infer Q>, ...args: unknown[]): unknown;
}
  ? Q
  : never;

export type QueryParamsOf<N> = QueryOfNode<N>;
export type PathParamsOf<N> = N extends RouteNode<infer P, infer Q, infer R> ? P : never;
export type RouteStateOf<N> = StateOfNode<N>;
export type RouteQueryPatch<N> = QueryPatch<QueryParamsOf<N>>;

export type ActiveRoute<C extends Readonly<Record<PropertyKey, AnyStatefulNode>>> = {
  readonly [K in keyof C]: Readonly<{
    route: K;
    node: C[K];
    params: StateOfNode<C[K]>;
    createUrlTree(patch?: {
      query?: Partial<QueryOfNode<C[K]>>;
      fragment?: string | null;
    }): UrlTree;
    patchQuery(
      patch: QueryPatch<QueryOfNode<C[K]>>,
      options?: { replaceUrl?: boolean },
    ): Promise<boolean>;
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
// Placeholders of a path that come before the placeholder `Name`.
type NamesBefore<S extends string, Name extends string> = S extends `${infer Head}/${infer Tail}`
  ? Head extends `:${Name}`
    ? never
    : PathSegmentName<Head> | NamesBefore<Tail, Name>
  : never;
type CodecOption = Readonly<{ codec: UrlParamCodec<unknown>; persist?: PersistOptions }>;
type CodecValue<C> = C extends { codec: UrlParamCodec<infer T> } ? T : string;
type IsUnion<T, C = T> = T extends C ? ([C] extends [T] ? false : true) : never;
// A scope may name only path parameters known before this value. A scope typed as a wide string,
// such as one from an annotated helper, is checked at runtime.
type ScopeCheck<C, Names extends string> = C extends {
  readonly persist?: { readonly scope?: readonly (infer S)[] };
}
  ? string extends S
    ? unknown
    : [Exclude<S, Names>] extends [never]
      ? unknown
      : { readonly persist?: { readonly scope?: readonly Names[] } }
  : unknown;
type StrictCodecOption<C, ScopeNames extends string> = CodecOption &
  Record<Exclude<keyof C, 'codec' | 'persist'>, never> &
  ScopeCheck<C, ScopeNames>;
type KeyedPathConfig<
  Names extends string,
  Supplied,
  Path extends string,
  Ancestor extends string,
> = {
  readonly [K in Names]: K extends keyof Supplied
    ? StrictCodecOption<Supplied[K], Ancestor | NamesBefore<Path, K>>
    : CodecOption;
} & Record<Exclude<keyof Supplied, Names>, never>;
type PathConfig<Names extends string, Supplied, Path extends string, Ancestor extends string> = [
  Names,
] extends [never]
  ? never
  : IsUnion<Names> extends true
    ? KeyedPathConfig<Names, Supplied, Path, Ancestor>
    : | StrictCodecOption<Supplied, Ancestor | NamesBefore<Path, Names>>
      | KeyedPathConfig<Names, Supplied, Path, Ancestor>;
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
// A persisted query field's scope may name the path parameters of its route chain.
type ScopeChecks<Q, Names extends string> = { readonly [P in keyof Q]: ScopeCheck<Q[P], Names> };
type RouteKey = keyof Route | 'routeName' | 'pathParam' | 'queryParams' | 'isEqual';

type ContextualRoute<D, AncestorQuery, AncestorPath extends string> = {
  [K in keyof D]: K extends RouteKey
    ? K extends 'children'
      ? D[K] extends readonly unknown[]
        ? ContextualRouteArray<
            D[K],
            AccumulatedQuery<D, AncestorQuery>,
            AncestorPath | OwnPathNames<D>
          >
        : never
      : K extends 'routeName'
        ? D extends { path: '**' } | { redirectTo: unknown }
          ? never
          : D[K] extends string
            ? string extends D[K]
              ? never
              : D[K]
            : never
        : K extends 'pathParam'
          ? PathConfig<
              OwnPathNames<D>,
              D[K],
              D extends { path: infer P extends string } ? P : '',
              AncestorPath
            >
          : K extends 'queryParams'
            ? D[K] extends QueryDefinitions
              ? Record<Extract<keyof D[K], keyof AncestorQuery>, never> &
                  ScopeChecks<D[K], AncestorPath | OwnPathNames<D>>
              : never
            : K extends 'isEqual'
              ? RouteDefinition['isEqual']
              : K extends keyof Route
                ? Route[K]
                : never
    : never;
} & (D extends { matcher: unknown } ? { readonly path?: string } : { readonly path: string });

/** Contextual checks for a literal Angular-shaped route array. */
export type ContextualRouteArray<
  R,
  AncestorQuery = object,
  AncestorPath extends string = never,
> = R extends readonly unknown[]
  ? number extends R['length']
    ? R extends readonly Route[]
      ? R
      : { readonly [K in keyof R]: ContextualRoute<R[K], AncestorQuery, AncestorPath> }
    : { readonly [K in keyof R]: ContextualRoute<R[K], AncestorQuery, AncestorPath> }
  : never;

type CompiledRouteNode<D, AP, AQ, Required extends PropertyKey> = RouteNode<
  AccumulatedPath<D, AP>,
  AccumulatedQuery<D, AQ>,
  Required | RequiredQueryKeys<D>
>;
type NamedNode<D, AP, AQ, Required extends PropertyKey> = D extends {
  path: string;
  routeName: infer Name extends string;
}
  ? D extends { path: '**' } | { redirectTo: unknown }
    ? object
    : { readonly [K in Name]: CompiledRouteNode<D, AP, AQ, Required> }
  : object;
type RouteEntries<
  R,
  AP = object,
  AQ = object,
  Required extends PropertyKey = never,
> = R extends readonly [infer D, ...infer Rest]
  ? NamedNode<D, AP, AQ, Required> &
      (D extends { children: infer Children extends readonly unknown[] }
        ? RouteEntries<
            Children,
            AccumulatedPath<D, AP>,
            AccumulatedQuery<D, AQ>,
            Required | RequiredQueryKeys<D>
          >
        : object) &
      RouteEntries<Rest, AP, AQ, Required>
  : object;
type NamedRoutes<R> = Simplify<RouteEntries<R>>;
type GlobalQueryValues<Q extends QueryDefinitions> = { [K in keyof Q]: QueryValue<Q[K]> };

/** The flat router keyed by route name. */
export type GeneratedAppRouter<E extends Record<string, string>, R> = {
  readonly routes: {
    readonly [K in keyof E]: E[K] extends keyof NamedRoutes<R> ? NamedRoutes<R>[E[K]] : never;
  };
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
  /**
   * Removes values that `persist` options stored. Without an argument, removes every key with the
   * router's prefix from both storages. With an object, touches only the storages set to `true`
   * (every prefixed key) or to an array of keys (each key with all of its scopes). The current URL
   * does not change.
   */
  clearPersisted(options?: {
    local?: boolean | readonly string[];
    session?: boolean | readonly string[];
  }): void;
  readonly escapeHatch: AppRouterEscapeHatch;
};
