import { Route } from '@angular/router';
import { AnyQueryParamDefinition, UrlParamCodec } from './params';

export type QueryDefinitions = Readonly<Record<string, AnyQueryParamDefinition>>;

/** A codec for each placeholder that the route's `path` names. */
export type PathParamOptions = Readonly<Record<string, UrlParamCodec<unknown>>>;

/** An Angular route, plus optional ngx-urlik fields. */
export interface RouteDefinition extends Omit<Route, 'children'> {
  /**
   * Adds this route to `AppRouter.routes`, under the enum member that has this value. Each name
   * must be unique, or `defineAppRouter()` throws.
   */
  readonly routeName?: string;
  /**
   * A codec for each placeholder in this route's `path`, such as `{ showId: numberCodec() }`. A
   * placeholder without a codec reads as a string.
   */
  readonly pathParams?: PathParamOptions;
  /** Query parameters this route owns. Named routes below it inherit them. */
  readonly queryParams?: QueryDefinitions;
  readonly children?: readonly RouteDefinition[];
}

export type RouteDefinitions = readonly RouteDefinition[];

export type ParsedRoutePathSegment =
  Readonly<{ kind: 'static'; value: string }> | Readonly<{ kind: 'param'; name: string }>;

export interface ParsedRoutePath {
  readonly segments: readonly ParsedRoutePathSegment[];
  readonly placeholders: readonly string[];
  readonly errors: readonly string[];
}

