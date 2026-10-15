import { EnvironmentInjector, inject, InjectionToken, runInInjectionContext } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanMatchFn,
  convertToParamMap,
  ParamMap,
  PRIMARY_OUTLET,
  RedirectCommand,
  Router,
  UrlMatcher,
  UrlSegment,
  UrlSegmentGroup,
  UrlTree,
} from '@angular/router';
import type { CompiledRoute, RuntimeParam } from './compiled-route';
import { activePathParams, getPrimaryActiveChain } from './compiled-route';
import type { PersistOptions, UrlParamCodec } from './params';
import { ReportParameterFailure, WarnDiagnostic } from './route-diagnostics';
import { createParameterSerializer } from './route-params-runtime';
import { routeConfigBrand } from './route-symbols';

export const defaultPersistencePrefix = 'ngx-urlik:';

export type Persistence = ReturnType<typeof createPersistence>;
export type PersistenceToken = InjectionToken<Persistence>;

export const persistOf = (param: RuntimeParam): PersistOptions | undefined =>
  (param.definition as { persist?: PersistOptions }).persist;

const decodes = (param: RuntimeParam, raw: string): boolean => {
  try {
    const value = (param.definition.codec as UrlParamCodec<unknown>).deserialize(raw);
    return value !== null && value !== undefined;
  } catch {
    return false;
  }
};

/**
 * Decides whether a route matcher may read storage. Angular calls matchers outside an injection
 * context, so they cannot ask for `PLATFORM_ID`. Every injector that provides the router registers
 * its platform. Reads are allowed after a browser registers and as long as no server has. A
 * server process registers only servers, so a request can never turn reads on for another.
 */
export function createStorageGate() {
  let browser = false;
  let server = false;
  return {
    register(isBrowser: boolean): void {
      if (isBrowser) browser = true;
      else server = true;
    },
    open: (): boolean => browser && !server && typeof window !== 'undefined',
  };
}

export type StorageGate = ReturnType<typeof createStorageGate>;

/** Browser storage behind try/catch. `undefined` from a read means the storage is unavailable. */
function createStorageAccess(browser: () => boolean) {
  const get = (kind: PersistOptions['storage']): Storage | null => {
    if (!browser()) return null;
    try {
      return (kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage) ?? null;
    } catch {
      return null;
    }
  };
  return {
    available: (kind: PersistOptions['storage']) => get(kind) !== null,
    read(kind: PersistOptions['storage'], key: string): string | null | undefined {
      try {
        const store = get(kind);
        return store ? store.getItem(key) : undefined;
      } catch {
        return undefined;
      }
    },
    removeWhere(kind: PersistOptions['storage'], matches: (key: string) => boolean): void {
      try {
        const store = get(kind);
        if (!store) return;
        const keys = Array.from({ length: store.length }, (_, i) => store.key(i));
        for (const key of keys) if (key !== null && matches(key)) store.removeItem(key);
      } catch {
        // Clearing is best effort, like saving.
      }
    },
    write(kind: PersistOptions['storage'], key: string, value: string): void {
      try {
        get(kind)?.setItem(key, value);
      } catch {
        // Quota and privacy errors leave the stored value unchanged.
      }
    },
  };
}

type StorageAccess = ReturnType<typeof createStorageAccess>;

/** Storage keys and stored-value reads shared by the router instance and the path matchers. */
function createStoredValues(
  prefix: string,
  report: ReportParameterFailure,
  storage: StorageAccess,
) {
  /** `${prefix}${key}`, followed by each scoped path value when the field has a scope. */
  const storageKey = (persist: PersistOptions, path: ParamMap): string | undefined => {
    const values = (persist.scope ?? []).map((name) => path.get(name));
    if (values.some((value) => value === null)) return undefined;
    return [prefix + persist.key, ...values.map((value) => encodeURIComponent(value!))].join(':');
  };

  /**
   * Returns the stored URL text if it decodes, `null` when nothing usable is stored, and
   * `undefined` when the storage is unavailable.
   */
  const readStored = (param: RuntimeParam, path: ParamMap): string | null | undefined => {
    const persist = persistOf(param)!;
    const key = storageKey(persist, path);
    if (key === undefined) return null;
    const raw = storage.read(persist.storage, key);
    if (raw === null || raw === undefined || decodes(param, raw)) return raw;
    report(
      param,
      { code: 'STORED_VALUE_DESERIALIZE_FAILED', operation: 'deserialize', key },
      `stored under '${key}' was invalid`,
    );
    return null;
  };

  return { storageKey, readStored };
}

/** Reads stored path values for the generated restore routes, without an injection context. */
export function createPathRestoreReader(
  prefix: string,
  report: ReportParameterFailure,
  gate: StorageGate,
) {
  const { readStored } = createStoredValues(prefix, report, createStorageAccess(gate.open));
  return (param: RuntimeParam, path: ParamMap): string | undefined =>
    readStored(param, path) ?? undefined;
}

