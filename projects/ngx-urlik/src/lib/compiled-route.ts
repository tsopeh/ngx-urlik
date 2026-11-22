import {
  ActivatedRouteSnapshot,
  convertToParamMap,
  ParamMap,
  Route,
  Routes,
  UrlSegment,
} from '@angular/router';
import type { AnyQueryParamDefinition, UrlParamCodec } from './params';
import { isConverted, stringCodec } from './params';
import {
  isCodec,
  isQueryDefinition,
  isRecord,
  parseRoutePath,
  RouteDefinition,
  RouteDefinitions,
} from './route-definition';
import { compiledRouteKey } from './route-symbols';

interface CompiledParamBase {
  readonly name: string;
  readonly codec: UrlParamCodec<unknown>;
  readonly owner: Pick<CompiledRoute, 'label'>;
}
export interface CompiledPathParam extends CompiledParamBase {
  readonly placement: 'path';
}
export interface CompiledQueryParam extends CompiledParamBase {
  readonly placement: 'query';
  readonly definition: AnyQueryParamDefinition;
}
export type CompiledParam = CompiledPathParam | CompiledQueryParam;

export const compileQueryParam = (
  name: string,
  definition: AnyQueryParamDefinition,
  owner: Pick<CompiledRoute, 'label'>,
): CompiledQueryParam => ({
  name,
  codec: definition.codec,
  definition,
  owner,
  placement: 'query',
});

export interface CompiledRoute {
  readonly routeName?: string;
  // The route's name in errors: its routeName, or its position, such as `routes[0].children[1]`.
  readonly label: string;
  readonly pathParams: readonly CompiledPathParam[];
  readonly queryParams: readonly CompiledQueryParam[];
  readonly fullSegments: readonly (
    { kind: 'static'; value: string } | { kind: 'param'; name: string; param: CompiledPathParam }
  )[];
  readonly pattern: string;
}

const defaultPathCodec = stringCodec();
const isRoute = (value: unknown): value is RouteDefinition => isRecord(value);

/**
 * Checks and compiles the route tree in one top-down pass, parsing each checked path once.
 * Throws one error listing every problem in named routes, routes above them, and routes with
 * `pathParams` or `queryParams`, plus any unused `routeNames` member.
 */
