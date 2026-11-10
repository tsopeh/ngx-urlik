import {
  computed,
  DestroyRef,
  EnvironmentInjector,
  runInInjectionContext,
  Signal,
  signal,
  ValueEqualityFn,
} from '@angular/core';
import {
  ActivatedRouteSnapshot,
  NavigationBehaviorOptions,
  NavigationEnd,
  Router,
  RouterState,
  UrlTree,
} from '@angular/router';
import { filter } from 'rxjs';
import type { CompiledRoute, RuntimeParam } from './compiled-route';
import {
  activePathParams,
  findActiveRoute,
  findLastResult,
  getPrimaryActiveChain,
} from './compiled-route';
import { isEqual } from './is-equal';
import { ClearPersistedOptions, Persistence, persistOf } from './persistence';
import { QueryDefinitions } from './route-definition';
import { ReportParameterFailure } from './route-diagnostics';
import { createParameterReader, createParameterSerializer } from './route-params-runtime';
import { routeConfigBrand, routeNodeInfo } from './route-symbols';
import { createRouterEscapeHatch } from './router-escape-hatch';
import type { Simplify } from './type-utils';
import { AnyRecord } from './type-utils';

export type UrlParamsState<P, Q> = Readonly<{
  path: Readonly<Simplify<P>>;
  query: Readonly<Simplify<Q>>;
}>;
export type QueryPatch<Q> = Partial<Readonly<Q>> | ((query: Readonly<Q>) => Partial<Readonly<Q>>);
export type TypedNavigationBehaviorOptions = Omit<NavigationBehaviorOptions, 'browserUrl'>;

type ConstructionValues = { path?: AnyRecord; query?: AnyRecord; fragment?: string | null };