export type PathRestoreReader = ReturnType<typeof createPathRestoreReader>;

/** The deepest compiled route of the primary chain and its snapshot. */
function activeCompiledRoute(root: ActivatedRouteSnapshot) {
  const chain = getPrimaryActiveChain(root);
  for (let i = chain.length - 1; i >= 0; i--) {
    const info = (chain[i].routeConfig as Record<PropertyKey, unknown> | null)?.[
      routeConfigBrand
    ] as CompiledRoute | undefined;
    if (info) return { info, snapshot: chain[i] };
  }
  return undefined;
}

export type ClearPersistedOptions = {
  readonly local?: boolean | readonly string[];
  readonly session?: boolean | readonly string[];
};

export function createPersistence(
  prefix: string,
  persistKeys: ReadonlySet<string>,
  report: ReportParameterFailure,
  warn: WarnDiagnostic,
  browser: boolean,
  injector: EnvironmentInjector,
) {
  const storage = createStorageAccess(() => browser);
  const { storageKey, readStored } = createStoredValues(prefix, report, storage);
  const { serializeQuery } = createParameterSerializer(injector, report);

  // The segments each route of the primary chain consumed in the navigation being matched.
  let matchedNavigation = -1;
  const matched: (readonly UrlSegment[])[] = [];

  return {
    /** The stored value of a persisted field, decoded, or `undefined`. */
    restore(param: RuntimeParam, path: ParamMap): unknown {
      const raw = readStored(param, path);
      return typeof raw === 'string' ? param.definition.codec.deserialize(raw) : undefined;
    },

    /** Records the segments a route at `depth` of the primary chain consumed. */
    recordMatch(navigation: number, depth: number, url: readonly UrlSegment[]): void {
      if (navigation !== matchedNavigation) {
        matchedNavigation = navigation;
        matched.length = 0;
      }
      matched.length = depth;
      matched[depth] = url;
    },

    /** The segments that the routes above `depth` consumed, if each of them recorded its match. */
    matchedAbove(navigation: number, depth: number): UrlSegment[] | undefined {
      if (navigation !== matchedNavigation) return undefined;
      const above = matched.slice(0, depth);
      return above.length === depth && above.every(Boolean) ? above.flat() : undefined;
    },

    /**
     * URL text for each persisted query field of `info` whose value in `query` is missing or fails
     * to decode: the stored value, else the default. Skips fields whose storage is unavailable.
     */
    queryFills(info: CompiledRoute, path: ParamMap, query: ParamMap): Record<string, string> {
      const fills: Record<string, string> = {};
      for (const param of info.queryParams) {
        const persist = persistOf(param);
        if (!persist || !storage.available(persist.storage)) continue;
        const raw = query.getAll(param.name).at(-1);
        if (raw !== undefined && decodes(param, raw)) continue;
        const stored = readStored(param, path);
        if (stored === undefined) continue;
        const definition = param.definition as { defaultValue?: unknown };
        const text =
          stored ??
          serializeQuery(
            param,
            typeof definition.defaultValue === 'function'
              ? runInInjectionContext(injector, definition.defaultValue as () => unknown)
              : definition.defaultValue,
          );
        if (typeof text === 'string') fills[param.name] = text;
      }
      return fills;
    },

    /** Removes stored values: every prefixed key, or the listed keys with all of their scopes. */
    clear(options: ClearPersistedOptions = { local: true, session: true }): void {
      for (const kind of ['local', 'session'] as const) {
        const selection = options[kind];
        if (!selection) continue;
        if (selection !== true)
          for (const key of selection)
            if (!persistKeys.has(key))
              warn({
                code: 'UNKNOWN_PERSIST_KEY',
                key,
                message: `clearPersisted(): no route persists the key '${key}'`,
              });
        storage.removeWhere(kind, (stored) =>
          selection === true
            ? stored.startsWith(prefix)
            : selection.some(
                (key) => stored === prefix + key || stored.startsWith(`${prefix}${key}:`),
              ),
        );
      }
    },

    /** Saves the committed URL text of every persisted field of the active chain. */
    save(root: ActivatedRouteSnapshot): void {
      const active = activeCompiledRoute(root);
      if (!active) return;
      const path = activePathParams(active.info, active.snapshot);
      for (const param of [...active.info.pathParams, ...active.info.queryParams]) {
        const persist = persistOf(param);
        const raw =
          param.placement === 'path'
            ? (path.get(param.name) ?? undefined)
            : root.queryParamMap.getAll(param.name).at(-1);
        if (!persist || raw === undefined || !decodes(param, raw)) continue;
        const key = storageKey(persist, path);
        if (key !== undefined) storage.write(persist.storage, key, raw);
      }
    },
  };
}

/**
 * Matches the path of `info` without `missing`, its persisted trailing placeholders, when each of
 * them is stored. The match supplies the stored values as positional parameters, so a `redirectTo`
 * with the full path fills them in. Otherwise the route does not match and Angular tries the next.
 */
