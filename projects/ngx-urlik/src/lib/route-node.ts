import { computed, DestroyRef, Signal, signal, ValueEqualityFn } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  NavigationBehaviorOptions,
  NavigationEnd,
  PRIMARY_OUTLET,
  Router,
  RouterState,
  UrlSegment,
  UrlSegmentGroup,
  UrlTree,
} from '@angular/router';
import { filter } from 'rxjs';
import {
  activePathParams,
  compileQueryParam,
  type CompiledPathParam,
  type CompiledRoute,
  findActiveRoute,
  getPrimaryActiveChain,
} from './compiled-route';
import type { UrlParamCodec } from './params';
import { QueryDefinitions } from './route-definition';
import { ReportParameterFailure } from './route-diagnostics';
import {
  createParameterReader,
  createParameterSerializer,
  type RuntimeState,
  sameState,
  type ValueCache,
} from './route-params-runtime';
import { routeNodeInfo } from './route-symbols';
import { createRouterEscapeHatch } from './router-escape-hatch';
import type { Simplify } from './type-utils';
import { AnyRecord } from './type-utils';

export type UrlParamsState<P, Q> = Readonly<{
  path: Readonly<Simplify<P>>;
  query: Readonly<Simplify<Q>>;
}>;
export type NavigateOptions = Omit<NavigationBehaviorOptions, 'browserUrl'>;

type LinkValues = { path?: AnyRecord; query?: AnyRecord; fragment?: string | null };
type GlobalDefinitions = {
  readonly path?: Readonly<Record<string, UrlParamCodec<unknown>>>;
  readonly query?: QueryDefinitions;
};

