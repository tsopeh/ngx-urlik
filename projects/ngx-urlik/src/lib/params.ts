export interface UrlParamCodec<T> {
  serialize(value: T): string | null;
  deserialize(raw: string): T | null;
}

type NonNullish<T> = null extends T ? never : undefined extends T ? never : unknown;

/** Whether a codec gave a value. `null` and `undefined` both mean it couldn't convert. */
export const isConverted = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

export interface QueryParamDefinition<
  T,
  Required extends boolean = false,
  // Only types read it, through `infer`: it records whether the field has a default.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Defaulted extends boolean = false,
> {
  readonly kind: 'query';
  readonly codec: UrlParamCodec<T>;
  readonly required: Required;
  readonly defaultValue?: T;
}

export type AnyQueryParamDefinition = QueryParamDefinition<unknown, boolean, boolean>;

type QueryOptions<T, Required extends boolean> = {
  codec: UrlParamCodec<T>;
  required?: Required;
  defaultValue?: T;
};

export function queryParam<T, const Required extends boolean = false>(
  options: QueryOptions<T, Required> & { defaultValue: T } & NonNullish<T>,
): QueryParamDefinition<T, Required, true>;
export function queryParam<T, const Required extends boolean = false>(
  options: QueryOptions<T, Required> & NonNullish<T>,
): QueryParamDefinition<T, Required, false>;
export function queryParam<T, const Required extends boolean = false>(
  options: QueryOptions<T, Required> & NonNullish<T>,
): QueryParamDefinition<T, Required, boolean> {
  return {
    kind: 'query',
    codec: options.codec,
    required: options.required ?? false,
    defaultValue: options.defaultValue,
  } as QueryParamDefinition<T, Required, boolean>;
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
    serialize: (value) => {
      const isNumber = typeof value === 'number' && !Number.isNaN(value);
      return isNumber ? String(value) : null;
    },
    // The pattern accepts only text Number() reads in full, so the result is never NaN.
    deserialize: (raw) => (numberPattern.test(raw) ? Number(raw) : null),
  };
}

export function booleanCodec(): UrlParamCodec<boolean> {
  return {
    serialize: (value) => (typeof value === 'boolean' ? String(value) : null),
    deserialize: (raw) => (raw === 'true' ? true : raw === 'false' ? false : null),
  };
}

type StringRecord = Readonly<Record<string, string>>;
type EnumValue<Values> = Values extends readonly string[]
  ? Values[number]
  : Values extends StringRecord
    ? Values[keyof Values]
    : never;

export function enumCodec<const Values extends readonly string[] | StringRecord>(
  values: Values,
): UrlParamCodec<EnumValue<Values>> {
  const list = Array.isArray(values) ? values : Object.values(values);
  if (list.some((value) => typeof value !== 'string')) {
    throw new Error(
      'enumCodec(): every value must be a string. Use a string enum or an array of strings.',
    );
  }
  const allowed = new Set(list);
  return {
    serialize: (value) => (allowed.has(value as string) ? (value as string) : null),
    deserialize: (raw) => (allowed.has(raw) ? (raw as EnumValue<Values>) : null),
  };
}

/**
 * Joins items with `separator` into one string, such as `a,b`. `''` is the empty list. Inside an
 * item, a backslash escapes the separator and itself: `['red, green', 'blue']` writes
 * `red\, green,blue`. An empty item fails to convert.
 */
export function listCodec<T>(
  item: UrlParamCodec<T>,
  separator: string,
): UrlParamCodec<readonly T[]> {
  const usableSeparator =
    typeof separator === 'string' && separator !== '' && !separator.includes('\\');
  if (!usableSeparator) {
    throw new Error(
      "listCodec(): the separator can't be empty or hold a backslash. Use a character like ','.",
    );
  }
  return {
    serialize(values) {
      if (!Array.isArray(values)) {
        return null;
      }
      const items: string[] = [];
      for (const value of values) {
        const output = item.serialize(value);
        const writable = typeof output === 'string' && output !== '';
        if (!writable) {
          return null;
        }
        items.push(output.replaceAll('\\', '\\\\').replaceAll(separator, `\\${separator}`));
      }
      return items.join(separator);
    },
    deserialize(raw) {
      if (raw === '') {
        return [];
      }
      const parts: string[] = [];
      let part = '';
      for (let i = 0; i < raw.length;) {
        if (raw[i] === '\\') {
          const escaped = raw.startsWith(separator, i + 1) ? separator : raw[i + 1];
          const knownEscape = escaped === separator || escaped === '\\';
          if (!knownEscape) {
            return null;
          }
          part += escaped;
          i += 1 + escaped.length;
        } else if (raw.startsWith(separator, i)) {
          parts.push(part);
          part = '';
          i += separator.length;
        } else {
          part += raw[i];
          i += 1;
        }
      }
      parts.push(part);
      const values: T[] = [];
      for (const text of parts) {
        if (text === '') {
          return null;
        }
        const value = item.deserialize(text);
        if (!isConverted(value)) {
          return null;
        }
        values.push(value);
      }
      return values;
    },
  };
}