export function createAppRouter(
  routeNames: Readonly<Record<string, string>>,
  catalog: ReadonlyMap<string, CompiledRoute>,
  router: Router,
  injector: EnvironmentInjector,
  reader: ReturnType<typeof createParameterReader>,
  report: ReportParameterFailure,
  persistence: Persistence,
): Record<string, unknown> {
  const destroyRef = injector.get(DestroyRef);
  const navigation = signal(0);
  const subscription = router.events
    .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
    .subscribe(() => {
      persistence.save(router.routerState.snapshot.root);
      navigation.update((value) => value + 1);
    });
  destroyRef.onDestroy(() => subscription.unsubscribe());
  const { readState, readQueryState } = reader;
  const { serializePath, serializeQuery } = createParameterSerializer(injector, report);

  // Angular commits the new router state and creates routed components before NavigationEnd.
  // A value cached earlier in that navigation is stale then, so read the committed state directly.
  const stateSignal = <T>(read: () => T, equal: ValueEqualityFn<T>): Signal<T> => {
    let source: RouterState | undefined;
    const cached = computed(
      () => {
        navigation();
        source = router.routerState;
        return read();
      },
      { equal },
    );
    const current = () => {
      try {
        const value = cached();
        if (source === router.routerState) return value;
      } catch (error) {
        if (source === router.routerState) throw error;
      }
      return read();
    };
    // Copying the computed's own properties keeps Angular's signal marker on the wrapper.
    return Object.assign(current, cached);
  };

  const createUrlTree = (info: CompiledRoute, values: ConstructionValues = {}): UrlTree => {
    const commands: unknown[] = ['/'];
    for (const segment of info.fullSegments) {
      commands.push(
        segment.kind === 'static'
          ? segment.value
          : serializePath(segment.param, values.path?.[segment.name]),
      );
    }
    const queryParams: Record<string, string | readonly string[]> = {};
    for (const param of info.queryParams) {
      if (!(param.name in (values.query ?? {}))) continue;
      const output = serializeQuery(param, values.query?.[param.name]);
      if (output !== null) queryParams[param.name] = output;
    }
    return router.createUrlTree(commands, {
      queryParams,
      queryParamsHandling: 'replace',
      fragment: values.fragment ?? undefined,
    });
  };

  const readActiveState = (info: CompiledRoute, active: ActivatedRouteSnapshot) => {
    const path = activePathParams(info, active);
    return runInInjectionContext(injector, () =>
      readState(
        info,
        path,
        active.queryParamMap,
        '/' + active.pathFromRoot.flatMap((snapshot) => snapshot.url.map((s) => s.path)).join('/'),
        (param) => (persistOf(param) ? persistence.restore(param, path) : undefined),
      ),
    );
  };

  const routes: Record<string, unknown> = Object.create(null);
  for (const [routeName, info] of catalog) {
    const node: Record<PropertyKey, unknown> = {};
    Object.defineProperty(node, routeNodeInfo, { value: info });
    const read = () => {
      const active = findActiveRoute(router.routerState.snapshot.root, info);
      return active ? readActiveState(info, active) : undefined;
    };
    const requireState = () => {
      const state = read();
      if (!state)
        throw new Error(
          `${info.identity}: expected active route '${info.pattern}', but the current primary route is inactive`,
        );
      return state;
    };
    node['createUrlTree'] = (values?: ConstructionValues) => createUrlTree(info, values);
    node['navigate'] = async (
      values?: ConstructionValues,
      options?: TypedNavigationBehaviorOptions,
    ) => router.navigateByUrl(createUrlTree(info, values), options);
    node['params'] = stateSignal(requireState, info.comparator);
    node['paramsFrom'] = (snapshot: ActivatedRouteSnapshot) => {
      const active = findActiveRoute(snapshot.root, info);
      if (!active)
        throw new Error(`${info.identity}: the snapshot does not contain route '${info.pattern}'`);
      return readActiveState(info, active);
    };
    // Like router.navigate(), the patch reads the committed query when called, not when it lands.
    const update = async (
      updater: (query: AnyRecord) => AnyRecord,
      options?: { replaceUrl?: boolean },
    ) => {
      const next = updater(requireState().query);
      const tree = router.parseUrl(router.url);
      for (const param of info.queryParams) {
        const output = serializeQuery(param, next[param.name]);
        if (output === null) delete tree.queryParams[param.name];
        else tree.queryParams[param.name] = output;
      }
      return router.navigateByUrl(tree, options);
    };
    node['patchQuery'] = (
      patch: Partial<AnyRecord> | ((query: AnyRecord) => Partial<AnyRecord>),
      options?: { replaceUrl?: boolean },
    ) =>
      update((query) => {
        const changes = typeof patch === 'function' ? patch(query) : patch;
        const supplied = Object.entries(changes).filter(([, value]) => value !== undefined);
        return { ...query, ...Object.fromEntries(supplied) };
      }, options);
    // Types key routes by member name, so a member whose value differs from its name still works.
    for (const [member, value] of Object.entries(routeNames))
      if (value === routeName) routes[member] = node;
  }

  const tree: Record<string, unknown> = {
    routes,
    escapeHatch: createRouterEscapeHatch(router),
  };
  tree['globalQueryParams'] = (
    definitions: QueryDefinitions,
    options?: { isEqual?: (previous: AnyRecord, next: AnyRecord) => boolean },
  ): Signal<AnyRecord> => {
    const params: RuntimeParam[] = Object.entries(definitions).map(([name, definition]) => ({
      name,
      definition,
      owner: { fullIdentity: 'globalQueryParams' },
      placement: 'query',
    }));
    return stateSignal(
      () =>
        runInInjectionContext(injector, () =>
          readQueryState(params, router.routerState.snapshot.root.queryParamMap),
        ),
      options?.isEqual ?? isEqual,
    );
  };
  tree['clearPersisted'] = (options?: ClearPersistedOptions) => persistence.clear(options);
  tree['activeRoute'] = (candidates: Readonly<Record<PropertyKey, object>>) => {
    for (const key of Reflect.ownKeys(candidates)) {
      const node = candidates[key] as Record<PropertyKey, unknown>;
      const info = node[routeNodeInfo] as CompiledRoute | undefined;
      if (!info || !info.routeName || catalog.get(info.routeName) !== info)
        throw new Error(`activeRoute(): candidate '${String(key)}' is not a stateful route node`);
    }
    return stateSignal(() => {
      let selected:
        | {
            key: PropertyKey;
            node: object;
            info: CompiledRoute;
            active: NonNullable<ReturnType<typeof findActiveRoute>>;
          }
        | undefined;
      const root = router.routerState.snapshot.root;
      const activeChain = getPrimaryActiveChain(root);
      const match = findLastResult(activeChain, (snap) => {
        const info = (snap.routeConfig as Record<PropertyKey, unknown> | null)?.[
          routeConfigBrand
        ] as CompiledRoute | undefined;
        if (!info) return null;
        const key = Reflect.ownKeys(candidates).find(
          (candidate) =>
            (candidates[candidate] as Record<PropertyKey, unknown>)[routeNodeInfo] === info,
        );
        return key === undefined
          ? null
          : { key, node: candidates[key] as object, info, active: snap };
      });
      if (match) selected = match;
      if (selected) {
        const { key, node, info, active } = selected;
        const params = readActiveState(info, active);
        return {
          route: key,
          node,
          params,
          createUrlTree: (patch?: { query?: AnyRecord; fragment?: string | null }) =>
            createUrlTree(info, {
              path: params.path,
              query: patch?.query ? { ...params.query, ...patch.query } : params.query,
              fragment: patch?.fragment,
            }),
          patchQuery: (
            patch: Partial<AnyRecord> | ((query: AnyRecord) => Partial<AnyRecord>),
            options?: { replaceUrl?: boolean },
          ) => (node as Record<string, Function>)['patchQuery'](patch, options),
        };
      }
      throw new Error(
        `activeRoute(): none of the candidate routes [${Reflect.ownKeys(candidates)
          .map(String)
          .join(', ')}] is active`,
      );
    }, Object.is);
  };
  return tree;
}
