import {
  computed,
  DestroyRef,
  Signal,
  signal,
  ValueEqualityFn,
  WritableSignal,
} from '@angular/core';
import {
  ActivatedRouteSnapshot,
  NavigationBehaviorOptions,
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  PRIMARY_OUTLET,
  Router,
  RouterState,
  UrlSegment,
  UrlSegmentGroup,
  UrlTree,
} from '@angular/router';
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
 * Internal query-parameter support for a route from `AppRouter.routes`. Only `ngx-urlik/forms`
 * uses it. It isn't public API.
 */
export interface ɵQueryRouteSupport {
  readonly defaults: AnyRecord;
  sameValue(param: string, a: unknown, b: unknown): boolean;
  readIfActive(): AnyRecord | undefined;
}

const querySupportByNode = new WeakMap<object, ɵQueryRouteSupport>();

/**
 * Returns query defaults, URL-text equality, and active-route reading for a route from
 * `AppRouter.routes`, or `undefined` for any other object. Only `ngx-urlik/forms` uses it.
 */
export function ɵqueryRouteSupport(route: object): ɵQueryRouteSupport | undefined {
  return querySupportByNode.get(route);
}

export function createAppRouter(
  routeNames: Readonly<Record<string, string>>,
  namedRoutes: ReadonlyMap<string, CompiledRoute>,
  router: Router,
  destroyRef: DestroyRef,
  report: ReportParameterFailure,
): Record<string, unknown> {
  const { readState, readQueryState, readGlobalPath } = createParameterReader(report);
  const { serializePath, serializeQuery, queryText, sameQueryValue, pathText } =
    createParameterSerializer(report);

  const navigation = signal(0);
  let committedState = router.routerState;
  const committedStates = new WeakSet<RouterState>([committedState]);
  // The retry counters of signals that computed `uncommitted` during the running navigation. A
  // cancel or error ends that navigation without NavigationEnd, so only these signals compute again.
  const readDuringNavigation = new Set<WritableSignal<number>>();
  const subscription = router.events.subscribe((event) => {
    if (event instanceof NavigationEnd) {
      committedState = router.routerState;
      committedStates.add(committedState);
      readDuringNavigation.clear();
      navigation.update((value) => value + 1);
    } else if (event instanceof NavigationCancel || event instanceof NavigationError) {
      for (const retry of readDuringNavigation) {
        retry.update((value) => value + 1);
      }
      readDuringNavigation.clear();
    }
  });
  destroyRef.onDestroy(() => {
    subscription.unsubscribe();
    pendingWrite = null;
  });

  // Angular switches to the new router state and creates the new page before NavigationEnd. Until
  // then the cached value comes from the old state, so a read uses a per-signal copy of ValueCache
  // scoped to that RouterState. When that state commits, the copy replaces `values`; if activation
  // rolls back, the copy is discarded without mutating `values`.
  const uncommitted = Symbol();
  type CachedRead<T> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: unknown }
    | typeof uncommitted;
  // Errors compare by message, which is enough for the two errors a read throws: the inactive-route
  // error names the route, and the path-parameter error also contains the URL. A new error that a
  // read throws needs a message that names its cause, or a computed catching it won't rerun when
  // only the cause changes.
  const sameError = (a: unknown, b: unknown) =>
    Object.is(a, b) || (a instanceof Error && b instanceof Error && a.message === b.message);
  const routerSignal = <T>(
    readWith: (values: ValueCache) => T,
    equal: ValueEqualityFn<T>,
  ): Signal<T> => {
    let values: ValueCache = new Map();
    let lag: { state: RouterState; values: ValueCache } | undefined;
    let source: RouterState | undefined;
    const retry = signal(0);
    const promoteCommittedLag = () => {
      if (lag && committedStates.has(lag.state)) {
        values = lag.values;
        lag = undefined;
      }
    };
    const readLag = (state: RouterState, previous: CachedRead<T>): T => {
      promoteCommittedLag();
      if (lag?.state !== state) {
        lag = { state, values: new Map(values) };
      }
      const next = readWith(lag.values);
      const matchesPrevious =
        previous !== uncommitted && previous.ok && equal(previous.value, next);
      return matchesPrevious ? previous.value : next;
    };
    // Treating `uncommitted` as equal to the previous value prevents a spurious version bump during
    // activation, and comparing cached errors by message prevents inactive routes from rerunning
    // downstream computeds on unrelated navigations or cancels.
    const sameSignalValue = (a: CachedRead<T>, b: CachedRead<T>) => {
      if (b === uncommitted) {
        return true;
      }
      if (a === uncommitted) {
        return false;
      }
      if (a.ok && b.ok) {
        return equal(a.value, b.value);
      }
      return !a.ok && !b.ok && sameError(a.error, b.error);
    };
    const cached = computed<CachedRead<T>>(
      () => {
        navigation();
        retry();
        const state = router.routerState;
        if (state !== committedState) {
          source = undefined;
          readDuringNavigation.add(retry);
          return uncommitted;
        }
        promoteCommittedLag();
        if (lag && lag.state !== state) {
          lag = undefined;
        }
        source = state;
        try {
          return { ok: true, value: readWith(values) };
        } catch (error) {
          return { ok: false, error };
        }
      },
      { equal: sameSignalValue },
    );
    // Checked after each read, because reading the computed is what records `source`.
    const cacheIsCurrent = () => source === router.routerState;
    const current = () => {
      const result = cached();
      if (cacheIsCurrent() && result !== uncommitted) {
        if (result.ok) {
          return result.value;
        }
        throw result.error;
      }
      return readLag(router.routerState, result);
    };
    // Copy the computed's own properties, so Angular still treats the wrapper as a signal.
    return Object.assign(current, cached) as Signal<T>;
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

  const requireActiveRoute = (info: CompiledRoute): ActivatedRouteSnapshot => {
    const active = findActiveRoute(router.routerState.snapshot.root, info);
    if (!active) {
      throw new Error(
        `${info.label}: route '${info.pattern}' isn't active, so it has no params to read. Check ifActive() first.`,
      );
    }
    return active;
  };

  const readCurrent = (info: CompiledRoute, values?: ValueCache) =>
    readActiveState(info, requireActiveRoute(info), values);

  interface PendingQueryWrite {
    // The exact UrlTree passed to Angular, matched against currentNavigation().initialUrl.
    readonly tree: UrlTree;
    readonly url: string;
    readonly pushHistory: boolean;
    readonly result: Promise<boolean>;
    carryBy: (next: Promise<boolean>) => void;
  }
  let pendingWrite: PendingQueryWrite | null = null;

  // A patch changes only the fields you pass. One made while another patch runs starts from where
  // that patch is going, so patches add up, and the later one wins on a field they share.
  const patchQuery = (
    info: CompiledRoute,
    patch: Partial<AnyRecord>,
    options?: NavigateOptions,
  ): Promise<boolean> => {
    requireActiveRoute(info);
    const running = router.currentNavigation();
    const activePending =
      running !== null && pendingWrite !== null && running.initialUrl === pendingWrite.tree
        ? pendingWrite
        : null;
    // A navigation no patch started is the user's, like a link or Back, so a patch gives way to it.
    if (running !== null && activePending === null) {
      pendingWrite = null;
      return Promise.resolve(false);
    }
    // Each read of router.url serializes the whole URL, so read it once.
    const currentUrl = router.url;
    const tree = router.parseUrl(activePending?.url ?? currentUrl);
    for (const param of info.queryParams) {
      const value = patch[param.name];
      if (value === undefined) {
        continue;
      }
      const output = serializeQuery(param, value);
      if (output === null) {
        delete tree.queryParams[param.name];
      } else {
        tree.queryParams[param.name] = output;
      }
    }
    const target = router.serializeUrl(tree);
    if (activePending) {
      if (target === activePending.url) {
        return activePending.result;
      }
    } else if (target === currentUrl) {
      return Promise.resolve(true);
    }
    // The navigation carries the running patch, so it adds the history entry that patch asked for.
    // Its other options are this patch's.
    const carriesPush = activePending?.pushHistory ?? false;
    const extras: NavigateOptions = {
      ...options,
      ...(carriesPush ? { replaceUrl: false } : {}),
      // Angular skips a navigation to the current URL and resolves false, as for a decline. With
      // onSameUrlNavigation: 'reload' it still overtakes the running patch and resolves true.
      ...(target === currentUrl ? { onSameUrlNavigation: 'reload' as const } : {}),
    };
    let carried: Promise<boolean> | undefined;
    const result = router.navigateByUrl(tree, extras).then((done) => done || (carried ?? false));
    const nextPending: PendingQueryWrite = {
      tree,
      url: target,
      pushHistory: !extras.replaceUrl,
      result,
      carryBy: (next) => {
        carried = next;
      },
    };
    pendingWrite = nextPending;
    activePending?.carryBy(result);
    const clearPending = () => {
      if (pendingWrite === nextPending) {
        pendingWrite = null;
      }
    };
    void result.then(clearPending, clearPending);
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
    const queryByName = new Map(info.queryParams.map((param) => [param.name, param]));
    const defaults = Object.fromEntries(
      info.queryParams.map((param) => [
        param.name,
        param.definition.hasDefault ? param.definition.defaultValue : null,
      ]),
    );
    querySupportByNode.set(node, {
      defaults,
      sameValue: (name, a, b) => {
        const param = queryByName.get(name);
        return param ? sameQueryValue(param, a, b) : Object.is(a, b);
      },
      readIfActive: () => (active() ? params().query : undefined),
    });
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
