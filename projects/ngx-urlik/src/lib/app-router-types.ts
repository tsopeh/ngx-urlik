import type { InjectionToken, Signal } from '@angular/core';
import type { ActivatedRouteSnapshot, Route, UrlTree } from '@angular/router';
import type {
  DefaultedQueryParamDefinition,
  OptionalQueryParamDefinition,
  UrlParamCodec,
} from './params';
import type { QueryDefinitions } from './route-definition';
import type { NavigateOptions, RouteParams } from './route-node';
import type { routeNodeInfo } from './route-symbols';
import type { AppRouterEscapeHatch } from './router-escape-hatch';
import type { Simplify } from './type-utils';

type Merge<A, B> = Omit<A, keyof B> & B;
// A field with a default reads as T. A field without one reads as T | null.
type QueryValue<D> =
  D extends DefaultedQueryParamDefinition<infer T, boolean>
    ? T
    : D extends OptionalQueryParamDefinition<infer T, boolean>
      ? T | null
      : never;
type OwnQuery<D> = D extends { queryParams: infer Q extends QueryDefinitions }
  ? { [K in keyof Q]: QueryValue<Q[K]> }
  : object;
type RequiredQueryKeys<D> = D extends { queryParams: infer Q extends QueryDefinitions }
  ? { [K in keyof Q]: Q[K] extends { required: true } ? K : never }[keyof Q]
  : never;
// Link input: every path parameter, any query parameters, every required one, and a fragment. A
// route without query parameters takes none, because a `Partial` of an empty type accepts any keys.
type LinkInput<P, Q, Required extends PropertyKey> = (keyof P extends never
  ? { path?: never }
  : { path: Simplify<P> }) &
  ([Required] extends [never]
    ? keyof Q extends never
      ? { query?: never }
      : { query?: Partial<Simplify<Q>> }
    : { query: Partial<Simplify<Q>> & Pick<Simplify<Q>, Extract<Required, keyof Q>> }) & {
    fragment?: string | null;
  };
// The input is optional only when the route has no path parameters and no required query ones.
type LinkArgs<P, Q, Required extends PropertyKey> = keyof P extends never
  ? [Required] extends [never]
    ? [values?: LinkInput<P, Q, Required>]
    : [values: LinkInput<P, Q, Required>]
  : [values: LinkInput<P, Q, Required>];
// ifActive() input: any path and query parameters. A route with no parameters of a kind takes none,
// because a `Partial` of an empty type would accept any keys.
type MatchInput<P, Q> = (keyof P extends never
  ? { path?: never }
  : { path?: Partial<Simplify<P>> }) &
  (keyof Q extends never ? { query?: never } : { query?: Partial<Simplify<Q>> });

export type RouteNode<P = unknown, Q = unknown, Required extends PropertyKey = never> = {
  createUrlTree(...args: LinkArgs<P, Q, Required>): UrlTree;
  navigate(...args: [...LinkArgs<P, Q, Required>, options?: NavigateOptions]): Promise<boolean>;
  readonly [routeNodeInfo]: unknown;
  /**
   * Returns this route when it or a route below it is showing and every passed value matches.
   * Returns `null` otherwise. An omitted field matches any value.
   *
   * It reads signals, so templates and `computed()` track it. Read through the returned route, so
   * the read goes to the route you checked: `EPISODE.ifActive()?.params()`.
   */
  readonly ifActive: (values?: MatchInput<P, Q>) => RouteNode<P, Q, Required> | null;
  readonly params: Signal<RouteParams<P, Q>>;
  patchQuery(patch: Partial<Readonly<Q>>, options?: NavigateOptions): Promise<boolean>;
};

type AnyRouteNode = {
  readonly [routeNodeInfo]: unknown;
  readonly params: Signal<RouteParams<unknown, unknown>>;
  patchQuery(patch: never, options?: NavigateOptions): Promise<boolean>;
};

export type QueryParamsOf<N> = N extends { params: Signal<{ query: infer Q }> } ? Q : never;
export type PathParamsOf<N> = N extends RouteNode<infer P, infer _Q, infer _R> ? P : never;
export type ParamsOf<N> = N extends { params: Signal<infer S> } ? S : never;
export type QueryPatchOf<N> = Partial<Readonly<QueryParamsOf<N>>>;
/** The type of `AppRouter.routes`, for naming route types outside an injection context. */
export type RoutesOf<Token> =
  Token extends InjectionToken<{ readonly routes: infer R }> ? R : never;

