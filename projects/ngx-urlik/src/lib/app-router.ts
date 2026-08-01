import {
  EnvironmentInjector,
  EnvironmentProviders,
  InjectionToken,
  Provider,
  Signal,
  computed,
  inject,
  makeEnvironmentProviders,
  runInInjectionContext,
  signal,
} from '@angular/core';
import {
  ActivatedRouteSnapshot,
  NavigationBehaviorOptions,
  NavigationEnd,
  ParamMap,
  Route,
  Router,
  RouterConfigOptions,
  RouterConfigurationFeature,
  RouterFeatures,
  Routes,
  UrlTree,
  provideRouter,
  withRouterConfig,
} from '@angular/router';
import { filter } from 'rxjs';
import { isEqual as defaultIsEqual } from './is-equal';
import { UrlParamSerializer } from './params';
import type { pathParam, queryParam } from './params';

type PathParamDefinition<T, Name extends string = string> = ReturnType<typeof pathParam<T, Name>>;
type QueryParamDefinition<T, Required extends boolean = false> = ReturnType<
  typeof queryParam<T, Required>
>;
type ParamValue<D> = D extends
  PathParamDefinition<infer T, string> | QueryParamDefinition<infer T, boolean>
  ? T
  : never;

type ForwardedRouterFeature = Exclude<RouterFeatures, RouterConfigurationFeature>;

type AnyRecord = Readonly<Record<string, unknown>>;
type QueryDefinitions = Readonly<Record<string, QueryParamDefinition<unknown, boolean>>>;
type Merge<A, B> = Omit<A, keyof B> & B;
type Simplify<T> = { [K in keyof T]: T[K] };
type OwnPath<D> = D extends { pathParam: PathParamDefinition<infer T, infer N> }
  ? Record<N, Exclude<T, null>>
  : object;
type OwnQuery<D> = D extends { queryParams: infer Q extends QueryDefinitions }
  ? { [K in keyof Q]: ParamValue<Q[K]> }
  : object;
type RequiredQueryKeys<D> = D extends { queryParams: infer Q extends QueryDefinitions }
  ? { [K in keyof Q]: Q[K] extends QueryParamDefinition<unknown, true> ? K : never }[keyof Q]
  : never;
type State<P, Q> = Readonly<{ path: Readonly<Simplify<P>>; query: Readonly<Simplify<Q>> }>;

export interface UrlParamsRef<P, Q> {
  readonly value: Signal<State<P, Q>>;
  updateQueryParams(
    updater: (previous: Readonly<Simplify<Q>>) => Simplify<Q>,
    options?: { replaceUrl?: boolean },
  ): Promise<boolean>;
}

type ConstructionArgs<P, Q, Required extends PropertyKey> = (keyof P extends never
  ? { path?: never }
  : { path: Simplify<P> }) &
  ([Required] extends [never]
    ? { query?: Partial<Simplify<Q>> }
    : { query: Partial<Simplify<Q>> & Pick<Simplify<Q>, Extract<Required, keyof Q>> });
type MethodArgs<P, Q, Required extends PropertyKey> = keyof P extends never
  ? [Required] extends [never]
    ? [values?: ConstructionArgs<P, Q, Required>]
    : [values: ConstructionArgs<P, Q, Required>]
  : [values: ConstructionArgs<P, Q, Required>];

type BaseNode<P, Q, Required extends PropertyKey> = {
  createUrlTree(...args: MethodArgs<P, Q, Required>): UrlTree;
  navigate(
    ...args: [...MethodArgs<P, Q, Required>, options?: NavigationBehaviorOptions]
  ): Promise<boolean>;
};
type StatefulNode<P, Q> = {
  urlParams(options?: {
    isEqual?: (a: State<P, Q>, b: State<P, Q>) => boolean;
  }): UrlParamsRef<P, Q>;
};

const fallbackBrand: unique symbol = Symbol('ngx-urlik fallback route');
const routeConfigBrand: unique symbol = Symbol('ngx-urlik route config identity');
interface FallbackDefinition {
  readonly [fallbackBrand]: true;
  readonly queryParams?: QueryDefinitions;
  readonly component?: Route['component'];
  readonly loadComponent?: Route['loadComponent'];
  readonly canMatch?: Route['canMatch'];
  readonly canActivate?: Route['canActivate'];
  readonly canActivateChild?: Route['canActivateChild'];
  readonly canDeactivate?: Route['canDeactivate'];
  readonly resolve?: Route['resolve'];
  readonly data?: Route['data'];
  readonly title?: Route['title'];
  readonly providers?: Route['providers'];
  readonly runGuardsAndResolvers?: Route['runGuardsAndResolvers'];
  readonly isEqual?: (a: unknown, b: unknown) => boolean;
}

