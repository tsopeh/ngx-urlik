export interface UrlParamSerde<T> {
  serialize: (value: T) => string | undefined;
  deserialize: (rawValue: string | undefined) => T;
}

export function stringParam(): UrlParamSerde<string | undefined>;
export function stringParam(fallbackValue: string | (() => string)): UrlParamSerde<string>;
export function stringParam(fallbackValue?: string | (() => string)): UrlParamSerde<any> {
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

export function booleanParam(): UrlParamSerde<boolean | undefined>;
export function booleanParam(fallbackValue: boolean | (() => boolean)): UrlParamSerde<boolean>;
export function booleanParam(fallbackValue?: boolean | (() => boolean)): UrlParamSerde<any> {
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

export function numberParam(): UrlParamSerde<number | undefined>;
export function numberParam(fallbackValue: number | (() => number)): UrlParamSerde<number>;
export function numberParam(fallbackValue?: number | (() => number)): UrlParamSerde<any> {
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

export function dateParam(): UrlParamSerde<Date | undefined>;
export function dateParam(fallbackValue: Date | (() => Date)): UrlParamSerde<Date>;
export function dateParam(fallbackValue?: Date | (() => Date)): UrlParamSerde<any> {
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

export function enumParam<T extends Record<any, any>>(
  enumObject: T,
): UrlParamSerde<T[keyof T] | undefined>;
export function enumParam<T extends Record<any, any>>(
  enumObject: T,
  fallbackValue: T[keyof T] | (() => T[keyof T]),
): UrlParamSerde<T[keyof T]>;
export function enumParam<T extends Record<any, any>>(
  enumObject: T,
  fallbackValue?: T[keyof T] | (() => T[keyof T]),
): UrlParamSerde<any> {
  const isEnumValue = initIsEnumValue(enumObject);
  return {
    serialize: (value: T[keyof T]) => {
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
      if (!isEnumValue(rawValue)) {
        return resolveFallbackValue(fallbackValue);
      }
      return rawValue;
    },
  };
}

export function resolveFallbackValue<T>(fallbackValue: T | (() => T) | undefined): T | undefined {
  return typeof fallbackValue === 'function' ? (fallbackValue as Function)() : fallbackValue;
}

export function initIsEnumValue<T extends Record<any, any>>(enumObject: T) {
  const possibleValues = Object.values(enumObject);
  return (enumValue: unknown): enumValue is T[keyof T] => {
    return enumValue != null && possibleValues.includes(enumValue as any);
  };
}
