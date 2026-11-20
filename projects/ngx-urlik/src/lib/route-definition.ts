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

export const isCodec = (value: unknown): value is UrlParamCodec<unknown> =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as UrlParamCodec<unknown>).serialize === 'function' &&
  typeof (value as UrlParamCodec<unknown>).deserialize === 'function';

export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export const isQueryDefinition = (value: unknown): value is AnyQueryParamDefinition =>
  isRecord(value) && value['kind'] === 'query' && isCodec(value['codec']);