/** Splits a path like `shows/:showId` into fixed segments and placeholders. */
export function parseRoutePath(path: string): ParsedRoutePath {
  if (typeof path !== 'string') {
    return { segments: [], placeholders: [], errors: ['path must be a string'] };
  }
  if (path === '') {
    return { segments: [], placeholders: [], errors: [] };
  }
  const segments: ParsedRoutePathSegment[] = [];
  const placeholders: string[] = [];
  const errors: string[] = [];
  for (const part of path.split('/')) {
    if (part === '') {
      errors.push("path has an empty segment, from a leading, trailing, or doubled '/'");
    } else if (part === '**') {
      errors.push("a named route can't use the '**' wildcard");
    } else if (part.startsWith(':')) {
      const name = part.slice(1);
      const usableName = name !== '' && !/[:?#;()\s]/.test(name);
      if (!usableName) {
        errors.push(`placeholder '${part}' needs a name without spaces or : ? # ; ( )`);
      } else {
        segments.push({ kind: 'param', name });
        placeholders.push(name);
      }
    } else if (/[:?#;()]/.test(part)) {
      errors.push(`path segment '${part}' can't contain : ? # ; ( )`);
    } else {
      segments.push({ kind: 'static', value: part });
    }
  }
  return { segments, placeholders, errors };
}

const isCodec = (value: unknown): value is UrlParamCodec<unknown> =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as UrlParamCodec<unknown>).serialize === 'function' &&
  typeof (value as UrlParamCodec<unknown>).deserialize === 'function';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isQueryDefinition = (value: unknown): boolean =>
  isRecord(value) && value['kind'] === 'query' && isCodec(value['codec']);

const isRoute = (value: unknown): value is RouteDefinition => isRecord(value);

const someRoute = (route: RouteDefinition, test: (route: RouteDefinition) => boolean): boolean =>
  test(route) ||
  (Array.isArray(route.children) &&
    route.children.some((child) => isRoute(child) && someRoute(child, test)));

const hasNamedRoute = (route: RouteDefinition): boolean =>
  someRoute(route, (candidate) => 'routeName' in candidate);

const usesLibraryFields = (route: RouteDefinition): boolean =>
  someRoute(route, (candidate) => 'pathParams' in candidate || 'queryParams' in candidate);

/**
 * Returns every problem in the routes ngx-urlik reads: named routes, routes above them, and routes
 * with `pathParams` or `queryParams`. Angular checks the other routes. Also reports enum members
 * that no route uses.
 */
export function validateRouteDefinitions(
  routes: RouteDefinitions,
  routeNames: Readonly<Record<string, string>>,
): string[] {
  if (!isRecord(routeNames)) {
    return ['pass your route names enum as the first argument'];
  }
  if (!Array.isArray(routes)) {
    return ['routes must be an array'];
  }
  const declaredNames = new Set(Object.values(routeNames));
  const usedNames = new Map<string, string>();
  const errors: string[] = [];

  // `pathOwners` and `queryOwners` map each name declared above to the path that declares it.
  const visit = (
    siblings: RouteDefinitions,
    location: string,
    pathOwners: ReadonlyMap<string, string>,
    queryOwners: ReadonlyMap<string, string>,
  ) =>
    siblings.forEach((route, index) => {
      const at = `${location}[${index}]`;
      if (!isRoute(route)) {
        errors.push(`${at} must be a route object`);
        return;
      }
      // A route with no named route at or below it is checked only if it uses ngx-urlik fields.
      const readByName = hasNamedRoute(route);
      const nothingToCheck = !readByName && !usesLibraryFields(route);
      if (nothingToCheck) {
        return;
      }
      const named = 'routeName' in route;
      const hasUsableName = named && typeof route.routeName === 'string';
      const label = hasUsableName ? route.routeName : at;
      const report = (message: string) => errors.push(`${label}: ${message}`);

      if (named) {
        const routeName = route.routeName;
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
      const loadsChildrenLazily = Boolean(route.loadChildren);
      if (loadsChildrenLazily && readByName) {
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
      const needsPlainPath = readByName || route.pathParams !== undefined;
      if (needsPlainPath && !plainPath) {
        report('needs a plain path in the primary outlet');
      }
      const parsed = parseRoutePath(plainPath ? (route.path as string) : '');
      for (const error of parsed.errors) {
        report(error);
      }

      if (route.pathParams !== undefined) {
        if (!isRecord(route.pathParams)) {
          report('pathParams must map each placeholder name to its codec');
        } else {
          for (const [name, codec] of Object.entries(route.pathParams)) {
            if (!parsed.placeholders.includes(name)) {
              report(`pathParams.${name} isn't a placeholder in the path`);
            }
            if (!isCodec(codec)) {
              report(`pathParams.${name} must be a codec`);
            }
          }
        }
      }
      const ownPaths = new Map(pathOwners);
      for (const name of parsed.placeholders) {
        const previous = ownPaths.get(name);
        if (previous !== undefined) {
          report(
            `path parameter '${name}' appears in both '${previous}' and '${route.path}'. Rename one, because params().path holds one value per name.`,
          );
        } else {
          ownPaths.set(name, route.path ?? '');
        }
      }
      const ownQueries = new Map(queryOwners);
      const declaresQuery = route.queryParams !== undefined;
      if (declaresQuery && !readByName) {
        report(
          'no named route at or below it reads queryParams. Add a routeName, or remove queryParams.',
        );
      } else if (declaresQuery) {
        if (!isRecord(route.queryParams)) {
          report('queryParams must be an object');
        } else {
          for (const [name, definition] of Object.entries(route.queryParams)) {
            if (!isQueryDefinition(definition)) {
              report(`query parameter '${name}' must come from queryParam()`);
            }
            const previous = ownQueries.get(name);
            if (previous !== undefined) {
              report(
                `query parameter '${name}' is defined in both '${previous}' and '${route.path}'. Define it once.`,
              );
            } else {
              ownQueries.set(name, route.path ?? '');
            }
          }
        }
      }
      if (route.children !== undefined) {
        if (!Array.isArray(route.children)) {
          report('children must be an array');
        } else {
          visit(route.children, `${at}.children`, ownPaths, ownQueries);
        }
      }
    });

  visit(routes, 'routes', new Map(), new Map());
  for (const [member, routeName] of Object.entries(routeNames)) {
    if (!usedNames.has(routeName)) {
      errors.push(
        `RouteNames.${member} has no route. Give a route routeName: '${routeName}', or remove the member.`,
      );
    }
  }
  return errors;
}