export function restorePathMatcher(
  info: CompiledRoute,
  missing: readonly RuntimeParam[],
  read: PathRestoreReader,
): UrlMatcher {
  const own = info.segments;
  const kept = info.fullSegments
    .slice(info.fullSegments.length - own.length)
    .slice(0, -missing.length);
  const ancestorCount = info.fullSegments.length - own.length;
  return (segments, group) => {
    if (group.hasChildren() || segments.length !== kept.length) return null;
    // Angular passes the segments left at this level. The segments before them in the group, and
    // in the groups above it, are the ones the ancestors consumed.
    const ancestors = group.segments.slice(0, group.segments.length - segments.length);
    for (let parent = group.parent; parent; parent = parent.parent)
      ancestors.unshift(...parent.segments);
    if (ancestors.length !== ancestorCount) return null;
    const path: Record<string, string> = {};
    info.fullSegments.slice(0, ancestorCount).forEach((segment, i) => {
      if (segment.kind === 'param') path[segment.name] = ancestors[i].path;
    });
    const posParams: Record<string, UrlSegment> = {};
    for (const [i, segment] of kept.entries()) {
      if (segment.kind === 'static') {
        if (segment.value !== segments[i].path) return null;
      } else {
        if (!decodes(segment.param, segments[i].path)) return null;
        path[segment.name] = segments[i].path;
        posParams[segment.name] = segments[i];
      }
    }
    for (const param of missing) {
      const text = read(param, convertToParamMap(path));
      if (text === undefined) return null;
      path[param.name] = text;
      posParams[param.name] = new UrlSegment(text, {});
    }
    return { consumed: segments, posParams };
  };
}

/**
 * The `canMatch` check that ngx-urlik appends to each route of a chain with persisted query
 * fields, and to the ancestors of such routes. Angular runs `canMatch` on every navigation, also
 * for a route it will reuse, but runs an ancestor's check before its children match. So every
 * route records the segments it consumed, and only the route that ends the match fills the
 * persisted fields of its chain: it redirects to the matched URL with every field that is missing
 * or fails to decode filled in at once.
 */
export function restoreQueryCheck(
  token: PersistenceToken,
  info: CompiledRoute,
  options: {
    /** The number of compiled routes above this one. */
    readonly depth: number;
    /** False when a child with an empty or wildcard path continues the match. */
    readonly endsMatch: boolean;
    /** Whether the route's chain declares a persisted query field. */
    readonly restores: boolean;
    /** The route's own path-codec check, so a route that does not match records nothing. */
    readonly codecsMatch: (segments: readonly UrlSegment[]) => boolean;
  },
): CanMatchFn {
  return (_route, segments, current) => {
    if (current.outlet !== PRIMARY_OUTLET || !options.codecsMatch(segments)) return true;
    const router = inject(Router);
    const navigation = router.currentNavigation();
    if (!navigation) return true;
    const persistence = inject(token);
    persistence.recordMatch(navigation.id, options.depth, current.url);
    if (!options.restores || !options.endsMatch || segments.length !== current.url.length)
      return true;
    const above = persistence.matchedAbove(navigation.id, options.depth);
    if (!above) return true;
    const path = [...above, ...segments];
    const values: Record<string, string> = {};
    if (path.length === info.fullSegments.length)
      info.fullSegments.forEach((segment, i) => {
        if (segment.kind === 'param') values[segment.name] = path[i].path;
      });
    const fills = persistence.queryFills(info, convertToParamMap(values), current.queryParamMap);
    if (!Object.keys(fills).length) return true;
    const tree = matchedUrl(router, navigation.extractedUrl, path);
    if (!tree) return true;
    tree.queryParams = { ...current.queryParams, ...fills };
    tree.fragment = current.fragment;
    return new RedirectCommand(tree);
  };
}

/**
 * The URL whose primary path is `path`. Earlier redirects in the navigation may have changed the
 * path since `extracted`, so a URL with only a primary path is rebuilt from `path`. A URL with
 * named outlets is kept only if its primary path still equals `path`.
 */
function matchedUrl(router: Router, extracted: UrlTree, path: UrlSegment[]): UrlTree | undefined {
  const primary: UrlSegment[] = [];
  let outlets = false;
  const visit = (group: UrlSegmentGroup, onPrimary: boolean) => {
    if (onPrimary) primary.push(...group.segments);
    for (const [outlet, child] of Object.entries(group.children)) {
      if (outlet !== PRIMARY_OUTLET) outlets = true;
      visit(child, onPrimary && outlet === PRIMARY_OUTLET);
    }
  };
  visit(extracted.root, true);
  if (!outlets)
    return new UrlTree(
      new UrlSegmentGroup(
        [],
        path.length ? { [PRIMARY_OUTLET]: new UrlSegmentGroup(path, {}) } : {},
      ),
    );
  const same =
    primary.length === path.length && primary.every((segment, i) => segment.path === path[i].path);
  return same ? router.parseUrl(router.serializeUrl(extracted)) : undefined;
}
