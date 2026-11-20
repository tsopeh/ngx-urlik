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
  type CompiledParam,
  type CompiledPathParam,
  type CompiledRoute,
  compileQueryParam,
  findActiveRoute,
  getPrimaryActiveChain,
} from './compiled-route';
import type { UrlParamCodec } from './params';
import { QueryDefinitions } from './route-definition';
import { ReportParameterFailure } from './route-diagnostics';
import {
  createParameterReader,
  createParameterSerializer,
  type EncodedPathText,
  type EncodedQueryText,
  type RuntimeState,
  sameState,
  type ValueCache,
} from './route-params-runtime';
import { routeNodeInfo } from './route-symbols';
import { createRouterEscapeHatch } from './router-escape-hatch';
import type { Simplify } from './type-utils';
import { AnyRecord } from './type-utils';

export type RouteParams<P, Q> = Readonly<{
  path: Readonly<Simplify<P>>;
  query: Readonly<Simplify<Q>>;
}>;
export type NavigateOptions = Omit<NavigationBehaviorOptions, 'browserUrl'>;

type LinkValues = { path?: AnyRecord; query?: AnyRecord; fragment?: string | null };
type MatchValues = { path?: AnyRecord; query?: AnyRecord };
type GlobalDefinitions = {
  readonly path?: Readonly<Record<string, UrlParamCodec<unknown>>>;
  readonly query?: QueryDefinitions;
};

/**
 * Maps each query parameter of a route from `AppRouter.routes` to its default, or to `null` when
 * it has none. Returns `undefined` for any other object. Only `ngx-urlik/forms` uses it. It isn't
 * public API.
 */
export function ɵqueryDefaults(route: object): AnyRecord | undefined {
  const info = (route as Record<PropertyKey, unknown>)[routeNodeInfo] as CompiledRoute | undefined;
  if (!info) {
    return undefined;
  }
  return Object.fromEntries(
    info.queryParams.map((param) => [
      param.name,
      param.definition.hasDefault ? param.definition.defaultValue : null,
    ]),
  );
}