type FallbackInput = Omit<FallbackDefinition, typeof fallbackBrand>;

export function fallbackRoute<const D extends FallbackInput>(
  definition: D & Record<Exclude<keyof D, keyof FallbackInput>, never>,
): D & FallbackDefinition {
  return Object.freeze({ ...definition, [fallbackBrand]: true }) as D & FallbackDefinition;
}

interface OrdinaryRouteDefinition {
  readonly path: string;
  readonly pathParam?: PathParamDefinition<unknown>;
  readonly queryParams?: QueryDefinitions;
  readonly children?: Readonly<Record<string, RouteDefinition>>;
  readonly component?: Route['component'];
  readonly loadComponent?: Route['loadComponent'];
  readonly canMatch?: Route['canMatch'];
  readonly canActivate?: Route['canActivate'];
  readonly canActivateChild?: Route['canActivateChild'];
  readonly canDeactivate?: Route['canDeactivate'];
  readonly resolve?: Route['resolve'];
  readonly data?: Route['data'];
  readonly title?: Route['title'];
  readonly providers?: Route['providers'];
  readonly runGuardsAndResolvers?: Route['runGuardsAndResolvers'];
  readonly isEqual?: (a: unknown, b: unknown) => boolean;
  readonly redirectTo?: (values: any) => UrlTree;
}
type RouteDefinition = OrdinaryRouteDefinition | FallbackDefinition;

type OrdinaryKey = keyof OrdinaryRouteDefinition;
type RedirectKey =
  'path' | 'pathParam' | 'queryParams' | 'redirectTo' | 'canMatch' | 'providers' | 'data';
type FallbackKey = keyof FallbackDefinition;
type ContextualRoute<D, AP, AQ> =
  Simplify<Merge<AP, OwnPath<D>>> extends infer P
    ? Simplify<Merge<AQ, OwnQuery<D>>> extends infer Q
      ? D &
          Record<
            Exclude<
              keyof D,
              D extends FallbackDefinition
                ? FallbackKey
                : D extends { redirectTo: (...args: never[]) => unknown }
                  ? RedirectKey
                  : OrdinaryKey
            >,
            never
          > &
          (D extends FallbackDefinition
            ? object
            : {
                readonly redirectTo?: (values: State<P, Q>) => UrlTree;
                readonly children?: D extends { children: infer C }
                  ? ContextualRoutes<C, P, Q>
                  : never;
              })
      : never
    : never;
type ReservedIdentity = 'navigate' | 'createUrlTree' | 'urlParams';
type ContextualRoutes<R, AP = object, AQ = object> =
  R extends Readonly<Record<string, unknown>>
    ? {
        readonly [K in keyof R]: K extends ReservedIdentity ? never : ContextualRoute<R[K], AP, AQ>;
      }
    : never;

type ChildrenOf<D> = D extends { children: infer C extends Readonly<Record<string, unknown>> }
  ? C
  : object;
type IsFallback<D> = D extends FallbackDefinition ? true : false;
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

interface RuntimeParam {
  name: string;
  serializer: UrlParamSerializer<unknown>;
  owner: CompiledRoute;
}
interface CompiledRoute {
  identity: string;
  definition: RouteDefinition;
  angular?: Route;
  parent?: CompiledRoute;
  pathParams: RuntimeParam[];
  queryParams: RuntimeParam[];
  pattern: string;
  fallback: boolean;
  redirect: boolean;
  comparator: (a: unknown, b: unknown) => boolean;
  children: CompiledRoute[];
}

