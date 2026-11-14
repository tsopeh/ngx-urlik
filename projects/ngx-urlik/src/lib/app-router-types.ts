import type { Signal } from '@angular/core';
import type { ActivatedRouteSnapshot, Route, UrlTree } from '@angular/router';
import type { QueryParamDefinition, UrlParamCodec } from './params';
import type { QueryDefinitions } from './route-definition';
import type { NavigateOptions, UrlParamsState } from './route-node';
import type { routeNodeInfo } from './route-symbols';
import type { AppRouterEscapeHatch } from './router-escape-hatch';
import type { Simplify } from './type-utils';

type Merge<A, B> = Omit<A, keyof B> & B;
// A field reads as T when it has a default, and as T | null when it doesn't.
type QueryValue<D> =
  D extends QueryParamDefinition<infer T, boolean, infer Defaulted>
    ? Defaulted extends true
      ? T
      : T | null
    : never;
type OwnQuery<D> = D extends { queryParams: infer Q extends QueryDefinitions }
  ? { [K in keyof Q]: QueryValue<Q[K]> }
  : object;
type RequiredQueryKeys<D> = D extends { queryParams: infer Q extends QueryDefinitions }
  ? { [K in keyof Q]: Q[K] extends { required: true } ? K : never }[keyof Q]
  : never;
// What a link takes: every path value, any query fields (the required ones always), a fragment.
type LinkInput<P, Q, Required extends PropertyKey> = (keyof P extends never
  ? { path?: never }
  : { path: Simplify<P> }) &
  ([Required] extends [never]
    ? { query?: Partial<Simplify<Q>> }
    : { query: Partial<Simplify<Q>> & Pick<Simplify<Q>, Extract<Required, keyof Q>> }) & {
    fragment?: string | null;
  };
// The values can be left out only when the route has no path values and no required fields.
type LinkArgs<P, Q, Required extends PropertyKey> = keyof P extends never
  ? [Required] extends [never]
    ? [values?: LinkInput<P, Q, Required>]
    : [values: LinkInput<P, Q, Required>]
  : [values: LinkInput<P, Q, Required>];

export type RouteNode<P = unknown, Q = unknown, Required extends PropertyKey = never> = {
  createUrlTree(...args: LinkArgs<P, Q, Required>): UrlTree;
  navigate(...args: [...LinkArgs<P, Q, Required>, options?: NavigateOptions]): Promise<boolean>;
  readonly [routeNodeInfo]: unknown;
  /**
   * This route while it, or one of its children, is showing. Otherwise `null`. Read through what
   * it returns, so the read goes to the route you checked: `EPISODE.ifActive()?.params()`.
   */
  readonly ifActive: Signal<RouteNode<P, Q, Required> | null>;
  readonly params: Signal<UrlParamsState<P, Q>>;
  patchQuery(patch: Partial<Readonly<Q>>, options?: NavigateOptions): Promise<boolean>;
};

type AnyRouteNode = {
  readonly [routeNodeInfo]: unknown;
  readonly params: Signal<UrlParamsState<unknown, unknown>>;
  patchQuery(patch: never, options?: NavigateOptions): Promise<boolean>;
};

export type QueryParamsOf<N> = N extends { params: Signal<{ query: infer Q }> } ? Q : never;
export type PathParamsOf<N> = N extends RouteNode<infer P, infer _Q, infer _R> ? P : never;
export type RouteStateOf<N> = N extends { params: Signal<infer S> } ? S : never;
export type RouteQueryPatch<N> = Partial<Readonly<QueryParamsOf<N>>>;

// Let TypeScript infer each route object first, then check its nested fields.
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
type CodecValue<C> = C extends UrlParamCodec<infer T> ? T : string;
// Each key names a placeholder, and each value is a codec.
type PathConfig<Names extends string, Supplied> = [Names] extends [never]
  ? never
  : { readonly [K in keyof Supplied]: K extends Names ? UrlParamCodec<unknown> : never };
