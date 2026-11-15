import type { InjectionToken, Signal } from '@angular/core';
import type { ActivatedRouteSnapshot, Route, UrlTree } from '@angular/router';
import type { QueryParamDefinition, UrlParamCodec } from './params';
import type { QueryDefinitions } from './route-definition';
import type { NavigateOptions, RouteParams } from './route-node';
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
/** The routes of an `AppRouter` token, for naming a route's types outside an injection context. */
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
// Each key names a placeholder, and each value is a codec.
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

// What a field must be: only known keys, a literal routeName, codecs only for real placeholders,
// and no query key a parent already declares.
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

// A route needs a path unless it has a matcher. A path that's there is checked as a field.
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
// One entry per named route, with every parent's values included. It maps over each array instead
// of walking it one route at a time, so the recursion only goes as deep as the routes nest.
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

/** What the `AppRouter` token gives you. `routes` has one entry per named route. */
export type TypedAppRouter<E extends Record<string, string>, R> = {
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
  ): ParamsOf<N>;
  readonly escapeHatch: AppRouterEscapeHatch;
};