const ordinaryKeys = new Set([
  'path',
  'pathParam',
  'queryParams',
  'children',
  'component',
  'loadComponent',
  'canMatch',
  'canActivate',
  'canActivateChild',
  'canDeactivate',
  'resolve',
  'data',
  'title',
  'providers',
  'runGuardsAndResolvers',
  'isEqual',
  'redirectTo',
]);
const redirectKeys = new Set([
  'path',
  'pathParam',
  'queryParams',
  'redirectTo',
  'canMatch',
  'providers',
  'data',
]);
const fallbackKeys = new Set([
  'queryParams',
  'component',
  'loadComponent',
  'canMatch',
  'canActivate',
  'canActivateChild',
  'canDeactivate',
  'resolve',
  'data',
  'title',
  'providers',
  'runGuardsAndResolvers',
  'isEqual',
]);
const forbiddenPath = /[\/:?#;()*]/;

function validate(routes: Readonly<Record<string, RouteDefinition>>): string[] {
  const errors: string[] = [];
  if (Object.keys(routes).length !== 1)
    errors.push('routes must contain exactly one named root route');
  const visit = (
    siblings: Readonly<Record<string, RouteDefinition>>,
    ancestry: Set<string>,
    location: string,
    root: boolean,
  ) => {
    const patterns = new Map<string, string>();
    let fallbackSeen = false;
    for (const [identity, definition] of Object.entries(siblings)) {
      const at = location ? `${location}.${identity}` : identity;
      if (!identity) errors.push(`${at}: route identity must be non-empty`);
      if (['navigate', 'createUrlTree', 'urlParams'].includes(identity))
        errors.push(`${at}: '${identity}' is a reserved router method name`);
      const fallback = fallbackBrand in definition;
      const redirect = 'redirectTo' in definition;
      if (root && fallback) errors.push(`${at}: the root route cannot be a fallback`);
      const allowed = fallback ? fallbackKeys : redirect ? redirectKeys : ordinaryKeys;
      for (const key of Object.keys(definition))
        if (!allowed.has(key) && key !== String(fallbackBrand))
          errors.push(`${at}: unknown route property '${key}'`);
      if (fallback) {
        if (fallbackSeen)
          errors.push(`${at}: only one fallback route is allowed per sibling branch`);
        fallbackSeen = true;
      } else if (fallbackSeen) errors.push(`${at}: fallback routes must be declared last`);
      if (!fallback) {
        const path = definition.path;
        if (typeof path !== 'string' || (!root && path === '') || forbiddenPath.test(path))
          errors.push(`${at}: path must be ${root ? 'empty or ' : ''}one valid static segment`);
        const pattern = `${path}${definition.pathParam ? '/:param' : ''}`;
        const previous = patterns.get(pattern);
        if (previous)
          errors.push(`${at}: duplicates sibling URL pattern '${pattern}' from ${previous}`);
        else patterns.set(pattern, at);
      }
      if (
        'component' in definition &&
        definition.component &&
        'loadComponent' in definition &&
        definition.loadComponent
      )
        errors.push(`${at}: component and loadComponent are mutually exclusive`);
      const names = new Set(ancestry);
      if (!fallback && definition.pathParam) {
        if (!definition.pathParam.name) errors.push(`${at}: path parameter name must be non-empty`);
        if (names.has(definition.pathParam.name))
          errors.push(
            `${at}: parameter '${definition.pathParam.name}' shadows an ancestor parameter`,
          );
        names.add(definition.pathParam.name);
      }
      for (const name of Object.keys(definition.queryParams ?? {})) {
        if (names.has(name))
          errors.push(
            `${at}: parameter '${name}' shadows another path or query parameter in this ancestry`,
          );
        names.add(name);
      }
      if (!fallback && definition.children) visit(definition.children, names, at, false);
    }
  };
  visit(routes, new Set(), '', true);
  return errors;
}

function angularFields(definition: RouteDefinition): Route {
  const route: Route = {};
  for (const key of [
    'component',
    'loadComponent',
    'canMatch',
    'canActivate',
    'canActivateChild',
    'canDeactivate',
    'resolve',
    'data',
    'title',
    'providers',
    'runGuardsAndResolvers',
  ] as const) {
    const value = definition[key as keyof typeof definition];
    if (value !== undefined) (route as Record<string, unknown>)[key] = value;
  }
  return route;
}

function findActive(root: ActivatedRouteSnapshot, target: Route): ActivatedRouteSnapshot | null {
  if (
    root.routeConfig === target ||
    (root.routeConfig as Record<PropertyKey, unknown> | null)?.[routeConfigBrand] ===
      (target as Record<PropertyKey, unknown>)[routeConfigBrand]
  )
    return root;
  for (const child of root.children) {
    if (child.outlet !== 'primary') continue;
    const found = findActive(child, target);
    if (found) return found;
  }
  return null;
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function freezeRouteDefinitions(routes: Readonly<Record<string, RouteDefinition>>): void {
  for (const definition of Object.values(routes)) {
    if (definition.queryParams) Object.freeze(definition.queryParams);
    if (!('redirectTo' in definition) && 'children' in definition && definition.children) {
      freezeRouteDefinitions(definition.children);
      Object.freeze(definition.children);
    }
    Object.freeze(definition);
  }
  Object.freeze(routes);
}

export function defineAppRouter<
  const R extends Readonly<Record<string, RouteDefinition>>,
>(options: {
  routes: R & ContextualRoutes<R>;
  routerConfig?: Omit<RouterConfigOptions, 'paramsInheritanceStrategy'>;
}): {
  AppRouter: InjectionToken<RouterTree<R>>;
  provideAppRouter: (...features: ForwardedRouterFeature[]) => EnvironmentProviders;
} {
  freezeRouteDefinitions(options.routes);
  const errors = validate(options.routes);
  if (errors.length) throw new Error(`Invalid app router definition:\n- ${errors.join('\n- ')}`);
  let token!: InjectionToken<RouterTree<R>>;
  const roots: CompiledRoute[] = [];

  const compile = (
    definitions: Readonly<Record<string, RouteDefinition>>,
    parent?: CompiledRoute,
  ): Routes => {
    const compiled: Route[] = [];
    const ordered = Object.entries(definitions).sort(
      ([, a], [, b]) => Number(fallbackBrand in a) - Number(fallbackBrand in b),
    );
    for (const [identity, definition] of ordered) {
      const fallback = fallbackBrand in definition;
      const redirect = 'redirectTo' in definition;
      const ownPath =
        !fallback && definition.pathParam
          ? [
              {
                name: definition.pathParam.name,
                serializer: definition.pathParam.serializer,
              } as RuntimeParam,
            ]
          : [];
      const ownQuery = Object.entries(definition.queryParams ?? {}).map(
        ([name, param]) => ({ name, serializer: param.serializer }) as RuntimeParam,
      );
      const info: CompiledRoute = {
        identity,
        definition,
        parent,
        pathParams: [...(parent?.pathParams ?? []), ...ownPath],
        queryParams: [...(parent?.queryParams ?? []), ...ownQuery],
        pattern: [
          ...(parent ? [parent.pattern] : []),
          fallback
            ? '**'
            : definition.path + (definition.pathParam ? `/:${definition.pathParam.name}` : ''),
        ]
          .filter(Boolean)
          .join('/'),
        fallback,
        redirect,
        comparator:
          (definition.isEqual as (a: unknown, b: unknown) => boolean) ??
          parent?.comparator ??
          defaultIsEqual,
        children: [],
      };
      ownPath.forEach((param) => (param.owner = info));
      ownQuery.forEach((param) => (param.owner = info));
      if (parent) parent.children.push(info);
      else roots.push(info);
      const route = angularFields(definition);
      (route as Record<PropertyKey, unknown>)[routeConfigBrand] = info;
      route.path = fallback
        ? '**'
        : definition.path + (definition.pathParam ? `/:${definition.pathParam.name}` : '');
      info.angular = route;
      if (redirect) {
        route.pathMatch = 'full';
        route.redirectTo = (snapshot) => {
          const injector = inject(EnvironmentInjector);
          const state = readState(info, snapshot.paramMap, snapshot.queryParamMap, injector);
          const result = definition.redirectTo!(state);
          if (!(result instanceof UrlTree))
            throw new Error(`${info.pattern}: redirectTo must synchronously return a UrlTree`);
          return result;
        };
      } else if (!fallback && definition.children)
        route.children = compile(definition.children, info);
      else if (!fallback && !definition.component && !definition.loadComponent) route.children = [];
      compiled.push(route);
    }
    return compiled;
  };
  const routes = compile(options.routes);

  function deserialize(param: RuntimeParam, raw: unknown, injector: EnvironmentInjector): unknown {
    try {
      return runInInjectionContext(injector, () => param.serializer.deserialize(raw));
    } catch (error) {
      throw new Error(`${param.owner.identity}: failed to deserialize parameter '${param.name}'`, {
        cause: error,
      });
    }
  }
  function readState(
    info: CompiledRoute,
    params: ParamMap,
    query: ParamMap,
    injector: EnvironmentInjector,
  ): State<AnyRecord, AnyRecord> {
    const path: Record<string, unknown> = {};
    for (const param of info.pathParams) {
      const raw = params.get(param.name);
      const value = deserialize(param, raw, injector);
      if (raw === null || value === null || value === undefined)
        throw new Error(
          `${info.identity}: expected active route '${info.pattern}', attempted path could not resolve '${param.name}'`,
        );
      path[param.name] = value;
    }
    const queryState: Record<string, unknown> = {};
    for (const param of info.queryParams)
      queryState[param.name] = deserialize(param, query.get(param.name), injector);
    return freezeDeep({ path, query: queryState });
  }

  function factory(): RouterTree<R> {
    const router = inject(Router);
    const injector = inject(EnvironmentInjector);
    const navigation = signal(0);
    router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => navigation.update((value) => value + 1));
    const makeNode = (info: CompiledRoute): Record<string, unknown> => {
      const node: Record<string, unknown> = {};
      const serialize = (param: RuntimeParam, value: unknown) =>
        runInInjectionContext(injector, () => param.serializer.serialize(value));
      if (!info.fallback) {
        node['createUrlTree'] = (values: { path?: AnyRecord; query?: AnyRecord } = {}) => {
          const chain: CompiledRoute[] = [];
          for (let current: CompiledRoute | undefined = info; current; current = current.parent)
            chain.unshift(current);
          const commands: unknown[] = ['/'];
          for (const part of chain) {
            const definition = part.definition as OrdinaryRouteDefinition;
            if (definition.path) commands.push(definition.path);
            if (definition.pathParam) {
              const value = values.path?.[definition.pathParam.name];
              const output = serialize(
                part.pathParams.find((param) => param.owner === part)!,
                value,
              );
              if (output === null || output === '')
                throw new Error(
                  `${part.identity}: path parameter '${definition.pathParam.name}' cannot serialize to an empty segment`,
                );
              commands.push(output);
            }
          }
          const queryParams: Record<string, string> = {};
          for (const param of info.queryParams) {
            if (!(param.name in (values.query ?? {}))) continue;
            const output = serialize(param, values.query?.[param.name]);
            if (output !== null) queryParams[param.name] = output;
          }
          return router.createUrlTree(commands, { queryParams });
        };
        node['navigate'] = (
          values?: { path?: AnyRecord; query?: AnyRecord },
          navigationOptions?: NavigationBehaviorOptions,
        ) =>
          router.navigateByUrl(
            (node['createUrlTree'] as (value?: unknown) => UrlTree)(values),
            navigationOptions,
          );
      }
      if (!info.redirect) {
        let stable: UrlParamsRef<AnyRecord, AnyRecord> | undefined;
        node['urlParams'] = (urlOptions?: {
          isEqual?: (a: State<AnyRecord, AnyRecord>, b: State<AnyRecord, AnyRecord>) => boolean;
        }) => {
          if (!urlOptions && stable) return stable;
          const value = computed(
            () => {
              navigation();
              const active = findActive(router.routerState.snapshot.root, info.angular!);
              if (!active)
                throw new Error(
                  `${info.identity}: expected active route '${info.pattern}', but the current primary route is inactive`,
                );
              return readState(info, active.paramMap, active.queryParamMap, injector);
            },
            { equal: urlOptions?.isEqual ?? (info.comparator as never) },
          );
          const ref: UrlParamsRef<AnyRecord, AnyRecord> = {
            value,
            updateQueryParams: (updater, updateOptions) => {
              const previous = value().query;
              const next = updater(previous);
              const tree = router.parseUrl(router.url);
              for (const param of info.queryParams) {
                const output = serialize(param, next[param.name]);
                if (output === null) delete tree.queryParams[param.name];
                else tree.queryParams[param.name] = output;
              }
              return router.navigateByUrl(tree, { replaceUrl: updateOptions?.replaceUrl });
            },
          };
          if (!urlOptions) stable = ref;
          return ref;
        };
      }
      for (const child of info.children) node[child.identity] = makeNode(child);
      return freezeDeep(node);
    };
    const tree: Record<string, unknown> = {};
    for (const root of roots) tree[root.identity] = makeNode(root);
    return freezeDeep(tree) as RouterTree<R>;
  }

  token = new InjectionToken<RouterTree<R>>('AppRouter');
  const provideAppRouter = (...features: ForwardedRouterFeature[]): EnvironmentProviders => {
    if (features.some((feature) => (feature.ɵkind as number) === 5))
      throw new Error(
        'withRouterConfig() is not accepted by provideAppRouter(); use defineAppRouter({ routerConfig })',
      );
    const tokenProvider: Provider = { provide: token, useFactory: factory };
    return makeEnvironmentProviders([
      provideRouter(
        routes,
        withRouterConfig({ ...options.routerConfig, paramsInheritanceStrategy: 'always' }),
        ...features,
      ),
      tokenProvider,
    ]);
  };
  return Object.freeze({ AppRouter: token, provideAppRouter });
}
