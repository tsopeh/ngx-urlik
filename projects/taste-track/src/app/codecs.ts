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
      if (value.kind === 'countless') return 'countless';
      return Number.isSafeInteger(value.value) && value.value >= 0 ? String(value.value) : null;
    },
    deserialize(raw) {
      if (raw === 'countless') return { kind: 'countless' };
      if (!nonNegativeInteger.test(raw)) return null;
      const value = Number(raw);
      return Number.isSafeInteger(value) ? { kind: 'exact', value } : null;
    },
  };
}

export function positiveIntegerCodec(): UrlParamCodec<number> {
  return {
    serialize: (value) =>
      Number.isSafeInteger(value) && value > 0 && typeof value === 'number' ? String(value) : null,
    deserialize(raw) {
      if (!nonNegativeInteger.test(raw)) return null;
      const value = Number(raw);
      return Number.isSafeInteger(value) && value > 0 ? value : null;
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

export function sortCodec<const Field extends string>(
  fields: readonly Field[],
): UrlParamCodec<SortValue<Field>> {
  const allowed = new Set<string>(fields);
  return {
    serialize(value) {
      return allowed.has(value.field) && (value.direction === 'asc' || value.direction === 'desc')
        ? `${value.field}:${value.direction}`
        : null;
    },
    deserialize(raw) {
      const [field, direction, extra] = raw.split(':');
      if (extra || !allowed.has(field) || (direction !== 'asc' && direction !== 'desc'))
        return null;
      return { field: field as Field, direction };
    },
  };
}

export function paginationParams(options: {
  readonly defaultPageSize: PageSize;
  readonly pageSizes: readonly PageSize[];
}) {
  const sizes = new Set<number>(options.pageSizes);
  const pageSizeCodec: UrlParamCodec<PageSize> = {
    serialize: (value) => (sizes.has(value) ? String(value) : null),
    deserialize(raw) {
      if (!nonNegativeInteger.test(raw)) return null;
      const value = Number(raw);
      return sizes.has(value) ? (value as PageSize) : null;
    },
  };
  return {
    page: queryParam({ codec: positiveIntegerCodec(), defaultValue: 1 }),
    // Every list that uses this key remembers the last page size the user chose.
    pageSize: queryParam({
      codec: pageSizeCodec,
      defaultValue: options.defaultPageSize,
      persist: { key: 'pageSize', storage: 'local' },
    }),
  } as const;
}