export function createAppRouter(
  routeNames: Readonly<Record<string, string>>,
  namedRoutes: ReadonlyMap<string, CompiledRoute>,
  router: Router,
  destroyRef: DestroyRef,
  report: ReportParameterFailure,
): Record<string, unknown> {
  const { readState, readQueryState, readGlobalPath } = createParameterReader(report);
  const { serializePath, serializeQuery } = createParameterSerializer(report);

  const navigation = signal(0);
  const subscription = router.events
    .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
    .subscribe(() => {
      navigation.update((value) => value + 1);
    });
  destroyRef.onDestroy(() => subscription.unsubscribe());

  // Angular switches to the new router state, and creates the new page, before NavigationEnd.
  // Until NavigationEnd, the cached value is from the old state, so read the new one directly.
  // Each signal keeps its own field values, so a field whose URL text didn't change stays `===`.
  const routerSignal = <T>(
    readWith: (values: ValueCache) => T,
    equal: ValueEqualityFn<T>,
  ): Signal<T> => {
    const values: ValueCache = new Map();
    const read = () => readWith(values);
    let source: RouterState | undefined;
    const cached = computed(
      () => {
        navigation();
        source = router.routerState;
        return read();
      },
      { equal },
    );
    // Checked after each read, because reading the computed is what records `source`.
    const cacheIsCurrent = () => source === router.routerState;
    const current = () => {
      try {
        const value = cached();
        if (cacheIsCurrent()) {
          return value;
        }
      } catch (error) {
        if (cacheIsCurrent()) {
          throw error;
        }
      }
      return read();
    };
    // Copy the computed's own properties, so Angular still treats the wrapper as a signal.
    return Object.assign(current, cached);
  };

  const createUrlTree = (info: CompiledRoute, values: LinkValues = {}): UrlTree => {
    const { path = {}, query = {}, fragment } = values;
    const segments = info.fullSegments.map(
      (segment) =>
        new UrlSegment(
          segment.kind === 'static'
            ? segment.value
            : serializePath(segment.param, path[segment.name]),
          {},
        ),
    );
    const queryParams: Record<string, string> = {};
    for (const param of info.queryParams) {
      // Like patchQuery(), `undefined` leaves a field out, so a caller can pass an optional value.
      if (query[param.name] === undefined) {
        continue;
      }
      const output = serializeQuery(param, query[param.name]);
      if (output !== null) {
        queryParams[param.name] = output;
      }
    }
    // A typed link is absolute, with known segments, so it skips Angular's command parsing. It
    // builds the same tree Angular's createUrlTree(['/', ...segments]) would.
    const children: Record<string, UrlSegmentGroup> = segments.length
      ? { [PRIMARY_OUTLET]: new UrlSegmentGroup(segments, {}) }
      : {};
    return new UrlTree(new UrlSegmentGroup([], children), queryParams, fragment ?? null);
  };

  const readActiveState = (
    info: CompiledRoute,
    active: ActivatedRouteSnapshot,
    values?: ValueCache,
  ) => {
    // Named in the error when a path value doesn't decode, so it's built only then.
    const url = () =>
      '/' + active.pathFromRoot.flatMap((snapshot) => snapshot.url.map((s) => s.path)).join('/');
    return readState(info, activePathParams(info, active), active.queryParamMap, url, values);
  };

  const readCurrent = (info: CompiledRoute, values?: ValueCache) => {
    const active = findActiveRoute(router.routerState.snapshot.root, info);
    if (!active) {
      throw new Error(
        `${info.label}: route '${info.pattern}' isn't active, so it has no params to read. Check ifActive() first.`,
      );
    }
    return readActiveState(info, active, values);
  };

  // Like router.navigate(), a patch starts from the URL at the moment you call it.
  const patchQuery = (
    info: CompiledRoute,
    patch: Partial<AnyRecord>,
    options?: NavigateOptions,
  ) => {
    const supplied = Object.entries(patch).filter(([, value]) => value !== undefined);
    const next = { ...readCurrent(info).query, ...Object.fromEntries(supplied) };
    const tree = router.parseUrl(router.url);
    for (const param of info.queryParams) {
      const output = serializeQuery(param, next[param.name]);
      if (output === null) {
        delete tree.queryParams[param.name];
      } else {
        tree.queryParams[param.name] = output;
      }
    }
    // Angular skips a navigation to the URL it's on and resolves false, like a declined one. A
    // navigation that's still running needs this one to cancel it.
    const urlUnchanged = router.serializeUrl(tree) === router.url;
    const navigating = router.currentNavigation() !== null;
    if (urlUnchanged && !navigating) {
      return Promise.resolve(true);
    }
    return router.navigateByUrl(tree, options);
  };

  const createNode = (info: CompiledRoute) => {
    const node: Record<PropertyKey, unknown> = {
      createUrlTree: (values?: LinkValues) => createUrlTree(info, values),
      // Async, so a link that can't be built rejects the promise instead of throwing.
      navigate: async (values?: LinkValues, options?: NavigateOptions) =>
        router.navigateByUrl(createUrlTree(info, values), options),
      params: routerSignal((values) => readCurrent(info, values), sameState),
      patchQuery: async (patch: Partial<AnyRecord>, options?: NavigateOptions) =>
        patchQuery(info, patch, options),
    };
    node['ifActive'] = routerSignal(
      () => (findActiveRoute(router.routerState.snapshot.root, info) ? node : null),
      Object.is,
    );
    Object.defineProperty(node, routeNodeInfo, { value: info });
    return node;
  };

  // AppRouter.routes uses enum member names, so `Movie = 'movie'` becomes routes.Movie.
  const nodes = new Map([...namedRoutes].map(([routeName, info]) => [routeName, createNode(info)]));
  const routes: Record<string, unknown> = Object.create(null);
  for (const [member, routeName] of Object.entries(routeNames)) {
    routes[member] = nodes.get(routeName);
  }

  const infoOf = (node: object): CompiledRoute | undefined => {
    const info = (node as Record<PropertyKey, unknown>)[routeNodeInfo] as CompiledRoute | undefined;
    const fromThisRouter =
      info?.routeName !== undefined && namedRoutes.get(info.routeName) === info;
    return fromThisRouter ? info : undefined;
  };

  const compileGlobal = (definitions: GlobalDefinitions, label: string) => {
    const owner = { label };
    const pathParams = Object.entries(definitions.path ?? {}).map(
      ([name, codec]): CompiledPathParam => ({ name, codec, owner, placement: 'path' }),
    );
    const queryParams = Object.entries(definitions.query ?? {}).map(([name, definition]) =>
      compileQueryParam(name, definition, owner),
    );
    return (root: ActivatedRouteSnapshot, values?: ValueCache): RuntimeState => ({
      path: readGlobalPath(pathParams, getPrimaryActiveChain(root), values),
      query: readQueryState(queryParams, root.queryParamMap, values),
    });
  };

  return {
    routes,
    escapeHatch: createRouterEscapeHatch(router),
    globalParams: (definitions: GlobalDefinitions): Signal<RuntimeState> => {
      const read = compileGlobal(definitions, 'globalParams');
      return routerSignal((values) => read(router.routerState.snapshot.root, values), sameState);
    },
    globalParamsSnapshot: (
      definitions: GlobalDefinitions,
      snapshot: ActivatedRouteSnapshot,
    ): RuntimeState => compileGlobal(definitions, 'globalParamsSnapshot')(snapshot.root),
    paramsSnapshot: (node: object, snapshot: ActivatedRouteSnapshot) => {
      const info = infoOf(node);
      if (!info) {
        throw new Error(
          "paramsSnapshot(): that isn't a route from AppRouter.routes. Pass appRouter.routes.NAME.",
        );
      }
      const active = findActiveRoute(snapshot.root, info);
      if (!active) {
        throw new Error(
          `paramsSnapshot(): the snapshot doesn't contain route ${info.label} ('${info.pattern}'). Pass the snapshot of a guard or resolver on that route or a route below it.`,
        );
      }
      return readActiveState(info, active);
    },
  };
}
