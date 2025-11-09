import { initIsEnumValue, resolveFallbackValue } from './utils';

export interface UrlParamSerde<T> {
  serialize: (value: T | undefined) => string | undefined;
  deserialize: (rawValue: string | undefined) => T;
}

export function createPathParam<const TName extends string, const TType>(
  paramName: TName,
  serde: UrlParamSerde<TType>,
): { paramName: TName; serde: UrlParamSerde<TType> } {
  return {
    paramName,
    serde,
  };
}

export function stringParam(): UrlParamSerde<string | undefined>;
export function stringParam(fallbackValue: string | (() => string)): UrlParamSerde<string>;
export function stringParam(fallbackValue?: string | (() => string)): UrlParamSerde<any> {
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

export function booleanParam(): UrlParamSerde<boolean | undefined>;
export function booleanParam(fallbackValue: boolean | (() => boolean)): UrlParamSerde<boolean>;
export function booleanParam(fallbackValue?: boolean | (() => boolean)): UrlParamSerde<any> {
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

export function numberParam(): UrlParamSerde<number | undefined>;
export function numberParam(fallbackValue: number | (() => number)): UrlParamSerde<number>;
export function numberParam(fallbackValue?: number | (() => number)): UrlParamSerde<any> {
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

export function dateParam(): UrlParamSerde<Date | undefined>;
export function dateParam(fallbackValue: Date | (() => Date)): UrlParamSerde<Date>;
export function dateParam(fallbackValue?: Date | (() => Date)): UrlParamSerde<any> {
  return {
    serialize: (value: unknown) => {
      if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        return undefined;
      }
      const fallback = resolveFallbackValue(fallbackValue);
      if (value.getTime() === fallback?.getTime()) {
        return undefined;
      }
      return value.toISOString();
    },
    deserialize: (rawValue: string | undefined) => {
      if (rawValue == undefined) {
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
