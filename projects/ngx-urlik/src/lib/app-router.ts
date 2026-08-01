import {
  EnvironmentProviders,
  EnvironmentInjector,
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
import {
  AnyQueryParamDefinition,
  ArrayQueryParamDefinition,
  DefaultValue,
  PathParamDefinition,
  QueryParamDefinition,
  UrlParamCodec,
} from './params';

type ForwardedRouterFeature = Exclude<RouterFeatures, RouterConfigurationFeature>;
type AnyRecord = Readonly<Record<string, unknown>>;
type QueryDefinitions = Readonly<Record<string, AnyQueryParamDefinition>>;
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
  createUrlTree(...args: MethodArgs<P, Q, Required>): UrlTree | null;
  navigate(
    ...args: [...MethodArgs<P, Q, Required>, options?: NavigationBehaviorOptions]
  ): Promise<boolean>;
};
type StatefulNode<P, Q> = {
  urlParams(options?: { isEqual?: UrlStateEquality<P, Q> }): UrlParamsRef<P, Q>;
};

const routeConfigBrand: unique symbol = Symbol('ngx-urlik route config identity');

const angularRouteFields = [
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
] as const satisfies readonly (keyof Route)[];
const redirectAngularFields = [
  'canMatch',
  'providers',
  'data',
] as const satisfies readonly (keyof Route)[];

export type AngularRouteOptions = Pick<Route, (typeof angularRouteFields)[number]>;
export type AngularRedirectOptions = Pick<Route, (typeof redirectAngularFields)[number]>;

interface OrdinaryRouteDefinition {
  readonly path: string;
  readonly pathParam?: PathParamDefinition<unknown>;
  readonly queryParams?: QueryDefinitions;
  readonly children?: Readonly<Record<string, RouteDefinition>>;
  readonly angular?: AngularRouteOptions;
  readonly isEqual?: (a: unknown, b: unknown) => boolean;
  readonly redirectTo?: (values: any) => UrlTree;
}
type RouteDefinition = OrdinaryRouteDefinition;

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

export type AppRouterDiagnosticCode =
  | 'PARAM_DESERIALIZE_FAILED'
  | 'PARAM_SERIALIZE_FAILED'
  | 'PARAM_CODEC_THROWN'
  | 'INVALID_ARRAY_REPRESENTATION';

export interface AppRouterDiagnostic {
  readonly code: AppRouterDiagnosticCode;
  readonly message: string;
  readonly route: string;
  readonly parameter: string;
  readonly operation: 'serialize' | 'deserialize';
  readonly index?: number;
  readonly cause?: unknown;
}

export interface AppRouterDiagnostics {
  warn(diagnostic: AppRouterDiagnostic): void;
}

interface RuntimeParam {
  name: string;
  definition: PathParamDefinition<unknown> | AnyQueryParamDefinition;
  owner: CompiledRoute;
}
interface CompiledRoute {
  identity: string;
  definition: RouteDefinition;
  angular: Route;
  parent?: CompiledRoute;
  ownPath?: RuntimeParam;
  pathParams: RuntimeParam[];
  queryParams: RuntimeParam[];
  pattern: string;
  fallback: boolean;
  redirect: boolean;
  comparator: (a: unknown, b: unknown) => boolean;
  children: CompiledRoute[];
}

