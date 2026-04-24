import { assertInInjectionContext, DestroyRef, inject, Signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  ActivatedRouteSnapshot,
  NavigationEnd,
  NavigationExtras,
  Router,
} from '@angular/router';
import { filter, map, Observable } from 'rxjs';
import { isEqual } from './is-equal';

export interface AppParamValues {
  path: Record<string, unknown>;
  query: Record<string, unknown>;
}

export interface BaseUrlParamEncoder {
  serialize: (value: never) => string | undefined;
  deserialize: (rawValue: string | undefined) => unknown;
}

export interface AppUrlParamsConfig {
  path?: Record<string, BaseUrlParamEncoder>;
  query?: Record<string, BaseUrlParamEncoder>;
}

export interface UrlParamEncoder<T> {
  serialize: (value: T | undefined) => string | undefined;
  deserialize: (rawValue: string | undefined) => T;
}

// Helper to extract the inner type from the encoder, improving IDE performance
export type UnwrapUrlParamEncoder<T> = T extends UrlParamEncoder<infer V> ? V : never;

export interface InferUrlParams<T extends AppUrlParamsConfig> {
  path: T extends { path: Record<string, unknown> }
    ? { [Param in keyof T['path']]: UnwrapUrlParamEncoder<T['path'][Param]> }
    : never;
  query: T extends { query: Record<string, unknown> }
    ? { [Param in keyof T['query']]: UnwrapUrlParamEncoder<T['query'][Param]> }
    : never;
}

export type QueryShape<T extends AppParamValues> = T extends { query: infer Q }
  ? Q extends object
    ? Q
    : never
  : never;

interface UpdateQueryParamsFunction<TValues extends AppParamValues> {
  (
    withPrev: (prev: QueryShape<TValues>) => QueryShape<TValues>,
    replaceHistory?: boolean,
  ): Promise<boolean>;

  (value: QueryShape<TValues>, replaceHistory?: boolean): Promise<boolean>;
}

export interface AppUrlParamsRef<TValues extends AppParamValues> {
  values$: Observable<TValues>;
  values: Signal<TValues>;

  updateQueryParams: UpdateQueryParamsFunction<TValues>;
}

/**
 * appUrlParams is a helper for defining and managing path and query parameters (together known
 * as URL parameters). It allows reading of both path and query params, and updating of query params,
 * as path params are updated via Router navigation.
 */
export function appUrlParams<
  const TConfig extends AppUrlParamsConfig,
  TValues extends InferUrlParams<TConfig>,
