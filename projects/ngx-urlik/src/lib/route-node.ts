import {
  computed,
  DestroyRef,
  EnvironmentInjector,
  runInInjectionContext,
  Signal,
  signal,
} from '@angular/core';
import { NavigationBehaviorOptions, NavigationEnd, Router, UrlTree } from '@angular/router';
import { filter } from 'rxjs';
import type { CompiledRoute, RuntimeParam } from './compiled-route';
import {
  activePathParams,
  assertRouteConfig,
  findActiveRoute,
  findLastResult,
  getPrimaryActiveChain,
} from './compiled-route';
import { isEqual } from './is-equal';
import { QueryWriteCoordinator, registerQueryBinding } from './query-write-coordinator';
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

function checkedSignal<T>(source: Signal<T>, check: () => void): Signal<T> {
  return new Proxy(source, {
    apply(target, thisArg, args) {
      check();
      return Reflect.apply(target, thisArg, args);
    },
  });
}

export function createAppRouter(
  routeNames: Readonly<Record<string, string>>,
  catalog: ReadonlyMap<string, CompiledRoute>,
  router: Router,
  injector: EnvironmentInjector,
  reader: ReturnType<typeof createParameterReader>,
  report: ReportParameterFailure,
): Record<string, unknown> {
  const destroyRef = injector.get(DestroyRef);
  const coordinator = new QueryWriteCoordinator(router, destroyRef);
  const navigation = signal(0);
  const subscription = router.events
    .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
    .subscribe(() => navigation.update((value) => value + 1));
  destroyRef.onDestroy(() => subscription.unsubscribe());
  const { readState, readQueryState } = reader;
  const { encode, serializeQuery } = createParameterSerializer(injector, report);

  const requireCurrent = (info: CompiledRoute) => assertRouteConfig(router.config, info);
  const createUrlTree = (info: CompiledRoute, values: ConstructionValues = {}): UrlTree | null => {
    requireCurrent(info);
    const commands: unknown[] = ['/'];
    for (const segment of info.fullSegments) {
      if (segment.kind === 'static') {
        commands.push(segment.value);
        continue;
      }
      const output = encode(segment.param, values.path?.[segment.name]);
      if (output === null) return null;
      if (output === '') {
        report(
          segment.param,
          { code: 'PARAM_SERIALIZE_FAILED', operation: 'serialize' },
          'produced an empty path segment',
        );
        return null;
      }
      commands.push(output);
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

  const readActiveState = (info: CompiledRoute, active: ReturnType<typeof findActiveRoute>) =>
    runInInjectionContext(injector, () =>
      readState(
        info,
        activePathParams(info, active!),
        active!.queryParamMap,
        router.url.split(/[?#]/, 1)[0] || '/',
      ),
    );

  const routes: Record<string, unknown> = Object.create(null);
  for (const [routeName, info] of catalog) {
    const node: Record<PropertyKey, unknown> = {};
    Object.defineProperty(node, routeNodeInfo, { value: info });
    const read = () => {
      requireCurrent(info);
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
    node['navigate'] = (
      valuesOrOptions?: ConstructionValues | TypedNavigationBehaviorOptions,
      options?: TypedNavigationBehaviorOptions,
    ) => {
      let values: ConstructionValues | undefined;
      let navOptions = options;
      if (
        options === undefined &&
        valuesOrOptions &&
        !('path' in valuesOrOptions || 'query' in valuesOrOptions || 'fragment' in valuesOrOptions)
      ) {
        values = undefined;
        navOptions = valuesOrOptions as TypedNavigationBehaviorOptions;
      } else {
        values = valuesOrOptions as ConstructionValues;
      }
      const tree = createUrlTree(info, values);
      return tree === null ? Promise.resolve(false) : router.navigateByUrl(tree, navOptions);
    };
    node['params'] = checkedSignal(
      computed(
        () => {
          navigation();
          return requireState();
        },
        { equal: info.comparator },
      ),
      () => requireCurrent(info),
    );
    const update = (
      updater: (query: AnyRecord) => AnyRecord,
      options?: { replaceUrl?: boolean },
      owner?: object,
      committed?: () => void,
    ) =>
      coordinator.enqueue(
        () => {
          const next = updater(requireState().query);
          const tree = router.parseUrl(router.url);
          for (const param of info.queryParams) {
            const output = serializeQuery(param, next[param.name]);
            if (output === null) delete tree.queryParams[param.name];
            else tree.queryParams[param.name] = output;
          }
          return tree;
        },
        options,
        owner,
        committed,
      );
    node['patchQuery'] = (
      patch: Partial<AnyRecord> | ((query: AnyRecord) => Partial<AnyRecord>),
      options?: { replaceUrl?: boolean },
    ) =>
      update((query) => {
        const changes = typeof patch === 'function' ? patch(query) : patch;
        const supplied = Object.entries(changes).filter(([, value]) => value !== undefined);
        return { ...query, ...Object.fromEntries(supplied) };
      }, options);
    registerQueryBinding(node, {
      coordinator,
      read: () => {
        navigation();
        return read()?.query;
      },
      update,
    });
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
    return computed(
      () => {
        navigation();
        return runInInjectionContext(injector, () =>
          readQueryState(params, router.routerState.snapshot.root.queryParamMap),
        );
      },
      { equal: options?.isEqual ?? isEqual },
    );
  };
  tree['activeRoute'] = (candidates: Readonly<Record<PropertyKey, object>>) => {
    const checkCandidates = () => {
      for (const key of Reflect.ownKeys(candidates)) {
        const node = candidates[key] as Record<PropertyKey, unknown>;
        const info = node[routeNodeInfo] as CompiledRoute | undefined;
        if (!info || !info.routeName || catalog.get(info.routeName) !== info)
          throw new Error(`activeRoute(): candidate '${String(key)}' is not a stateful route node`);
        requireCurrent(info);
      }
    };
    return checkedSignal(
      computed(() => {
        navigation();
        let selected:
          | {
              key: PropertyKey;
              node: object;
              info: CompiledRoute;
              active: NonNullable<ReturnType<typeof findActiveRoute>>;
            }
          | undefined;
        checkCandidates();
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
      }),
      checkCandidates,
    );
  };
  return tree;
}
