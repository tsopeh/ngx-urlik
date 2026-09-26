import { Route } from '@angular/router';
import { AnyQueryParamDefinition, UrlParamCodec } from './params';

export type QueryDefinitions = Readonly<Record<string, AnyQueryParamDefinition>>;

/** A codec attached to a placeholder already declared by an Angular route path. */
export interface PathParamCodecDefinition<T = unknown> {
  readonly codec: UrlParamCodec<T>;
}

export type PathParamOptions =
  PathParamCodecDefinition | Readonly<Record<string, PathParamCodecDefinition>>;

/** Ordered Angular route declarations with optional typed-router metadata. */
export interface RouteDefinition extends Omit<Route, 'children'> {
  readonly identifier?: string;
  readonly pathParam?: PathParamOptions;
  readonly queryParams?: QueryDefinitions;
  readonly children?: readonly RouteDefinition[];
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
      errors.push("wildcard path '**' cannot be used for an identified route");
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

/** Validate ordered Angular routes and the statically known chains of identified routes. */
export function validateRouteDefinitions(routes: RouteDefinitions): string[] {
  if (!Array.isArray(routes)) return ['routes: route collection must be an array'];
  const errors: string[] = [];
  const reported = new Set<string>();
  const identifiers = new Map<string, string>();
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
      if ('identifier' in route) {
        const identifier = route.identifier;
        if (typeof identifier !== 'string' || !identifier.trim()) {
          report(`${at}: identifier must be a non-empty string`);
        } else {
          const previous = identifiers.get(identifier);
          if (previous) report(`${at}: identifier '${identifier}' duplicates ${previous}`);
          else identifiers.set(identifier, at);
          if (route.redirectTo !== undefined || route.path === '**' || route.matcher)
            report(`${identifier}: only ordinary path routes can have an identifier`);
          if (route.loadChildren)
            report(`${identifier}: identified routes cannot use loadChildren`);
          const pathOwners = new Map<string, string>();
          const queryOwners = new Map<string, string>();
          for (const [depth, member] of chain.entries()) {
            const owner = depth === chain.length - 1 ? identifier : `ancestor ${depth + 1}`;
            const knownPath = !(
              member.matcher ||
              member.path === undefined ||
              member.redirectTo !== undefined ||
              member.path === '**' ||
              (member.outlet && member.outlet !== 'primary')
            );
            if (!knownPath)
              report(`${identifier}: ${owner} must have a statically known primary path`);
            if (depth < chain.length - 1 && member.loadChildren)
              report(
                `${identifier}: ${owner} cannot use loadChildren before an identified descendant`,
              );
            const parsed = parseRoutePath(member.path === '**' ? '' : (member.path ?? ''));
            if (knownPath)
              for (const error of parsed.errors) report(`${identifier}: ${owner}: ${error}`);
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
                report(`${identifier}: ${owner}: pathParam shorthand supports only 'codec'`);
              if (shorthand && parsed.placeholders.length !== 1)
                report(
                  `${identifier}: ${owner}: pathParam shorthand requires exactly one path placeholder`,
                );
              if (
                !shorthand &&
                (!codecOptions || typeof codecOptions !== 'object' || Array.isArray(codecOptions))
              )
                report(`${identifier}: ${owner}: pathParam must be a codec or a keyed codec map`);
              for (const name of Object.keys(definitions)) {
                if (!parsed.placeholders.includes(name))
                  report(`${identifier}: ${owner}: pathParam '${name}' has no path placeholder`);
                if (!isCodecDefinition(definitions[name]))
                  report(`${identifier}: ${owner}: pathParam '${name}' must contain a codec`);
              }
              if (
                !shorthand &&
                Object.keys(definitions).length !== new Set(parsed.placeholders).size
              )
                report(
                  `${identifier}: ${owner}: pathParam map must define exactly the path placeholders`,
                );
            }
            for (const name of parsed.placeholders) {
              const previous = pathOwners.get(name);
              if (previous)
                report(
                  `${identifier}: path parameter '${name}' appears in both '${previous}' and '${member.path}'. Rename one so params().path can hold both values.`,
                );
              else pathOwners.set(name, member.path ?? '');
            }
            if (member.queryParams !== undefined) {
              if (
                !member.queryParams ||
                typeof member.queryParams !== 'object' ||
                Array.isArray(member.queryParams)
              ) {
                report(`${identifier}: ${owner}: queryParams must be a non-null object`);
              } else
                for (const [name, param] of Object.entries(member.queryParams)) {
                  const previous = queryOwners.get(name);
                  if (previous)
                    report(
                      `${identifier}: query parameter '${name}' is defined in both '${previous}' and '${member.path}'`,
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
                        `${identifier}: query parameter '${name}' separator must be one character escaped by encodeURIComponent`,
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
