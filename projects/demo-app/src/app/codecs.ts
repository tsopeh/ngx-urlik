import { queryParam, type UrlParamCodec } from 'ngx-urlik';
import type { ExperienceCount } from './backend';

export type PageSize = 12 | 24 | 48;
export type SortDirection = 'asc' | 'desc';
export type SortValue<Field extends string> = Readonly<{
  field: Field;
  direction: SortDirection;
}>;

const nonNegativeInteger = /^\d+$/;

export function experienceCountCodec(): UrlParamCodec<ExperienceCount> {
  return {
    serialize(value) {
      if (value.kind === 'countless') {
        return 'countless';
      }
      const countable = Number.isSafeInteger(value.value) && value.value >= 0;
      return countable ? String(value.value) : null;
    },
    deserialize(raw) {
      if (raw === 'countless') {
        return { kind: 'countless' };
      }
      if (!nonNegativeInteger.test(raw)) {
        return null;
      }
      const value = Number(raw);
      return Number.isSafeInteger(value) ? { kind: 'exact', value } : null;
    },
  };
}

export function positiveIntegerCodec(): UrlParamCodec<number> {
  return {
    serialize: (value) => {
      const positiveInteger = typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
      return positiveInteger ? String(value) : null;
    },
    deserialize(raw) {
      if (!nonNegativeInteger.test(raw)) {
        return null;
      }
      const value = Number(raw);
      const positiveInteger = Number.isSafeInteger(value) && value > 0;
      return positiveInteger ? value : null;
    },
  };
}

/** An ID such as `tv_wirefern`, written to the URL without its prefix: `wirefern`. */
export function prefixedIdCodec<const Prefix extends string>(
  prefix: Prefix,
): UrlParamCodec<`${Prefix}_${string}`> {
  const start = `${prefix}_`;
  const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return {
    serialize: (value) =>
      typeof value === 'string' && value.startsWith(start) && slug.test(value.slice(start.length))
        ? value.slice(start.length)
        : null,
    deserialize: (raw) => (slug.test(raw) ? `${prefix}_${raw}` : null),
  };
}

const isDirection = (value: unknown): value is SortDirection => value === 'asc' || value === 'desc';

export function sortCodec<const Field extends string>(
  fields: readonly Field[],
): UrlParamCodec<SortValue<Field>> {
  const allowed = new Set<string>(fields);
  return {
    serialize(value) {
      const writable = allowed.has(value.field) && isDirection(value.direction);
      return writable ? `${value.field}:${value.direction}` : null;
    },
    deserialize(raw) {
      const [field, direction, extra] = raw.split(':');
      const readable = !extra && allowed.has(field) && isDirection(direction);
      if (!readable) {
        return null;
      }
      return { field: field as Field, direction };
    },
  };
}

export function pageSizeCodec(pageSizes: readonly PageSize[]): UrlParamCodec<PageSize> {
  const sizes = new Set<number>(pageSizes);
  return {
    serialize: (value) => (sizes.has(value) ? String(value) : null),
    deserialize(raw) {
      if (!nonNegativeInteger.test(raw)) {
        return null;
      }
      const value = Number(raw);
      return sizes.has(value) ? (value as PageSize) : null;
    },
  };
}

/**
 * `pageSize` has no default, so the URL holds it only when the user picked one. A page falls back
 * to the size picked last, through `Preferences.pageSize()`.
 */
export function paginationParams(options: { readonly pageSizes: readonly PageSize[] }) {
  return {
    page: queryParam({ codec: positiveIntegerCodec(), defaultValue: 1 }),
    pageSize: queryParam({ codec: pageSizeCodec(options.pageSizes) }),
  } as const;
}
