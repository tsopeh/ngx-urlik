import { Route } from '@angular/router';
import { AnyQueryParamDefinition, UrlParamCodec } from './params';

export type QueryDefinitions = Readonly<Record<string, AnyQueryParamDefinition>>;

/** A codec attached to a placeholder already declared by an Angular route path. */
export interface PathParamCodecDefinition<T = unknown> {
  readonly codec: UrlParamCodec<T>;
}

export type PathParamOptions =
  PathParamCodecDefinition | Readonly<Record<string, PathParamCodecDefinition>>;

/** An Angular route with optional fields for typed URLs and URL state. */
export interface RouteDefinition extends Omit<Route, 'children'> {
  /**
   * Adds this route to `AppRouter.routes` under this name. Names must be unique across the
   * route array. `defineAppRouter()` throws if a name is repeated.
   */
  readonly routeName?: string;
  /**
   * Codecs for placeholders in this route's `path`. A lone placeholder accepts `{ codec }`;
   * several placeholders need one map entry per name. Without a codec, a placeholder is a string.
   */
  readonly pathParam?: PathParamOptions;
  /** Query fields this route adds to the state inherited by named descendants. */
  readonly queryParams?: QueryDefinitions;
  readonly children?: readonly RouteDefinition[];
  /** Compares decoded state for this route's `params` signal. Descendants inherit it. */
  readonly isEqual?: (a: unknown, b: unknown) => boolean;
}

export type RouteDefinitions = readonly RouteDefinition[];

export type ParsedRoutePathSegment =
  Readonly<{ kind: 'static'; value: string }> | Readonly<{ kind: 'param'; name: string }>;

export interface ParsedRoutePath {
  readonly segments: readonly ParsedRoutePathSegment[];
  readonly placeholders: readonly string[];
  readonly errors: readonly string[];
}

