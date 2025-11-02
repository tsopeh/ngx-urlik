export interface UrlParam<T> {
  serialize: (value: T) => string | undefined;
  deserialize: (rawValue: string | undefined) => T;
}

export function stringParam(): UrlParam<string | undefined>;
export function stringParam(fallbackValue: string | (() => string)): UrlParam<string>;
export function stringParam(fallbackValue?: string | (() => string)): UrlParam<any> {
  return {
    serialize: (value: string) => {
      const fallback = resolveFallbackValue(fallbackValue);
      if (value === fallback) {
        return undefined;
      }
      return String(value);
    },
    deserialize: (rawValue: string | undefined) => {
      if (typeof rawValue === 'undefined') {
        return resolveFallbackValue(fallbackValue);
      }
      return rawValue;
    },
  };
}

export function booleanParam(): UrlParam<boolean | undefined>;
export function booleanParam(fallbackValue: boolean | (() => boolean)): UrlParam<boolean>;
export function booleanParam(fallbackValue?: boolean | (() => boolean)): UrlParam<any> {
  return {
    serialize: (value: boolean) => {
      const fallback = resolveFallbackValue(fallbackValue);
      if (value === fallback) {
        return undefined;
      }
      return String(value);
    },
    deserialize: (rawValue: string | undefined) => {
      if (typeof rawValue === 'undefined') {
        return resolveFallbackValue(fallbackValue);
      }
      return rawValue === 'true';
    },
  };
}

export function numberParam(): UrlParam<number | undefined>;
export function numberParam(fallbackValue: number | (() => number)): UrlParam<number>;
export function numberParam(fallbackValue?: number | (() => number)): UrlParam<any> {
  return {
    serialize: (value: number) => {
      const fallback = resolveFallbackValue(fallbackValue);
      if (value === fallback) {
        return undefined;
      }
      return String(value);
    },
    deserialize: (rawValue: string | undefined) => {
      if (typeof rawValue === 'undefined') {
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

export function dateParam(): UrlParam<Date | undefined>;
export function dateParam(fallbackValue: Date | (() => Date)): UrlParam<Date>;
export function dateParam(fallbackValue?: Date | (() => Date)): UrlParam<any> {
  return {
    serialize: (value: Date) => {
      const fallback = resolveFallbackValue(fallbackValue);
      if (value?.getTime() === fallback?.getTime()) {
        return undefined;
      }
      return value.toISOString();
    },
    deserialize: (rawValue: string | undefined) => {
      if (typeof rawValue === 'undefined') {
        return resolveFallbackValue(fallbackValue);
      }
      const date = new Date(rawValue);
      if (Number.isNaN(date.getTime())) {
        return resolveFallbackValue(fallbackValue);
      }
      return date;
    },
  };
}

function resolveFallbackValue<T>(fallbackValue: T | (() => T) | undefined): T | undefined {
  return typeof fallbackValue === 'function' ? (fallbackValue as Function)() : fallbackValue;
}