// Lets TypeScript infer each field's literal type, nested objects included, before the checks apply.
type InferDefinition<T> = {
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
// Keys must be placeholder names. Values must be codecs.
type PathConfig<Names extends string, Supplied> = [Names] extends [never]
  ? never
  : { readonly [K in keyof Supplied]: K extends Names ? UrlParamCodec<unknown> : never };
type OwnPath<D> = {
  [K in OwnPathNames<D>]: D extends { pathParams: infer P }
    ? K extends keyof P
      ? CodecValue<P[K]>
      : string
    : string;
};
type AccumulatedPath<D, Ancestor> = Simplify<Merge<Ancestor, OwnPath<D>>>;
type AccumulatedQuery<D, Ancestor> = Simplify<Merge<Ancestor, OwnQuery<D>>>;
type RouteKey = keyof Route | 'routeName' | 'pathParams' | 'queryParams';

// The type each route field must have. Unknown keys fail. `routeName` must be a literal.
// `pathParams` keys must be placeholders in the path. A query key can't repeat a parent's.
type FieldCheck<D, K extends keyof D, AncestorQuery> = K extends RouteKey
  ? K extends 'children'
    ? Exclude<D[K], undefined> extends readonly unknown[]
      ? unknown
      : never
    : K extends 'routeName'
      ? D extends { path: '**' } | { redirectTo: unknown }
        ? never
        : D[K] extends string
          ? string extends D[K]
            ? never
            : D[K]
          : never
      : K extends 'pathParams'
        ? PathConfig<OwnPathNames<D>, D[K]>
        : K extends 'queryParams'
          ? D[K] extends QueryDefinitions
            ? Record<Extract<keyof D[K], keyof AncestorQuery>, never>
            : never
          : K extends keyof Route
            ? Route[K]
            : never
  : never;

// A route needs a path unless it has a matcher. FieldCheck checks a path that is present.
type PathRequirement<D> = D extends { matcher: unknown }
  ? { readonly path?: string }
  : 'path' extends keyof D
    ? unknown
    : { readonly path: string };

// Infers one route from the literal and checks each field where it's written. The checks sit in
// NoInfer, so they never change what TypeScript infers.
type RouteInput<D, AncestorQuery> = {
  [K in keyof D]: K extends 'children'
    ? RouteArrayInput<D[K], AccumulatedQuery<D, AncestorQuery>> &
        NoInfer<FieldCheck<D, K, AncestorQuery>>
    : InferDefinition<D>[K] & NoInfer<FieldCheck<D, K, AncestorQuery>>;
} & NoInfer<PathRequirement<D>>;

/**
 * Infers a literal route array and checks each route where it's written. Every level is one
 * mapped type, so TypeScript compares a route array element by element.
 */
export type RouteArrayInput<R, AncestorQuery = object> = {
  readonly [K in keyof R]: RouteInput<R[K], AncestorQuery>;
};

type CompiledRouteNode<D, AP, AQ, Required extends PropertyKey> = RouteNode<
  AccumulatedPath<D, AP>,
  AccumulatedQuery<D, AQ>,
  Required | RequiredQueryKeys<D>
>;
type Entry<Name extends string, Node> = { readonly name: Name; readonly node: Node };
type NamedEntry<D, AP, AQ, Required extends PropertyKey> = D extends {
  path: string;
  routeName: infer Name extends string;
}
  ? D extends { path: '**' } | { redirectTo: unknown }
    ? never
    : Entry<Name, CompiledRouteNode<D, AP, AQ, Required>>
  : never;
type ChildEntries<D, AP, AQ, Required extends PropertyKey> = D extends {
  children: infer Children extends readonly unknown[];
}
  ? RouteEntries<
      Children,
      AccumulatedPath<D, AP>,
      AccumulatedQuery<D, AQ>,
      Required | RequiredQueryKeys<D>
    >
  : never;
// One entry per named route, with every parent's values. It maps over each array instead of
// recursing through siblings, so recursion depth equals nesting depth.
type RouteEntries<
  R extends readonly unknown[],
  AP = object,
  AQ = object,
  Required extends PropertyKey = never,
> = {
  [I in keyof R]: NamedEntry<R[I], AP, AQ, Required> | ChildEntries<R[I], AP, AQ, Required>;
}[number];
type NamedRoutes<R> = R extends readonly unknown[]
  ? { readonly [E in RouteEntries<R> as E['name']]: E['node'] }
  : never;
type PathCodecs = Readonly<Record<string, UrlParamCodec<unknown>>>;
type GlobalValues<P extends PathCodecs, Q extends QueryDefinitions> = Readonly<{
  path: Readonly<{ [K in keyof P]: CodecValue<P[K]> | null }>;
  query: Readonly<{ [K in keyof Q]: QueryValue<Q[K]> }>;
}>;
type GlobalDefinitions<P extends PathCodecs, Q extends QueryDefinitions> = {
  readonly path?: P;
  readonly query?: Q;
};

/** The value of the `AppRouter` token. `routes` has one entry per named route. */
export type TypedAppRouter<E extends Record<string, string>, R> = {
  readonly routes: {
    readonly [K in keyof E]: E[K] extends keyof NamedRoutes<R> ? NamedRoutes<R>[E[K]] : never;
  };
  /**
   * Reads path and query parameters on any page. No route has to be active. A path parameter comes
   * from the active route with a placeholder of that name. It is `null` when no active route has
   * one or the codec can't read it. Query parameters read as they do on routes.
   */
  globalParams<
    const P extends PathCodecs = Record<never, never>,
    const Q extends QueryDefinitions = Record<never, never>,
  >(
    definitions: GlobalDefinitions<P, Q>,
  ): Signal<GlobalValues<P, Q>>;
  /** Like `globalParams()`, but reads once from a snapshot, such as a guard's or a resolver's. */
  globalParamsSnapshot<
    const P extends PathCodecs = Record<never, never>,
    const Q extends QueryDefinitions = Record<never, never>,
  >(
    definitions: GlobalDefinitions<P, Q>,
    snapshot: ActivatedRouteSnapshot,
  ): GlobalValues<P, Q>;
  /**
   * Reads a route's values once from a snapshot, such as a guard's or a resolver's. Throws if the
   * route isn't in the snapshot.
   */
  paramsSnapshot<const N extends AnyRouteNode>(
    route: N,
    snapshot: ActivatedRouteSnapshot,
  ): ParamsOf<N>;
  readonly escapeHatch: AppRouterEscapeHatch;
};
