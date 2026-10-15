import { EnvironmentInjector, inject, InjectionToken, runInInjectionContext } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  CanMatchFn,
  convertToParamMap,
  ParamMap,
  PRIMARY_OUTLET,
  RedirectCommand,
  Router,
  RunGuardsAndResolvers,
  UrlSegment,
  UrlSegmentGroup,
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

/** Browser storage behind try/catch. `undefined` from a read means the storage is unavailable. */
function createStorageAccess(browser: boolean) {
  const get = (kind: PersistOptions['storage']): Storage | null => {
    if (!browser) return null;
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
  const storage = createStorageAccess(browser);
  const { serializeQuery } = createParameterSerializer(injector, report);

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
    /** The stored URL text of a persisted value if it decodes. */
    storedText: (param: RuntimeParam, path: ParamMap): string | undefined =>
      readStored(param, path) ?? undefined,

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
 * Matches a URL that lacks `missing`, the persisted trailing placeholders of `info`, when each of
 * them is stored, and redirects to the URL with the stored values appended. Otherwise the route
 * does not match and Angular tries the next one.
 */
export function restorePathGuard(
  token: PersistenceToken,
  info: CompiledRoute,
  missing: readonly RuntimeParam[],
): CanMatchFn {
  return () => {
    const router = inject(Router);
    const persistence = inject(token);
    // canMatch sees only segments below its parent, so read ancestor values from the whole URL.
    // After an earlier redirect in the same navigation this URL is stale, and nothing is restored.
    const url = router.currentNavigation()?.extractedUrl;
    if (!url) return false;
    const groups: UrlSegmentGroup[] = [];
    for (let group: UrlSegmentGroup | undefined = url.root; group;) {
      groups.push(group);
      group = group.children[PRIMARY_OUTLET];
    }
    const segments = groups.flatMap((group) => group.segments);
    const known = info.fullSegments.slice(0, info.fullSegments.length - missing.length);
    if (
      segments.length !== known.length ||
      known.some((segment, i) => segment.kind === 'static' && segment.value !== segments[i].path)
    )
      return false;
    const path: Record<string, string> = {};
    known.forEach((segment, i) => {
      if (segment.kind === 'param') path[segment.name] = segments[i].path;
    });
    for (const param of missing) {
      const text = persistence.storedText(param, convertToParamMap(path));
      if (text === undefined) return false;
      path[param.name] = text;
    }
    const tree = router.parseUrl(router.serializeUrl(url));
    let last = tree.root;
    while (last.children[PRIMARY_OUTLET]) last = last.children[PRIMARY_OUTLET];
    if (last === tree.root) {
      last = new UrlSegmentGroup([], {});
      tree.root.children[PRIMARY_OUTLET] = last;
    }
    last.segments.push(...missing.map((param) => new UrlSegment(path[param.name], {})));
    return new RedirectCommand(tree);
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