export function createAppRouter(
  routeNames: Readonly<Record<string, string>>,
  namedRoutes: ReadonlyMap<string, CompiledRoute>,
  router: Router,
  destroyRef: DestroyRef,
  report: ReportParameterFailure,
): Record<string, unknown> {
  const { readState, readQueryState, readGlobalPath } = createParameterReader(report);
  const { serializePath, serializeQuery, queryText, pathText } = createParameterSerializer(report);

  const navigation = signal(0);
  const subscription = router.events
    .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
    .subscribe(() => {
      navigation.update((value) => value + 1);
    });
  destroyRef.onDestroy(() => subscription.unsubscribe());

  // Angular switches to the new router state and creates the new page before NavigationEnd. Until
  // then the cached value comes from the old state, so a read goes to the new state directly. Each
  // signal has its own ValueCache, so a parameter whose URL text didn't change stays `===`.
  const routerSignal = <T>(
    readWith: (values?: ValueCache) => T,
    equal: ValueEqualityFn<T>,
  ): Signal<T> => {
    const values: ValueCache = new Map();
    let source: RouterState | undefined;
    const cached = computed(
      () => {
        navigation();
        source = router.routerState;
        return readWith(values);
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
      // Activation can still throw and roll back routerState, so don't mutate `values` while lagging.
      return readWith(undefined);
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
    // Only the error for an undecodable path parameter uses the URL, so it's built on demand.
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

  // Maps each patch's target tree to the patch's result. Angular keeps a navigation's starting tree
  // as `initialUrl`, so a running navigation whose tree is in this map came from a patch.
  const patchResults = new WeakMap<UrlTree, Promise<boolean>>();
  // Maps an overtaken patch's tree to the result of the newer patch that carried its fields.
  const carriedBy = new WeakMap<UrlTree, Promise<boolean>>();
  // The trees of patches that add a history entry, rather than replace the current one.
  const pushingPatches = new WeakSet<UrlTree>();

  // A patch changes only the fields you pass. One made while another patch runs starts from where
  // that patch is going, so patches add up, and the later one wins on a field they share.
  const patchQuery = (
    info: CompiledRoute,
    patch: Partial<AnyRecord>,
    options?: NavigateOptions,
  ): Promise<boolean> => {
    // Reading the query first also throws when the route isn't active.
    const current = readCurrent(info).query;
    const running = router.currentNavigation();
    const runningPatch =
      running !== null && patchResults.has(running.initialUrl) ? running.initialUrl : null;
    // A navigation no patch started is the user's, like a link or Back, so a patch gives way to it.
    if (running !== null && runningPatch === null) {
      return Promise.resolve(false);
    }
    const runningUrl = runningPatch ? router.serializeUrl(runningPatch) : null;
    // Each read of router.url serializes the whole URL, so read it once.
    const currentUrl = router.url;
    const from = runningPatch
      ? readQueryState(info.queryParams, runningPatch.queryParamMap)
      : current;
    const supplied = Object.entries(patch).filter(([, value]) => value !== undefined);
    const next = { ...from, ...Object.fromEntries(supplied) };
    const tree = router.parseUrl(runningUrl ?? currentUrl);
    for (const param of info.queryParams) {
      const output = serializeQuery(param, next[param.name]);
      if (output === null) {
        delete tree.queryParams[param.name];
      } else {
        tree.queryParams[param.name] = output;
      }
    }
    const target = router.serializeUrl(tree);
    if (runningPatch) {
      if (target === runningUrl) {
        return patchResults.get(runningPatch) as Promise<boolean>;
      }
    } else if (target === currentUrl) {
      return Promise.resolve(true);
    }
    // The navigation carries the running patch, so it adds the history entry that patch asked for.
    // Its other options are this patch's.
    const carriesPush = runningPatch !== null && pushingPatches.has(runningPatch);
    const extras: NavigateOptions = {
      ...options,
      ...(carriesPush ? { replaceUrl: false } : {}),
      // Angular skips a navigation to the current URL and resolves false, as for a decline. With
      // onSameUrlNavigation: 'reload' it still overtakes the running patch and resolves true.
      ...(target === currentUrl ? { onSameUrlNavigation: 'reload' as const } : {}),
    };
    const navigation = router.navigateByUrl(tree, extras);
    const result = navigation.then((done) => done || (carriedBy.get(tree) ?? false));
    patchResults.set(tree, result);
    if (!extras.replaceUrl) {
      pushingPatches.add(tree);
    }
    if (runningPatch) {
      carriedBy.set(runningPatch, result);
    }
    return result;
  };

  // Caches each parameter's canonical URL text for a decoded RuntimeState, so repeated
  // ifActive(values) checks (such as inside a list) encode the current values at most once.
  const canonicalTexts = new WeakMap<
    RuntimeState,
    Map<CompiledParam, EncodedPathText | EncodedQueryText>
  >();
  const currentTextOf = <
    Param extends CompiledParam,
    Encoded extends EncodedPathText | EncodedQueryText,
  >(
    state: RuntimeState,
    param: Param,
    value: unknown,
    encode: (param: Param, value: unknown) => Encoded,
  ): Encoded => {
    let cache = canonicalTexts.get(state);
    if (!cache) {
      cache = new Map();
      canonicalTexts.set(state, cache);
    }
    let encoded = cache.get(param) as Encoded | undefined;
    if (!encoded) {
      encoded = encode(param, value);
      cache.set(param, encoded);
    }
    return encoded;
  };

  // A value matches when it writes the same URL text as the current one, so a default matches
  // whether the URL writes it out or not. A parameter left out, or passed as `undefined`, matches
  // any value. A value whose codec fails has no text, so it never matches, even a current value
  // whose codec fails too.
  const fieldsMatch = <
    Param extends CompiledParam,
    Encoded extends EncodedPathText | EncodedQueryText,
  >(
    state: RuntimeState,
    params: readonly Param[],
    passed: AnyRecord,
    current: AnyRecord,
    encode: (param: Param, value: unknown) => Encoded,
  ) =>
    params.every((param) => {
      const value = passed[param.name];
      if (value === undefined) {
        return true;
      }
      const passedText = encode(param, value);
      if (!passedText.ok) {
        return false;
      }
      const currentText = currentTextOf(state, param, current[param.name], encode);
      return currentText.ok && passedText.text === currentText.text;
    });
  const matchesValues = (info: CompiledRoute, values: MatchValues, current: RuntimeState) =>
    fieldsMatch(current, info.pathParams, values.path ?? {}, current.path, pathText) &&
    fieldsMatch(current, info.queryParams, values.query ?? {}, current.query, queryText);

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
    const active = routerSignal(
      () => (findActiveRoute(router.routerState.snapshot.root, info) ? node : null),
      Object.is,
    );
    const params = node['params'] as Signal<RuntimeState>;
    // Without values it reads only `active`, so it notifies only when the answer changes. With
    // values it reads params() too.
    node['ifActive'] = (values?: MatchValues) => {
      const route = active();
      if (route === null || values === undefined) {
        return route;
      }
      return matchesValues(info, values, params()) ? route : null;
    };
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