type OwnPath<D> = {
  [K in OwnPathNames<D>]: D extends { pathParam: infer P }
    ? K extends keyof P
      ? CodecValue<P[K]>
      : string
    : string;
};
type AccumulatedPath<D, Ancestor> = Simplify<Merge<Ancestor, OwnPath<D>>>;
type AccumulatedQuery<D, Ancestor> = Simplify<Merge<Ancestor, OwnQuery<D>>>;
type RouteKey = keyof Route | 'routeName' | 'pathParam' | 'queryParams';

// Checks one route where it's written: only known keys, a literal routeName, codecs only for real
// placeholders, and no query key a parent already declares.
type ContextualRoute<D, AncestorQuery> = {
  [K in keyof D]: K extends RouteKey
    ? K extends 'children'
      ? D[K] extends readonly unknown[]
        ? ContextualRouteArray<D[K], AccumulatedQuery<D, AncestorQuery>>
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
          ? PathConfig<OwnPathNames<D>, D[K]>
          : K extends 'queryParams'
            ? D[K] extends QueryDefinitions
              ? Record<Extract<keyof D[K], keyof AncestorQuery>, never>
              : never
            : K extends keyof Route
              ? Route[K]
              : never
    : never;
} & (D extends { matcher: unknown } ? { readonly path?: string } : { readonly path: string });

/** Type checks for a literal route array, applied to each route where it's written. */
export type ContextualRouteArray<R, AncestorQuery = object> = R extends readonly unknown[]
  ? number extends R['length']
    ? R extends readonly Route[]
      ? R
      : { readonly [K in keyof R]: ContextualRoute<R[K], AncestorQuery> }
    : { readonly [K in keyof R]: ContextualRoute<R[K], AncestorQuery> }
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
    : Readonly<Record<Name, CompiledRouteNode<D, AP, AQ, Required>>>
  : object;
// Walks the route tree and gives each named route its node, with every parent's values included.
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
type PathCodecs = Readonly<Record<string, UrlParamCodec<unknown>>>;
type GlobalValues<P extends PathCodecs, Q extends QueryDefinitions> = Readonly<{
  path: Readonly<{ [K in keyof P]: CodecValue<P[K]> | null }>;
  query: Readonly<{ [K in keyof Q]: QueryValue<Q[K]> }>;
}>;
type GlobalDefinitions<P extends PathCodecs, Q extends QueryDefinitions> = {
  readonly path?: P;
  readonly query?: Q;
};

/** What the `AppRouter` token gives you. `routes` has one entry per named route. */
export type GeneratedAppRouter<E extends Record<string, string>, R> = {
  readonly routes: {
    readonly [K in keyof E]: E[K] extends keyof NamedRoutes<R> ? NamedRoutes<R>[E[K]] : never;
  };
  /**
   * Reads path and query values on every page, with no route needing to be active. A path value
   * comes from whichever active route has a placeholder with that name, and is `null` when none
   * does or when it doesn't decode. Query fields work as on routes.
   */
  globalParams<
    const P extends PathCodecs = Record<never, never>,
    const Q extends QueryDefinitions = Record<never, never>,
  >(
    definitions: GlobalDefinitions<P, Q>,
  ): Signal<GlobalValues<P, Q>>;
  /** Reads like `globalParams()`, once, from a snapshot such as the one a guard or resolver gets. */
  globalParamsSnapshot<
    const P extends PathCodecs = Record<never, never>,
    const Q extends QueryDefinitions = Record<never, never>,
  >(
    definitions: GlobalDefinitions<P, Q>,
    snapshot: ActivatedRouteSnapshot,
  ): GlobalValues<P, Q>;
  /**
   * Reads a route's values once, from a snapshot such as the one a guard or resolver gets. Throws
   * if the snapshot doesn't contain the route.
   */
  paramsSnapshot<const N extends AnyRouteNode>(
    route: N,
    snapshot: ActivatedRouteSnapshot,
  ): RouteStateOf<N>;
  readonly escapeHatch: AppRouterEscapeHatch;
};