export function compileRoutes(
  definitions: RouteDefinitions,
  routeNames: Readonly<Record<string, string>>,
): {
  readonly routes: Routes;
  readonly namedRoutes: ReadonlyMap<string, CompiledRoute>;
} {
  const fail = (problems: readonly string[]): never => {
    throw new Error(`defineAppRouter() found problems:\n- ${problems.join('\n- ')}`);
  };
  if (!isRecord(routeNames)) {
    fail(['pass your route names enum as the first argument']);
  }
  if (!Array.isArray(definitions)) {
    fail(['routes must be an array']);
  }

  // One bottom-up O(N) scan records which subtrees contain a named route or ngx-urlik fields, so
  // the top-down validate-and-compile pass never re-walks children.
  const hasNamed = new WeakSet<RouteDefinition>();
  const usesLibrary = new WeakSet<RouteDefinition>();
  const markSubtree = (route: RouteDefinition): { named: boolean; library: boolean } => {
    let named = 'routeName' in route;
    let library = 'pathParams' in route || 'queryParams' in route;
    if (Array.isArray(route.children)) {
      for (const child of route.children) {
        if (isRoute(child)) {
          const childFlags = markSubtree(child);
          named ||= childFlags.named;
          library ||= childFlags.library;
        }
      }
    }
    if (named) {
      hasNamed.add(route);
    }
    if (library) {
      usesLibrary.add(route);
    }
    return { named, library };
  };
  for (const route of definitions) {
    if (isRoute(route)) {
      markSubtree(route);
    }
  }

  const declaredNames = new Set(Object.values(routeNames));
  const usedNames = new Map<string, string>();
  const errors: string[] = [];
  const namedRoutes = new Map<string, CompiledRoute>();

  const compile = (
    siblings: RouteDefinitions,
    parent: CompiledRoute | undefined,
    location: string,
    pathOwners: ReadonlyMap<string, string>,
    queryOwners: ReadonlyMap<string, string>,
  ): Routes => {
    const compiled: Route[] = [];
    siblings.forEach((route, index) => {
      const at = `${location}[${index}]`;
      if (!isRoute(route)) {
        errors.push(`${at} must be a route object`);
        return;
      }
      const { routeName, pathParams, queryParams, children, ...angularFields } = route;
      const angularRoute: Route = { ...angularFields };

      const readByName = hasNamed.has(route);
      const checked = readByName || usesLibrary.has(route);
      if (!checked) {
        if (Array.isArray(children)) {
          angularRoute.children = compile(
            children,
            parent,
            `${at}.children`,
            pathOwners,
            queryOwners,
          );
        } else if (children !== undefined) {
          angularRoute.children = children as unknown as Routes;
        }
        compiled.push(angularRoute);
        return;
      }

      const named = 'routeName' in route;
      const hasUsableName = named && typeof routeName === 'string';
      const label = hasUsableName ? routeName : at;
      const report = (message: string) => errors.push(`${label}: ${message}`);

      if (named) {
        const usableName = typeof routeName === 'string' && routeName.trim() !== '';
        if (!usableName) {
          errors.push(`${at}: routeName must be a non-empty string`);
          return;
        }
        const previous = usedNames.get(routeName);
        if (previous) {
          errors.push(
            `routeName '${routeName}' is used by both ${previous} and ${at}. Give each route its own routeName.`,
          );
        } else {
          usedNames.set(routeName, at);
        }
        if (!declaredNames.has(routeName)) {
          errors.push(
            `routeName '${routeName}' at ${at} isn't in the route names passed to defineAppRouter(). Add it to the enum.`,
          );
        }
        const redirectWildcardOrMatcher =
          route.redirectTo !== undefined || route.path === '**' || Boolean(route.matcher);
        if (redirectWildcardOrMatcher) {
          report("redirects, wildcards, and matchers can't have a routeName");
        }
      }

      const disallowedLoadChildren = Boolean(route.loadChildren) && readByName;
      if (disallowedLoadChildren) {
        report(
          named
            ? "a named route can't use loadChildren"
            : "it's above a named route, so it can't use loadChildren",
        );
      }

      const plainPath = !(
        route.matcher ||
        route.path === undefined ||
        route.redirectTo !== undefined ||
        route.path === '**' ||
        (route.outlet && route.outlet !== 'primary')
      );
      const needsPlainPath = (readByName || pathParams !== undefined) && !plainPath;
      if (needsPlainPath) {
        report('needs a plain path in the primary outlet');
      }
      const parsed = parseRoutePath(plainPath ? (route.path as string) : '');
      for (const error of parsed.errors) {
        report(error);
      }

      const pathParamMap = isRecord(pathParams) ? pathParams : undefined;
      if (pathParams !== undefined) {
        if (!pathParamMap) {
          report('pathParams must map each placeholder name to its codec');
        } else {
          for (const [name, codec] of Object.entries(pathParamMap)) {
            if (!parsed.placeholders.includes(name)) {
              report(`pathParams.${name} isn't a placeholder in the path`);
            }
            if (!isCodec(codec)) {
              report(`pathParams.${name} must be a codec`);
            }
          }
        }
      }

      const ownPathOwners = new Map(pathOwners);
      for (const name of parsed.placeholders) {
        const previous = ownPathOwners.get(name);
        if (previous !== undefined) {
          report(
            `path parameter '${name}' appears in both '${previous}' and '${route.path}'. Rename one, because params().path has one value per name.`,
          );
        } else {
          ownPathOwners.set(name, route.path ?? '');
        }
      }

      const ownQueryOwners = new Map(queryOwners);
      const queryParamMap = isRecord(queryParams) ? queryParams : undefined;
      const unreadQueryParams = queryParams !== undefined && !readByName;
      if (unreadQueryParams) {
        report(
          'no named route at or below it reads queryParams. Add a routeName, or remove queryParams.',
        );
      } else if (queryParams !== undefined) {
        if (!queryParamMap) {
          report('queryParams must be an object');
        } else {
          for (const [name, definition] of Object.entries(queryParamMap)) {
            if (!isQueryDefinition(definition)) {
              report(`query parameter '${name}' must come from queryParam()`);
            }
            const previous = ownQueryOwners.get(name);
            if (previous !== undefined) {
              report(
                `query parameter '${name}' is defined in both '${previous}' and '${route.path}'. Define it once.`,
              );
            } else {
              ownQueryOwners.set(name, route.path ?? '');
            }
          }
        }
      }

      const owner = { label };
      const codecOf = (name: string): UrlParamCodec<unknown> | undefined => {
        const candidate = pathParamMap?.[name];
        return isCodec(candidate) ? candidate : undefined;
      };
      const ownPath = parsed.placeholders.map((name): CompiledPathParam => ({
        name,
        codec: codecOf(name) ?? defaultPathCodec,
        owner,
        placement: 'path',
      }));
      const localSegments = parsed.segments.map((segment) =>
        segment.kind === 'static'
          ? segment
          : { ...segment, param: ownPath.find((param) => param.name === segment.name)! },
      );
      const compiledQueries: CompiledQueryParam[] = [];
      if (queryParamMap) {
        for (const [name, def] of Object.entries(queryParamMap)) {
          if (isQueryDefinition(def)) {
            compiledQueries.push(compileQueryParam(name, def, owner));
          }
        }
      }
      const info: CompiledRoute = {
        routeName: hasUsableName ? routeName : undefined,
        label,
        pathParams: [...(parent?.pathParams ?? []), ...ownPath],
        queryParams: [...(parent?.queryParams ?? []), ...compiledQueries],
        fullSegments: [...(parent?.fullSegments ?? []), ...localSegments],
        pattern: [parent?.pattern, route.path].filter(Boolean).join('/'),
      };

      const codecs = parsed.segments.map((segment) =>
        segment.kind === 'param' ? codecOf(segment.name) : undefined,
      );
      if (codecs.some(Boolean)) {
        angularRoute.canMatch = [matchPathCodecs(codecs), ...(angularRoute.canMatch ?? [])];
      }
      (angularRoute as Record<PropertyKey, unknown>)[compiledRouteKey] = info;
      if (hasUsableName) {
        namedRoutes.set(routeName, info);
      }

      if (children !== undefined) {
        if (!Array.isArray(children)) {
          report('children must be an array');
        } else {
          angularRoute.children = compile(
            children,
            info,
            `${at}.children`,
            ownPathOwners,
            ownQueryOwners,
          );
        }
      }
      compiled.push(angularRoute);
    });
    return compiled;
  };

  const routes = compile(definitions, undefined, 'routes', new Map(), new Map());
  for (const [member, routeName] of Object.entries(routeNames)) {
    if (!usedNames.has(routeName)) {
      errors.push(
        `RouteNames.${member} has no route. Give a route routeName: '${routeName}', or remove the member.`,
      );
    }
  }
  if (errors.length) {
    fail(errors);
  }
  return { routes, namedRoutes };
}