const forbiddenPath = /[\/:?#;()]/;
const encodedOutputCharacter = /^[A-Za-z0-9\-_.!~*'()%]$/;

function validate(routes: Readonly<Record<string, RouteDefinition>>): string[] {
  const errors: string[] = [];
  if (routes === null || typeof routes !== 'object' || Array.isArray(routes)) {
    return ['routes: route collection must be a non-null object'];
  }
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
      if (definition === null || typeof definition !== 'object' || Array.isArray(definition)) {
        errors.push(`${at}: route definition must be a non-null object`);
        continue;
      }
      const fallback = definition.path === '**';
      const hasRedirect = 'redirectTo' in definition;
      const redirect = hasRedirect && typeof definition.redirectTo === 'function';
      if (hasRedirect && !redirect) errors.push(`${at}: redirectTo must be a function`);
      if (root && fallback) errors.push(`${at}: the root route cannot be a fallback`);
      const allowed = new Set(
        fallback
          ? ['path', 'queryParams', 'angular', 'isEqual']
          : redirect
            ? ['path', 'pathParam', 'queryParams', 'redirectTo', 'angular']
            : ['path', 'pathParam', 'queryParams', 'children', 'angular', 'isEqual'],
      );
      for (const key of Object.keys(definition))
        if (!allowed.has(key)) errors.push(`${at}: unknown route property '${key}'`);
      if (fallback) {
        if (fallbackSeen)
          errors.push(`${at}: only one fallback route is allowed per sibling branch`);
        fallbackSeen = true;
      } else if (fallbackSeen) errors.push(`${at}: fallback routes must be declared last`);
      if (!fallback) {
        const path = definition.path;
        if (
          typeof path !== 'string' ||
          (!root && path === '') ||
          path === '**' ||
          forbiddenPath.test(path)
        )
          errors.push(`${at}: path must be ${root ? 'empty or ' : ''}one valid static segment`);
        const pattern = `${path}${definition.pathParam ? '/:param' : ''}`;
        const previous = patterns.get(pattern);
        if (previous)
          errors.push(`${at}: duplicates sibling URL pattern '${pattern}' from ${previous}`);
        else patterns.set(pattern, at);
      }
      const angular = definition.angular;
      if (
        angular !== undefined &&
        (angular === null || typeof angular !== 'object' || Array.isArray(angular))
      )
        errors.push(`${at}.angular: Angular options must be a non-null object`);
      else if (angular) {
        const allowedAngular = new Set<string>(
          redirect ? redirectAngularFields : angularRouteFields,
        );
        for (const key of Object.keys(angular))
          if (!allowedAngular.has(key))
            errors.push(`${at}.angular: unknown Angular route property '${key}'`);
        if (angular.component && angular.loadComponent)
          errors.push(`${at}.angular: component and loadComponent are mutually exclusive`);
      }
      const names = new Set(ancestry);
      if (!fallback && definition.pathParam) {
        if (!definition.pathParam.name) errors.push(`${at}: path parameter name must be non-empty`);
        if (names.has(definition.pathParam.name))
          errors.push(
            `${at}: parameter '${definition.pathParam.name}' shadows an ancestor parameter`,
          );
        names.add(definition.pathParam.name);
      }
      for (const [name, param] of Object.entries(definition.queryParams ?? {})) {
        if (names.has(name))
          errors.push(
            `${at}: parameter '${name}' shadows another path or query parameter in this ancestry`,
          );
        names.add(name);
        if (param.mode === 'delimited') {
          const separator = param.separator ?? '';
          if (Array.from(separator).length !== 1 || encodedOutputCharacter.test(separator))
            errors.push(
              `${at}: query parameter '${name}' separator must be one character escaped by encodeURIComponent`,
            );
        }
      }
      if (!fallback && !redirect && definition.children) {
        if (
          typeof definition.children !== 'object' ||
          definition.children === null ||
          Array.isArray(definition.children)
        )
          errors.push(`${at}.children: route collection must be a non-null object`);
        else visit(definition.children, names, at, false);
      }
    }
  };
  visit(routes, new Set(), '', true);
  return errors;
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

function resolveDefault<T>(value: DefaultValue<T> | undefined): T | undefined {
  return typeof value === 'function' ? (value as () => T)() : value;
}

export function defineAppRouter<
  const R extends Readonly<Record<string, RouteDefinition>>,
>(options: {
  routes: R & ContextualRoutes<R>;
  routerConfig?: Omit<RouterConfigOptions, 'paramsInheritanceStrategy'>;
  diagnostics?: AppRouterDiagnostics;
}): {
  AppRouter: InjectionToken<RouterTree<R>>;
  provideAppRouter: (...features: ForwardedRouterFeature[]) => EnvironmentProviders;
} {
  const errors = validate(options.routes);
  if (errors.length) throw new Error(`Invalid app router definition:\n- ${errors.join('\n- ')}`);
  let token!: InjectionToken<RouterTree<R>>;
  const roots: CompiledRoute[] = [];
  const warn =
    options.diagnostics?.warn ??
    ((diagnostic: AppRouterDiagnostic) => console.warn(diagnostic.message));
  const report = (partial: Omit<AppRouterDiagnostic, 'message'>, detail: string) => {
    const index = partial.index === undefined ? '' : ` at index ${partial.index}`;
    const runtime = [...roots]
      .flatMap(function walk(route): CompiledRoute[] {
        return [route, ...route.children.flatMap(walk)];
      })
      .find((route) =>
        [...route.pathParams, ...route.queryParams].some(
          (param) => param.name === partial.parameter && param.owner.identity === partial.route,
        ),
      );
    const placement = runtime?.pathParams.some(
      (param) => param.name === partial.parameter && param.owner.identity === partial.route,
    )
      ? 'path'
      : 'query';
    warn({
      ...partial,
      message: `${partial.route}: ${partial.operation} ${placement} parameter '${partial.parameter}'${index} ${detail}`,
    });
  };

  const compile = (
    definitions: Readonly<Record<string, RouteDefinition>>,
    parent?: CompiledRoute,
  ): Routes => {
    const compiled: Route[] = [];
    for (const [identity, definition] of Object.entries(definitions)) {
      const fallback = definition.path === '**';
      const redirect = typeof definition.redirectTo === 'function';
      const info = {
        identity,
        definition,
        parent,
        angular: { ...(definition.angular ?? {}) },
        pathParams: [...(parent?.pathParams ?? [])],
        queryParams: [...(parent?.queryParams ?? [])],
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
        comparator: definition.isEqual ?? parent?.comparator ?? defaultIsEqual,
        children: [],
      } as CompiledRoute;
      if (!fallback && definition.pathParam) {
        info.ownPath = {
          name: definition.pathParam.name,
          definition: definition.pathParam,
          owner: info,
        };
        info.pathParams.push(info.ownPath);
      }
      for (const [name, param] of Object.entries(definition.queryParams ?? {}))
        info.queryParams.push({ name, definition: param, owner: info });
      if (parent) parent.children.push(info);
      else roots.push(info);
      const route = info.angular;
      (route as Record<PropertyKey, unknown>)[routeConfigBrand] = info;
      route.path = fallback
        ? '**'
        : definition.path + (definition.pathParam ? `/:${definition.pathParam.name}` : '');
      if (redirect) {
        route.pathMatch = 'full';
        route.redirectTo = (snapshot) => {
          const state = readState(
            info,
            snapshot.paramMap,
            snapshot.queryParamMap,
            `/${snapshot.url.map((segment) => segment.path).join('/')}`,
          );
          return definition.redirectTo!(state);
        };
      } else if (!fallback && definition.children)
        route.children = compile(definition.children, info);
      else if (!fallback && !route.component && !route.loadComponent) route.children = [];
      compiled.push(route);
    }
    return compiled;
  };

  const decode = (param: RuntimeParam, raw: string, index?: number): unknown | null => {
    try {
      const value = (param.definition.codec as UrlParamCodec<unknown>).deserialize(raw);
      if (value === null || value === undefined)
        report(
          {
            code: 'PARAM_DESERIALIZE_FAILED',
            route: param.owner.identity,
            parameter: param.name,
            operation: 'deserialize',
            index,
          },
          'was invalid',
        );
      return value;
    } catch (cause) {
      report(
        {
          code: 'PARAM_CODEC_THROWN',
          route: param.owner.identity,
          parameter: param.name,
          operation: 'deserialize',
          index,
          cause,
        },
        'threw in its codec',
      );
      return null;
    }
  };

  const queryFallback = (definition: AnyQueryParamDefinition) => {
    const fallback = resolveDefault(definition.defaultValue as DefaultValue<unknown> | undefined);
    return fallback ?? (definition.mode === 'scalar' ? null : []);
  };

  const readQuery = (param: RuntimeParam, query: ParamMap): unknown => {
    const definition = param.definition as AnyQueryParamDefinition;
    const raws = query.getAll(param.name);
    if (raws.length === 0) return queryFallback(definition);
    if (definition.mode === 'scalar') {
      const value = decode(param, raws.at(-1)!);
      return value ?? queryFallback(definition);
    }
    if (definition.mode === 'delimited' && raws.length !== 1) {
      report(
        {
          code: 'INVALID_ARRAY_REPRESENTATION',
          route: param.owner.identity,
          parameter: param.name,
          operation: 'deserialize',
        },
        'used repeated keys for a delimited value',
      );
      return queryFallback(definition);
    }
    const encoded = definition.mode === 'repeated' ? raws : raws[0].split(definition.separator!);
    const values: unknown[] = [];
    let invalid = false;
    encoded.forEach((item, index) => {
      let raw = item;
      if (definition.mode === 'delimited') {
        try {
          raw = decodeURIComponent(item);
        } catch (cause) {
          report(
            {
              code: 'PARAM_DESERIALIZE_FAILED',
              route: param.owner.identity,
              parameter: param.name,
              operation: 'deserialize',
              index,
              cause,
            },
            'had malformed item encoding',
          );
          invalid = true;
          return;
        }
      }
      const value = decode(param, raw, index);
      if (value === null || value === undefined) invalid = true;
      else values.push(value);
    });
    return invalid ? queryFallback(definition) : values;
  };

  const readState = (
    info: CompiledRoute,
    params: ParamMap,
    query: ParamMap,
    attemptedPath: string,
  ): State<AnyRecord, AnyRecord> => {
    const path: Record<string, unknown> = {};
    for (const param of info.pathParams) {
      const raw = params.get(param.name);
      const value = raw === null ? null : decode(param, raw);
      if (raw === null || value === null || value === undefined)
        throw new Error(
          `${info.identity}: expected active route '${info.pattern}', attempted current path '${attemptedPath}' could not resolve '${param.name}'`,
        );
      path[param.name] = value;
    }
    const queryState: Record<string, unknown> = {};
    for (const param of info.queryParams) queryState[param.name] = readQuery(param, query);
    return { path, query: queryState };
  };

  const routes = compile(options.routes);

  function factory(): RouterTree<R> {
    const router = inject(Router);
    const injector = inject(EnvironmentInjector);
    const navigation = signal(0);
    router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => navigation.update((value) => value + 1));

    const encode = (param: RuntimeParam, value: unknown, index?: number): string | null => {
      try {
        const output = (param.definition.codec as UrlParamCodec<unknown>).serialize(value);
        if (typeof output !== 'string') {
          report(
            {
              code: 'PARAM_SERIALIZE_FAILED',
              route: param.owner.identity,
              parameter: param.name,
              operation: 'serialize',
              index,
            },
            'was invalid',
          );
          return null;
        }
        return output;
      } catch (cause) {
        report(
          {
            code: 'PARAM_CODEC_THROWN',
            route: param.owner.identity,
            parameter: param.name,
            operation: 'serialize',
            index,
            cause,
          },
          'threw in its codec',
        );
        return null;
      }
    };

    const serializeQuery = (
      param: RuntimeParam,
      value: unknown,
    ): string | readonly string[] | null => {
      const definition = param.definition as AnyQueryParamDefinition;
      const fallback = runInInjectionContext(injector, () =>
        resolveDefault(definition.defaultValue as DefaultValue<unknown> | undefined),
      );
      if (fallback !== undefined && defaultIsEqual(value, fallback)) return null;
      if (definition.mode === 'scalar') return value === null ? null : encode(param, value);
      if (!Array.isArray(value)) {
        report(
          {
            code: 'PARAM_SERIALIZE_FAILED',
            route: param.owner.identity,
            parameter: param.name,
            operation: 'serialize',
          },
          'expected an array',
        );
        return null;
      }
      if (value.length === 0) return null;
      const items: string[] = [];
      let invalid = false;
      value.forEach((item, index) => {
        const output = encode(param, item, index);
        if (output === null) invalid = true;
        else items.push(output);
      });
      if (invalid) return null;
      return definition.mode === 'repeated'
        ? items
        : items.map((item) => encodeURIComponent(item)).join(definition.separator!);
    };

    const makeNode = (info: CompiledRoute): Record<string, unknown> => {
      const node: Record<string, unknown> = {};
      if (!info.fallback) {
        node['createUrlTree'] = (values: { path?: AnyRecord; query?: AnyRecord } = {}) => {
          const chain: CompiledRoute[] = [];
          for (let current: CompiledRoute | undefined = info; current; current = current.parent)
            chain.unshift(current);
          const commands: unknown[] = ['/'];
          for (const part of chain) {
            if (part.definition.path) commands.push(part.definition.path);
            if (part.ownPath) {
              const output = encode(part.ownPath, values.path?.[part.ownPath.name]);
              if (output === null) return null;
              if (output === '') {
                report(
                  {
                    code: 'PARAM_SERIALIZE_FAILED',
                    route: part.ownPath.owner.identity,
                    parameter: part.ownPath.name,
                    operation: 'serialize',
                  },
                  'produced an empty path segment',
                );
                return null;
              }
              commands.push(output);
            }
          }
          const queryParams: Record<string, string | readonly string[]> = {};
          for (const param of info.queryParams) {
            if (!(param.name in (values.query ?? {}))) continue;
            const output = serializeQuery(param, values.query?.[param.name]);
            if (output !== null) queryParams[param.name] = output;
          }
          return router.createUrlTree(commands, { queryParams });
        };
        node['navigate'] = (
          values?: { path?: AnyRecord; query?: AnyRecord },
          navigationOptions?: NavigationBehaviorOptions,
        ) => {
          const tree = (node['createUrlTree'] as (value?: unknown) => UrlTree | null)(values);
          return tree === null
            ? Promise.resolve(false)
            : router.navigateByUrl(tree, navigationOptions);
        };
      }
      if (!info.redirect) {
        let stable: UrlParamsRef<AnyRecord, AnyRecord> | undefined;
        node['urlParams'] = (urlOptions?: { isEqual?: UrlStateEquality<AnyRecord, AnyRecord> }) => {
          if (!urlOptions && stable) return stable;
          const value = computed(
            () => {
              navigation();
              const active = findActive(router.routerState.snapshot.root, info.angular);
              if (!active)
                throw new Error(
                  `${info.identity}: expected active route '${info.pattern}', but the current primary route is inactive`,
                );
              return runInInjectionContext(injector, () =>
                readState(
                  info,
                  active.paramMap,
                  active.queryParamMap,
                  router.url.split(/[?#]/, 1)[0] || '/',
                ),
              );
            },
            { equal: urlOptions?.isEqual ?? (info.comparator as never) },
          );
          const ref: UrlParamsRef<AnyRecord, AnyRecord> = {
            value,
            updateQueryParams: (updater, updateOptions) => {
              const next = updater(value().query);
              const tree = router.parseUrl(router.url);
              for (const param of info.queryParams) {
                const output = serializeQuery(param, next[param.name]);
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
      return node;
    };
    const tree: Record<string, unknown> = {};
    for (const root of roots) tree[root.identity] = makeNode(root);
    return tree as RouterTree<R>;
  }

  token = new InjectionToken<RouterTree<R>>('AppRouter');
  const provideAppRouter = createProviderFunction(token, routes, options.routerConfig, factory);
  return { AppRouter: token, provideAppRouter };
}