const encodedOutputCharacter = /^[A-Za-z0-9\-_.!~*'()%]$/;

/** Parse the ordinary primary-outlet path syntax used for typed URL construction. */
export function parseRoutePath(path: string): ParsedRoutePath {
  if (typeof path !== 'string')
    return { segments: [], placeholders: [], errors: ['path must be a string'] };
  if (path === '') return { segments: [], placeholders: [], errors: [] };
  const segments: ParsedRoutePathSegment[] = [];
  const placeholders: string[] = [];
  const errors: string[] = [];
  for (const part of path.split('/')) {
    if (part === '') {
      errors.push('path must not contain an empty segment');
    } else if (part === '**') {
      errors.push("wildcard path '**' cannot be used for a named route");
    } else if (part.startsWith(':')) {
      const name = part.slice(1);
      if (!name || /[:?#;()\s]/.test(name)) errors.push(`invalid path placeholder '${part}'`);
      else {
        segments.push({ kind: 'param', name });
        placeholders.push(name);
      }
    } else if (/[:?#;()]/.test(part)) {
      errors.push(`invalid static path segment '${part}'`);
    } else {
      segments.push({ kind: 'static', value: part });
    }
  }
  return { segments, placeholders, errors };
}

function isCodecDefinition(value: unknown): value is PathParamCodecDefinition {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== 1) return false;
  const codec = (value as Partial<PathParamCodecDefinition>).codec;
  return (
    !!codec &&
    typeof codec === 'object' &&
    typeof codec.serialize === 'function' &&
    typeof codec.deserialize === 'function'
  );
}

/** Return explicitly configured codecs, keyed by names parsed from path. */
export function resolvePathParamDefinitions(
  route: Pick<RouteDefinition, 'path' | 'pathParam'>,
): Readonly<Record<string, PathParamCodecDefinition>> {
  const option = route.pathParam;
  if (!option) return {};
  if (isCodecDefinition(option)) {
    const name = parseRoutePath(route.path ?? '').placeholders[0];
    return name ? { [name]: option } : {};
  }
  return typeof option === 'object' && !Array.isArray(option)
    ? (option as Readonly<Record<string, PathParamCodecDefinition>>)
    : {};
}

/** Validate ordered Angular routes and the statically known chains of named routes. */
export function validateRouteDefinitions(routes: RouteDefinitions): string[] {
  if (!Array.isArray(routes)) return ['routes: route collection must be an array'];
  const errors: string[] = [];
  const reported = new Set<string>();
  const routeNames = new Map<string, string>();
  const report = (message: string) => {
    if (!reported.has(message)) {
      errors.push(message);
      reported.add(message);
    }
  };
  const visit = (
    siblings: RouteDefinitions,
    ancestors: readonly RouteDefinition[],
    location: string,
  ) => {
    siblings.forEach((route, index) => {
      const at = `${location}[${index}]`;
      if (!route || typeof route !== 'object' || Array.isArray(route)) {
        report(`${at}: route definition must be a non-null object`);
        return;
      }
      const chain = [...ancestors, route];
      if ('routeName' in route) {
        const routeName = route.routeName;
        if (typeof routeName !== 'string' || !routeName.trim()) {
          report(`${at}: routeName must be a non-empty string`);
        } else {
          const previous = routeNames.get(routeName);
          if (previous)
            report(
              `routeName '${routeName}' is used by both ${previous} and ${at}. Give each named route a different routeName.`,
            );
          else routeNames.set(routeName, at);
          if (route.redirectTo !== undefined || route.path === '**' || route.matcher)
            report(`${routeName}: only ordinary path routes can have a routeName`);
          if (route.loadChildren) report(`${routeName}: named routes cannot use loadChildren`);
          const pathOwners = new Map<string, string>();
          const queryOwners = new Map<string, string>();
          for (const [depth, member] of chain.entries()) {
            const owner = depth === chain.length - 1 ? routeName : `ancestor ${depth + 1}`;
            const knownPath = !(
              member.matcher ||
              member.path === undefined ||
              member.redirectTo !== undefined ||
              member.path === '**' ||
              (member.outlet && member.outlet !== 'primary')
            );
            if (!knownPath)
              report(`${routeName}: ${owner} must have a statically known primary path`);
            if (depth < chain.length - 1 && member.loadChildren)
              report(`${routeName}: ${owner} cannot use loadChildren before a named descendant`);
            const parsed = parseRoutePath(member.path === '**' ? '' : (member.path ?? ''));
            if (knownPath)
              for (const error of parsed.errors) report(`${routeName}: ${owner}: ${error}`);
            const codecOptions = member.pathParam;
            if (codecOptions !== undefined) {
              const definitions = resolvePathParamDefinitions(member);
              const shorthand = isCodecDefinition(codecOptions);
              if (
                !shorthand &&
                codecOptions &&
                typeof codecOptions === 'object' &&
                'codec' in codecOptions &&
                codecOptions['codec'] &&
                typeof codecOptions['codec'] === 'object' &&
                'serialize' in codecOptions['codec'] &&
                'deserialize' in codecOptions['codec']
              )
                report(`${routeName}: ${owner}: pathParam shorthand supports only 'codec'`);
              if (shorthand && parsed.placeholders.length !== 1)
                report(
                  `${routeName}: ${owner}: pathParam shorthand requires exactly one path placeholder`,
                );
              if (
                !shorthand &&
                (!codecOptions || typeof codecOptions !== 'object' || Array.isArray(codecOptions))
              )
                report(`${routeName}: ${owner}: pathParam must be a codec or a keyed codec map`);
              for (const name of Object.keys(definitions)) {
                if (!parsed.placeholders.includes(name))
                  report(`${routeName}: ${owner}: pathParam '${name}' has no path placeholder`);
                if (!isCodecDefinition(definitions[name]))
                  report(`${routeName}: ${owner}: pathParam '${name}' must contain a codec`);
              }
              if (
                !shorthand &&
                Object.keys(definitions).length !== new Set(parsed.placeholders).size
              )
                report(
                  `${routeName}: ${owner}: pathParam map must define exactly the path placeholders`,
                );
            }
            for (const name of parsed.placeholders) {
              const previous = pathOwners.get(name);
              if (previous)
                report(
                  `${routeName}: path parameter '${name}' appears in both '${previous}' and '${member.path}'. Rename one so params().path can hold both values.`,
                );
              else pathOwners.set(name, member.path ?? '');
            }
            if (member.queryParams !== undefined) {
              if (
                !member.queryParams ||
                typeof member.queryParams !== 'object' ||
                Array.isArray(member.queryParams)
              ) {
                report(`${routeName}: ${owner}: queryParams must be a non-null object`);
              } else
                for (const [name, param] of Object.entries(member.queryParams)) {
                  const previous = queryOwners.get(name);
                  if (previous)
                    report(
                      `${routeName}: query parameter '${name}' is defined in both '${previous}' and '${member.path}'`,
                    );
                  else queryOwners.set(name, member.path ?? '');
                  if (param?.mode === 'delimited') {
                    const separator = param.separator ?? '';
                    if (
                      typeof separator !== 'string' ||
                      Array.from(separator).length !== 1 ||
                      encodedOutputCharacter.test(separator)
                    )
                      report(
                        `${routeName}: query parameter '${name}' separator must be one character escaped by encodeURIComponent`,
                      );
                  }
                }
            }
          }
        }
      }
      if (route.children !== undefined) {
        if (!Array.isArray(route.children))
          report(`${at}.children: route collection must be an array`);
        else visit(route.children, chain, `${at}.children`);
      }
    });
  };
  visit(routes, [], 'routes');
  return errors;
}