/** Rejects a match whose path parameters don't decode, so Angular tries the next route. */
function matchPathCodecs(
  codecs: readonly (UrlParamCodec<unknown> | undefined)[],
): (_route: unknown, segments: readonly UrlSegment[]) => boolean {
  return (_route, segments) =>
    codecs.every((codec, index) => {
      if (!codec) {
        return true;
      }
      const segment = segments[index];
      if (!segment) {
        return false;
      }
      try {
        return isConverted(codec.deserialize(segment.path));
      } catch {
        return false;
      }
    });
}

// Keyed by root snapshot. A router state has one snapshot tree, so its chain and active routes are
// computed once and shared by every signal.
const chains = new WeakMap<ActivatedRouteSnapshot, readonly ActivatedRouteSnapshot[]>();
const activeRoutes = new WeakMap<
  ActivatedRouteSnapshot,
  ReadonlyMap<CompiledRoute, ActivatedRouteSnapshot>
>();

const primaryChild = (snapshot: ActivatedRouteSnapshot) =>
  snapshot.children.find((child) => child.outlet === 'primary');

/** The snapshots from the root down through the primary outlet. */
export function getPrimaryActiveChain(
  root: ActivatedRouteSnapshot,
): readonly ActivatedRouteSnapshot[] {
  let chain = chains.get(root);
  if (!chain) {
    const snapshots = [root];
    for (let child = primaryChild(root); child; child = primaryChild(child)) {
      snapshots.push(child);
    }
    chain = snapshots;
    chains.set(root, chain);
  }
  return chain;
}

/** The snapshot where `target` is active, or `null` if it isn't. */
export function findActiveRoute(
  root: ActivatedRouteSnapshot,
  target: CompiledRoute,
): ActivatedRouteSnapshot | null {
  let active = activeRoutes.get(root);
  if (!active) {
    const routes = new Map<CompiledRoute, ActivatedRouteSnapshot>();
    for (const snapshot of getPrimaryActiveChain(root)) {
      const info = compiledRouteOf(snapshot);
      const firstMatch = info !== undefined && !routes.has(info);
      if (firstMatch) {
        routes.set(info, snapshot);
      }
    }
    active = routes;
    activeRoutes.set(root, active);
  }
  return active.get(target) ?? null;
}

/** The compiled route an Angular snapshot came from, if ngx-urlik compiled it. */
const compiledRouteOf = (snapshot: ActivatedRouteSnapshot): CompiledRoute | undefined =>
  (snapshot.routeConfig as Record<PropertyKey, unknown> | null)?.[compiledRouteKey] as
    CompiledRoute | undefined;

export function findLastResult<T, R>(
  items: readonly T[],
  mapper: (item: T) => R | null | undefined,
): R | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const result = mapper(items[i]);
    const found = result !== null && result !== undefined;
    if (found) {
      return result;
    }
  }
  return undefined;
}

export function activePathParams(target: CompiledRoute, active: ActivatedRouteSnapshot): ParamMap {
  const path: Record<string, string> = {};
  for (const param of target.pathParams) {
    const val = findLastResult(active.pathFromRoot, (snap) => snap.paramMap.get(param.name));
    if (val !== undefined) {
      path[param.name] = val;
    }
  }
  return convertToParamMap(path);
}
