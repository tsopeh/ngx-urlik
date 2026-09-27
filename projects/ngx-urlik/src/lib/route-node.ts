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
import { isEqual } from './is-equal';
import { QueryWriteCoordinator, registerQueryBinding } from './query-write-coordinator';
import { QueryDefinitions } from './route-definition';
import { ReportParameterFailure } from './route-diagnostics';
import { createParameterReader, createParameterSerializer } from './route-params-runtime';
import { routeNodeInfo } from './route-symbols';
import { createRouterEscapeHatch } from './router-escape-hatch';
import { AnyRecord } from './type-utils';
import { activePathParams, assertRouteConfig, findActiveRoute } from './compiled-route';
import type { Simplify } from './type-utils';

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
    const chain: CompiledRoute[] = [];
    for (let current: CompiledRoute | undefined = info; current; current = current.parent)
      chain.unshift(current);
    const commands: unknown[] = ['/'];
    for (const part of chain) {
      for (const segment of part.segments) {
        if (segment.kind === 'static') {
          commands.push(segment.value);
          continue;
        }
        const param = part.pathParams.find(
          (item) => item.owner === part && item.name === segment.name,
        )!;
        const output = encode(param, values.path?.[segment.name]);
        if (output === null) return null;
        if (output === '') {
          report(
            param,
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
  for (const [identifier, info] of catalog) {
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
    node['navigate'] = (values?: ConstructionValues, options?: TypedNavigationBehaviorOptions) => {
      const tree = createUrlTree(info, values);
      return tree === null ? Promise.resolve(false) : router.navigateByUrl(tree, options);
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
    routes[identifier] = node;
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
        if (!info || !info.identifier || catalog.get(info.identifier) !== info)
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
        for (const key of Reflect.ownKeys(candidates)) {
          const node = candidates[key] as Record<PropertyKey, unknown>;
          const info = node[routeNodeInfo] as CompiledRoute;
          const active = findActiveRoute(router.routerState.snapshot.root, info);
          if (
            active &&
            (!selected || active.pathFromRoot.length > selected.active.pathFromRoot.length)
          )
            selected = { key, node, info, active };
        }
        if (selected) {
          const { key, node, info, active } = selected;
          return { route: key, node, params: readActiveState(info, active) };
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
