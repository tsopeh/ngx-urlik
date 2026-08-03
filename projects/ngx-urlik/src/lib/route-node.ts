import {
  EnvironmentInjector,
  Signal,
  computed,
  runInInjectionContext,
  signal,
} from '@angular/core';
import {
  NavigationBehaviorOptions,
  NavigationEnd,
  ParamMap,
  Router,
  UrlTree,
} from '@angular/router';
import { filter } from 'rxjs';
import { CompiledRoute, findActiveRoute } from './compiled-route';
import { ReportParameterFailure } from './route-diagnostics';
import { RuntimeState, createParameterSerializer } from './route-params-runtime';

export const routeNodeInfo: unique symbol = Symbol('ngx-urlik route node');

type AnyRecord = Readonly<Record<string, unknown>>;
type Simplify<T> = { [K in keyof T]: T[K] };
export type UrlParamsState<P, Q> = Readonly<{
  path: Readonly<Simplify<P>>;
  query: Readonly<Simplify<Q>>;
}>;
export type UrlStateEquality<P = unknown, Q = unknown> = (
  a: UrlParamsState<P, Q>,
  b: UrlParamsState<P, Q>,
) => boolean;
export type TypedNavigationBehaviorOptions = Omit<NavigationBehaviorOptions, 'browserUrl'>;

export interface UrlParamsRef<P, Q> {
  readonly value: Signal<UrlParamsState<P, Q>>;
  updateQueryParams(
    updater: (previous: Readonly<Simplify<Q>>) => Simplify<Q>,
    options?: { replaceUrl?: boolean },
  ): Promise<boolean>;
}

export interface ActiveRouteRef {
  readonly value: Signal<
    Readonly<{
      route: PropertyKey;
      node: object;
      params: Readonly<{ path: AnyRecord; query: AnyRecord }>;
    }>
  >;
}

export function createRouteTree(
  roots: readonly CompiledRoute[],
  router: Router,
  injector: EnvironmentInjector,
  readState: (
    info: CompiledRoute,
    params: ParamMap,
    query: ParamMap,
    attemptedPath: string,
  ) => RuntimeState,
  report: ReportParameterFailure,
): Record<string, unknown> {
  const navigation = signal(0);
  router.events
    .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
    .subscribe(() => navigation.update((value) => value + 1));
  const { encode, serializeQuery } = createParameterSerializer(injector, report);

  const makeNode = (info: CompiledRoute): Record<string, unknown> => {
    const node: Record<string, unknown> = {};
    Object.defineProperty(node, routeNodeInfo, { value: info });
    if (!info.fallback) {
      node['createUrlTree'] = (
        values: { path?: AnyRecord; query?: AnyRecord; fragment?: string | null } = {},
      ) => {
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
                part.ownPath,
                { code: 'PARAM_SERIALIZE_FAILED', operation: 'serialize' },
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
        return router.createUrlTree(commands, {
          queryParams,
          fragment: values.fragment ?? undefined,
        });
      };
      node['navigate'] = (
        values?: { path?: AnyRecord; query?: AnyRecord; fragment?: string | null },
        navigationOptions?: TypedNavigationBehaviorOptions,
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
            const active = findActiveRoute(router.routerState.snapshot.root, info.angular);
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
  tree['activeRoute'] = (candidates: Readonly<Record<PropertyKey, object>>): ActiveRouteRef => ({
    value: computed(() => {
      navigation();
      for (const key of Reflect.ownKeys(candidates)) {
        const node = candidates[key] as Record<PropertyKey, unknown>;
        const info = node[routeNodeInfo] as CompiledRoute | undefined;
        if (!info || info.redirect)
          throw new Error(`activeRoute(): candidate '${String(key)}' is not a stateful route node`);
        const active = findActiveRoute(router.routerState.snapshot.root, info.angular);
        if (active)
          return {
            route: key,
            node,
            params: runInInjectionContext(injector, () =>
              readState(
                info,
                active.paramMap,
                active.queryParamMap,
                router.url.split(/[?#]/, 1)[0] || '/',
              ),
            ),
          };
      }
      throw new Error(
        `activeRoute(): none of the candidate routes [${Reflect.ownKeys(candidates)
          .map(String)
          .join(', ')}] is active`,
      );
    }),
  });
  return tree;
}