>(urlParamsConfig: TConfig): AppUrlParamsRef<TValues> {
  assertInInjectionContext(appUrlParams);

  const router = inject(Router);
  const route = inject(ActivatedRoute);
  const destroyRef = inject(DestroyRef);

  const pathParamKeys = urlParamsConfig.path ? Object.keys(urlParamsConfig.path) : [];
  const queryParamKeys = urlParamsConfig.query ? Object.keys(urlParamsConfig.query) : [];

  const values$ = router.events.pipe(
    filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    map((): TValues => {
      const { pathParams, queryParams } = getAllUrlParams(route.snapshot);
      const result = {
        path: pathParamKeys.reduce(
          (acc, paramName) => {
            const paramConfig = urlParamsConfig.path?.[paramName];
            const rawValue = pathParams[paramName];
            const deserialize = paramConfig?.deserialize;
            const parsed = deserialize ? deserialize(rawValue ?? undefined) : rawValue;
            acc = {
              ...acc,
              [paramName]: parsed,
            };
            return acc;
          },
          {} as TValues['path'],
        ),
        query: queryParamKeys.reduce(
          (acc, paramName) => {
            const paramConfig = urlParamsConfig.query?.[paramName];
            const rawValue = queryParams[paramName];
            const deserialize = paramConfig?.deserialize;
            const parsed = deserialize ? deserialize(rawValue ?? undefined) : rawValue;
            acc = {
              ...acc,
              [paramName]: parsed,
            };
            return acc;
          },
          {} as TValues['query'],
        ),
      };
      return result as unknown as TValues;
    }),
    takeUntilDestroyed(destroyRef),
  );

  const values = toSignal(values$, { requireSync: true });

  const serializeQueryParams = (
    valueOrWithPrev: ((prev: QueryShape<TValues>) => QueryShape<TValues>) | QueryShape<TValues>,
  ) => {
    const queryParams =
      typeof valueOrWithPrev === 'function'
        ? (valueOrWithPrev as (prev: QueryShape<TValues>) => QueryShape<TValues>)(
            values().query as QueryShape<TValues>,
          )
        : valueOrWithPrev;

    const serialized = queryParamKeys.reduce<Record<string, string | undefined>>(
      (acc, paramKey) => {
        const paramValue = queryParams?.[paramKey];
        // Cast to 'never' here satisfies TS because BaseUrlParamEncoder strictly accepts never,
        // but InferUrlParams guaranteed the runtime mapping is safe.
        acc[paramKey] = urlParamsConfig.query?.[paramKey]?.serialize(paramValue as never);
        return acc;
      },
      {},
    );
    return serialized;
  };

  const setQueryParams = (
    route: ActivatedRoute,
    params: Record<string, string | undefined>,
    extras?: Omit<NavigationExtras, 'queryParams'>,
  ) =>
    router.navigate([], {
      relativeTo: route,
      queryParams: params,
      queryParamsHandling: 'merge', // keep existing unless overridden
      ...extras,
    });

  return {
    values$,
    values,
    updateQueryParams: (valueOrWithPrev, replaceHistory) => {
      const serialized = serializeQueryParams(valueOrWithPrev);
      return setQueryParams(route, serialized, { replaceUrl: replaceHistory ?? false });
    },
  };
}

function getAllUrlParams(route: ActivatedRouteSnapshot) {
  let pathParams: Record<string, string> = {};
  let currentRoute: ActivatedRouteSnapshot | null = route.root;
  const queryParams = currentRoute.queryParams;

  while (currentRoute) {
    pathParams = { ...pathParams, ...currentRoute.params };
    currentRoute = currentRoute.firstChild;
  }

  return {
    pathParams,
    queryParams,
  };
}

export function stringParam(): UrlParamEncoder<string | undefined>;
export function stringParam(fallbackValue: string | (() => string)): UrlParamEncoder<string>;
export function stringParam(
  fallbackValue?: string | (() => string),
): UrlParamEncoder<string | undefined> | UrlParamEncoder<string> {
  return {
    serialize: (value: unknown) => {
      if (typeof value !== 'string') {
        return undefined;
      }
      const fallback = resolveFallbackValue(fallbackValue);
      if (value === fallback) {
        return undefined;
      }
      return String(value);
    },
    deserialize: (rawValue: string | undefined) => {
      if (rawValue == undefined) {
        return resolveFallbackValue(fallbackValue);
      }
      return rawValue;
    },
  };
}

export function booleanParam(): UrlParamEncoder<boolean | undefined>;
export function booleanParam(fallbackValue: boolean | (() => boolean)): UrlParamEncoder<boolean>;
export function booleanParam(
  fallbackValue?: boolean | (() => boolean),
): UrlParamEncoder<boolean | undefined> | UrlParamEncoder<boolean> {
  return {
    serialize: (value: unknown) => {
      if (typeof value !== 'boolean') {
        return undefined;
      }
      const fallback = resolveFallbackValue(fallbackValue);
      if (value === fallback) {
        return undefined;
      }
      return String(value);
    },
    deserialize: (rawValue: string | undefined) => {
      if (rawValue == undefined || (rawValue !== 'true' && rawValue !== 'false')) {
        return resolveFallbackValue(fallbackValue);
      }
      return rawValue === 'true';
    },
  };
}

export function numberParam(): UrlParamEncoder<number | undefined>;

