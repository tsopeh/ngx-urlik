export interface UrlParamSerializer<T> {
  serialize(value: T): string | null;
  deserialize(value: unknown): T;
}

interface PathParamDefinition<T, Name extends string = string> {
  readonly kind: 'path';
  readonly name: Name;
  readonly serializer: UrlParamSerializer<T>;
}
interface QueryParamDefinition<T, Required extends boolean = false> {
  readonly kind: 'query';
  readonly serializer: UrlParamSerializer<T>;
  readonly required: Required;
}

export function pathParam<T, const N extends string>(
  options: {
    name: N;
    serializer: UrlParamSerializer<T>;
  } & (undefined extends T ? never : unknown),
): PathParamDefinition<T, N> {
  return Object.freeze({ kind: 'path', ...options });
}

export function queryParam<T, const R extends boolean = false>(
  options: {
    serializer: UrlParamSerializer<T>;
    required?: R;
  } & (undefined extends T ? never : unknown),
): QueryParamDefinition<T, R> {
  return Object.freeze({
    kind: 'query',
    serializer: options.serializer,
    required: options.required ?? false,
  }) as QueryParamDefinition<T, R>;
}

type Default<T> = T | (() => T);
type Options<T, R extends boolean> = { required?: R; defaultValue?: Default<T> };

function query<T, R extends boolean>(
  parse: (raw: unknown) => T | null,
  options: Options<T, R>,
): QueryParamDefinition<T | null, R> {
  const defaultValue = (): T | null => {
    const value = options.defaultValue;
    return typeof value === 'function' ? (value as () => T)() : value === undefined ? null : value;
  };
  return Object.freeze({
    kind: 'query' as const,
    required: options.required ?? false,
    serializer: {
      deserialize: (raw: unknown) => parse(raw) ?? defaultValue(),
      serialize(value: T | null) {
        return value === null || Object.is(value, defaultValue()) ? null : String(value);
      },
    },
  }) as QueryParamDefinition<T | null, R>;
}

function path<T, const N extends string>(
  name: N,
  parse: (raw: unknown) => T | null,
): PathParamDefinition<T, N> {
  return Object.freeze({
    kind: 'path' as const,
    name,
    serializer: {
      deserialize(raw: unknown) {
        return parse(raw) as T;
      },
      serialize: (value: T) => String(value),
    },
  });
}

const parseString = (raw: unknown) => (typeof raw === 'string' ? raw : null);
const parsePathString = (raw: unknown) => (typeof raw === 'string' && raw.length > 0 ? raw : null);
const parseNumber = (raw: unknown) => {
  if (
    typeof raw !== 'string' ||
    raw === '' ||
    !/^[+-]?(?:Infinity|(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?)$/.test(raw)
  )
    return null;
  const value = Number(raw);
  return Number.isNaN(value) ? null : value;
};
const parseBoolean = (raw: unknown) => (raw === 'true' ? true : raw === 'false' ? false : null);

export const stringPathParam = <const N extends string>(options: { name: N }) =>
  path(options.name, parsePathString);
export const numberPathParam = <const N extends string>(options: { name: N }) =>
  path(options.name, parseNumber);
export const booleanPathParam = <const N extends string>(options: { name: N }) =>
  path(options.name, parseBoolean);

export function stringQueryParam<const R extends boolean = false>(
  options: Options<string, R> & { defaultValue: Default<string> },
): QueryParamDefinition<string, R>;
export function stringQueryParam<const R extends boolean = false>(
  options?: Options<string, R>,
): QueryParamDefinition<string | null, R>;
export function stringQueryParam<const R extends boolean = false>(
  options: Options<string, R> = {},
): QueryParamDefinition<string | null, R> {
  return query(parseString, options);
}
export function numberQueryParam<const R extends boolean = false>(
  options: Options<number, R> & { defaultValue: Default<number> },
): QueryParamDefinition<number, R>;
export function numberQueryParam<const R extends boolean = false>(
  options?: Options<number, R>,
): QueryParamDefinition<number | null, R>;
export function numberQueryParam<const R extends boolean = false>(
  options: Options<number, R> = {},
): QueryParamDefinition<number | null, R> {
  return query(parseNumber, options);
}
export function booleanQueryParam<const R extends boolean = false>(
  options: Options<boolean, R> & { defaultValue: Default<boolean> },
): QueryParamDefinition<boolean, R>;
export function booleanQueryParam<const R extends boolean = false>(
  options?: Options<boolean, R>,
): QueryParamDefinition<boolean | null, R>;
export function booleanQueryParam<const R extends boolean = false>(
  options: Options<boolean, R> = {},
): QueryParamDefinition<boolean | null, R> {
  return query(parseBoolean, options);
}

type StringRecord = Readonly<Record<string, string>>;
type EnumValue<E extends StringRecord> = E[keyof E];
function enumParser<E extends StringRecord>(values: E) {
  if (Object.values(values).some((value) => typeof value !== 'string'))
    throw new Error('enum parameter values must all be strings');
  const allowed = new Set(Object.values(values));
  return (raw: unknown): EnumValue<E> | null =>
    typeof raw === 'string' && allowed.has(raw) ? (raw as EnumValue<E>) : null;
}
export const enumPathParam = <const E extends StringRecord, const N extends string>(
  values: E,
  options: { name: N },
) => path(options.name, enumParser(values));
export function enumQueryParam<const E extends StringRecord, const R extends boolean = false>(
  values: E,
  options: Options<EnumValue<E>, R> & { defaultValue: Default<EnumValue<E>> },
): QueryParamDefinition<EnumValue<E>, R>;
export function enumQueryParam<const E extends StringRecord, const R extends boolean = false>(
  values: E,
  options?: Options<EnumValue<E>, R>,
): QueryParamDefinition<EnumValue<E> | null, R>;
export function enumQueryParam<const E extends StringRecord, const R extends boolean = false>(
  values: E,
  options: Options<EnumValue<E>, R> = {},
): QueryParamDefinition<EnumValue<E> | null, R> {
  return query(enumParser(values), options);
}

type ParamValue<D> = D extends
  PathParamDefinition<infer T, string> | QueryParamDefinition<infer T, boolean>
  ? T
  : never;
