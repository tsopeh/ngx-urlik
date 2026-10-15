import { EnvironmentInjector, inject, InjectionToken, runInInjectionContext } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  convertToParamMap,
  ParamMap,
  RedirectCommand,
  Router,
  RunGuardsAndResolvers,
  UrlMatcher,
  UrlSegment,
} from '@angular/router';
import type { CompiledRoute, RuntimeParam } from './compiled-route';
import { activePathParams, getPrimaryActiveChain } from './compiled-route';
import { isEqual } from './is-equal';
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

  /** Persisted query fields of the active chain whose URL value is missing or fails to decode. */
  const pendingQuery = (root: ActivatedRouteSnapshot) => {
    const active = activeCompiledRoute(root);
    if (!active) return undefined;
    const params = active.info.queryParams.filter((param) => {
      const persist = persistOf(param);
      if (!persist || !storage.available(persist.storage)) return false;
      const raw = root.queryParamMap.getAll(param.name).at(-1);
      return raw === undefined || !decodes(param, raw);
    });
    return params.length ? { ...active, params } : undefined;
  };

  return {
    /** The stored value of a persisted field, decoded, or `undefined`. */
    restore(param: RuntimeParam, path: ParamMap): unknown {
      const raw = readStored(param, path);
      return typeof raw === 'string' ? param.definition.codec.deserialize(raw) : undefined;
    },

    needsQueryRestore: (root: ActivatedRouteSnapshot) => !!pendingQuery(root),

    /** URL text for each persisted query field to fill: the stored value, else the default. */
    queryFills(root: ActivatedRouteSnapshot): Record<string, string> | undefined {
      const pending = pendingQuery(root);
      if (!pending) return undefined;
      const path = activePathParams(pending.info, pending.snapshot);
      const fills: Record<string, string> = {};
      for (const param of pending.params) {
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
      return Object.keys(fills).length ? fills : undefined;
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

/** Fills persisted query fields from storage, else from their defaults, in one redirect. */
export function restoreQueryGuard(token: PersistenceToken): CanActivateFn {
  return (_route, state) => {
    const fills = inject(token).queryFills(state.root);
    if (!fills) return true;
    const router = inject(Router);
    const tree = router.parseUrl(state.url);
    tree.queryParams = { ...tree.queryParams, ...fills };
    return new RedirectCommand(tree);
  };
}

/**
 * Angular skips guards of a reused route unless `runGuardsAndResolvers` says otherwise. Keep the
 * route's own rule, and also run them when a persisted query field needs restoring.
 */
export function runGuardsWhenRestoring(
  token: PersistenceToken,
  mode: RunGuardsAndResolvers | undefined,
): RunGuardsAndResolvers {
  return (from, to) => inject(token).needsQueryRestore(to.root) || shouldRun(mode, from, to);
}

const samePath = (a: readonly UrlSegment[], b: readonly UrlSegment[]) =>
  a.length === b.length && a.every((segment, index) => segment.path === b[index].path);
const sameSegments = (a: readonly UrlSegment[], b: readonly UrlSegment[]) =>
  samePath(a, b) && a.every((segment, index) => isEqual(segment.parameters, b[index].parameters));
const sameParamsAndSegments = (a: ActivatedRouteSnapshot, b: ActivatedRouteSnapshot): boolean =>
  isEqual(a.params, b.params) &&
  sameSegments(a.url, b.url) &&
  !a.parent === !b.parent &&
  (!a.parent || sameParamsAndSegments(a.parent, b.parent!));

// The same rules as Angular's `shouldRunGuardsAndResolvers()`.
function shouldRun(
  mode: RunGuardsAndResolvers | undefined,
  from: ActivatedRouteSnapshot,
  to: ActivatedRouteSnapshot,
): boolean {
  if (typeof mode === 'function') return mode(from, to);
  switch (mode) {
    case 'pathParamsChange':
      return !samePath(from.url, to.url);
    case 'pathParamsOrQueryParamsChange':
      return !samePath(from.url, to.url) || !isEqual(from.queryParams, to.queryParams);
    case 'always':
      return true;
    case 'paramsOrQueryParamsChange':
      return !sameParamsAndSegments(from, to) || !isEqual(from.queryParams, to.queryParams);
    default:
      return !sameParamsAndSegments(from, to);
  }
}
