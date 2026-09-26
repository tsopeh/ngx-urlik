export interface UrlParamCodec<T> {
  serialize(value: T): string | null;
  deserialize(raw: string): T | null;
}

export type DefaultValue<T> = T | (() => T);

type NonNullish<T> = null extends T ? never : undefined extends T ? never : unknown;

export interface PathParamDefinition<T, Name extends string = string> {
  readonly kind: 'path';
  readonly name: Name;
  readonly codec: UrlParamCodec<T>;
}

export interface QueryParamDefinition<
  T,
  Required extends boolean = false,
  Defaulted extends boolean = false,
> {
  readonly kind: 'query';
  readonly mode: 'scalar';
  readonly codec: UrlParamCodec<T>;
  readonly required: Required;
  readonly defaultValue?: DefaultValue<T>;
}

export interface ArrayQueryParamDefinition<T, Required extends boolean = false> {
  readonly kind: 'query';
  readonly mode: 'repeated' | 'delimited';
  readonly codec: UrlParamCodec<T>;
  readonly required: Required;
  readonly defaultValue?: DefaultValue<readonly T[]>;
  readonly separator?: string;
}

export type AnyQueryParamDefinition =
  QueryParamDefinition<unknown, boolean, boolean> | ArrayQueryParamDefinition<unknown, boolean>;

type QueryOptions<T, Required extends boolean> = {
  codec: UrlParamCodec<T>;
  required?: Required;
  defaultValue?: DefaultValue<T>;
};

export function queryParam<T, const Required extends boolean = false>(
  options: QueryOptions<T, Required> & { defaultValue: DefaultValue<T> } & NonNullish<T>,
): QueryParamDefinition<T, Required, true>;
export function queryParam<T, const Required extends boolean = false>(
  options: QueryOptions<T, Required> & NonNullish<T>,
): QueryParamDefinition<T, Required, false>;
export function queryParam<T, const Required extends boolean = false>(
  options: QueryOptions<T, Required> & NonNullish<T>,
): QueryParamDefinition<T, Required, boolean> {
  return {
    kind: 'query',
    mode: 'scalar',
    codec: options.codec,
    required: options.required ?? false,
    defaultValue: options.defaultValue,
  } as QueryParamDefinition<T, Required, boolean>;
}

type ArrayQueryOptions<T, Required extends boolean> = {
  codec: UrlParamCodec<T>;
  required?: Required;
  defaultValue?: DefaultValue<readonly T[]>;
};

export function repeatedQueryParam<T, const Required extends boolean = false>(
  options: ArrayQueryOptions<T, Required> & NonNullish<T>,
): ArrayQueryParamDefinition<T, Required> {
  return {
    kind: 'query',
    mode: 'repeated',
    codec: options.codec,
    required: options.required ?? false,
    defaultValue: options.defaultValue,
  } as ArrayQueryParamDefinition<T, Required>;
}

export function delimitedQueryParam<T, const Required extends boolean = false>(
  options: ArrayQueryOptions<T, Required> & { separator: string } & NonNullish<T>,
): ArrayQueryParamDefinition<T, Required> {
  return {
    kind: 'query',
    mode: 'delimited',
    codec: options.codec,
    required: options.required ?? false,
    defaultValue: options.defaultValue,
    separator: options.separator,
  } as ArrayQueryParamDefinition<T, Required>;
}

const numberPattern = /^[+-]?(?:Infinity|(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?)$/;

export function stringCodec(): UrlParamCodec<string> {
  return {
    serialize: (value) => (typeof value === 'string' ? value : null),
    deserialize: (raw) => raw,
  };
}

export function numberCodec(): UrlParamCodec<number> {
  return {
    serialize: (value) =>
      typeof value === 'number' && !Number.isNaN(value) ? String(value) : null,
    deserialize(raw) {
      if (!numberPattern.test(raw)) return null;
      const value = Number(raw);
      return Number.isNaN(value) ? null : value;
    },
  };
}

export function booleanCodec(): UrlParamCodec<boolean> {
  return {
    serialize: (value) => (typeof value === 'boolean' ? String(value) : null),
    deserialize: (raw) => (raw === 'true' ? true : raw === 'false' ? false : null),
  };
}

type StringRecord = Readonly<Record<string, string>>;
type EnumValue<Values extends StringRecord> = Values[keyof Values];

export function enumCodec<const Values extends StringRecord>(
  values: Values,
): UrlParamCodec<EnumValue<Values>> {
  if (Object.values(values).some((value) => typeof value !== 'string'))
    throw new Error('enum codec values must all be strings');
  const allowed = new Set(Object.values(values));
  return {
    serialize: (value) => (allowed.has(value) ? value : null),
    deserialize: (raw) => (allowed.has(raw) ? (raw as EnumValue<Values>) : null),
  };
}