export function numberParam(fallbackValue: number | (() => number)): UrlParamEncoder<number>;
export function numberParam(
  fallbackValue?: number | (() => number),
): UrlParamEncoder<number | undefined> | UrlParamEncoder<number> {
  return {
    serialize: (value: unknown) => {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return undefined;
      }
      const fallback = resolveFallbackValue(fallbackValue);
      if (value === fallback) {
        return undefined;
      }
      return String(value);
    },
    deserialize: (rawValue: string | undefined) => {
      if (rawValue == undefined) {
        return resolveFallbackValue(fallbackValue);
      }
      const parsed = parseFloat(rawValue);
      if (Number.isNaN(parsed)) {
        return resolveFallbackValue(fallbackValue);
      }
      return parsed;
    },
  };
}

export function commaSeparatedParam<T>(
  encoder: UrlParamEncoder<T>,
): UrlParamEncoder<Array<T> | undefined>;
export function commaSeparatedParam<T>(
  encoder: UrlParamEncoder<T>,
  fallbackValue: NoInfer<Array<T>> | (() => NoInfer<Array<T>>),
): UrlParamEncoder<Array<T>>;
export function commaSeparatedParam<T>(
  encoder: UrlParamEncoder<T>,
  fallbackValue?: NoInfer<Array<T>> | (() => NoInfer<Array<T>>),
): UrlParamEncoder<Array<T> | undefined> | UrlParamEncoder<Array<T>> {
  return {
    serialize: (value: unknown) => {
      if (!Array.isArray(value)) {
        return undefined;
      }
      const fallback = resolveFallbackValue(
        fallbackValue as Array<T> | (() => Array<T>) | undefined,
      );
      if (isEqual(value, fallback)) {
        return undefined;
      }
      const serializedValues = value.map((item) => encoder.serialize(item));
      return serializedValues.join(',');
    },
    deserialize: (rawValue: string | undefined) => {
      if (rawValue == undefined) {
        return resolveFallbackValue(fallbackValue as Array<T> | (() => Array<T>) | undefined);
      }
      const serializedValues = rawValue.split(',');
      const deserialized = serializedValues.map((item) => encoder.deserialize(item));
      return deserialized;
    },
  };
}

export function enumParam<T extends Record<string, string>>(
  enumObject: T,
): UrlParamEncoder<T[keyof T] | undefined>;
export function enumParam<T extends Record<string, string>>(
  enumObject: T,
  fallbackValue: T[keyof T] | (() => T[keyof T]),
): UrlParamEncoder<T[keyof T]>;
export function enumParam<T extends Record<string, string>>(
  enumObject: T,
  fallbackValue?: T[keyof T] | (() => T[keyof T]),
): UrlParamEncoder<T[keyof T] | undefined> | UrlParamEncoder<T[keyof T]> {
  const isEnumValue = initIsEnumValue(enumObject);
  return {
    serialize: (value: unknown) => {
      if (value == undefined || !isEnumValue(value)) {
        return undefined;
      }
      const fallback = resolveFallbackValue(fallbackValue);
      if (value === fallback) {
        return undefined;
      }
      return String(value);
    },
    deserialize: (rawValue: string | undefined) => {
      if (rawValue == undefined) {
        return resolveFallbackValue(fallbackValue);
      }
      if (!isEnumValue(rawValue)) {
        return resolveFallbackValue(fallbackValue);
      }
      return rawValue;
    },
  };
}

function resolveFallbackValue<T>(fallbackValue: T | (() => T) | undefined): T | undefined {
  return typeof fallbackValue === 'function' ? (fallbackValue as () => T)() : fallbackValue;
}

function initIsEnumValue<T extends Record<string, string>>(enumObject: T) {
  const possibleValues = Object.values(enumObject);
  return (enumValue: unknown): enumValue is T[keyof T] => {
    return !!enumValue && typeof enumValue === 'string' && possibleValues.includes(enumValue);
  };
}
