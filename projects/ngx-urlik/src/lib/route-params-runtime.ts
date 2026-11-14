import { ActivatedRouteSnapshot, ParamMap } from '@angular/router';
import { findLastResult } from './compiled-route';
import { isConverted } from './params';
import type {
  CompiledParam,
  CompiledPathParam,
  CompiledQueryParam,
  CompiledRoute,
} from './compiled-route';
import { ReportParameterFailure } from './route-diagnostics';
import type { AnyRecord } from './type-utils';

export type RuntimeState = Readonly<{ path: AnyRecord; query: AnyRecord }>;
/**
 * The value each field last read, with the URL text it came from. While the text stays the same,
 * a read returns the same value, so a field that didn't change in the URL stays `===`.
 */
export type ValueCache = Map<CompiledParam, Readonly<{ text: string | null; value: unknown }>>;
/** A field's URL text: the last value when its key repeats, or `null` when absent. */
const fieldText = (param: CompiledQueryParam, query: ParamMap): string | null =>
  query.getAll(param.name).at(-1) ?? null;

export function createParameterReader(report: ReportParameterFailure) {
  /** The value that URL text stands for, or `undefined` if it doesn't decode. */
  const decode = (param: CompiledParam, raw: string): unknown => {
    const code = 'PARAM_DESERIALIZE_FAILED';
    try {
      const value = param.codec.deserialize(raw);
      if (isConverted(value)) {
        return value;
      }
      report(param, { code, operation: 'deserialize' }, 'the codec returned null');
    } catch (cause) {
      report(param, { code, operation: 'deserialize', cause }, 'the codec threw');
    }
    return undefined;
  };

  /** Reads one field from its URL text, or takes the cached value if the text didn't change. */
  const readField = (
    param: CompiledParam,
    text: string | null,
    cache: ValueCache | undefined,
    read: (text: string | null) => unknown,
  ): unknown => {
    const cached = cache?.get(param);
    const textUnchanged = cached !== undefined && cached.text === text;
    if (textUnchanged) {
      return cached.value;
    }
    const value = read(text);
    cache?.set(param, { text, value });
    return value;
  };

  const readQueryState = (
    params: readonly CompiledQueryParam[],
    query: ParamMap,
    cache?: ValueCache,
  ): AnyRecord => {
    const result: Record<string, unknown> = {};
    for (const param of params) {
      result[param.name] = readField(
        param,
        fieldText(param, query),
        cache,
        (text) =>
          (text === null ? undefined : decode(param, text)) ??
          param.definition.defaultValue ??
          null,
      );
    }
    return result;
  };

  const readState = (
    info: Pick<CompiledRoute, 'label' | 'pattern' | 'pathParams' | 'queryParams'>,
    params: ParamMap,
    query: ParamMap,
    attemptedUrl: () => string,
    cache?: ValueCache,
  ): RuntimeState => {
    const path: Record<string, unknown> = {};
    for (const param of info.pathParams) {
      path[param.name] = readField(param, params.get(param.name), cache, (raw) => {
        const value = raw === null ? undefined : decode(param, raw);
        if (value === undefined) {
          throw new Error(
            `${info.label}: can't read path parameter '${param.name}' from '${attemptedUrl()}' for route '${info.pattern}'`,
          );
        }
        return value;
      });
    }
    return { path, query: readQueryState(info.queryParams, query, cache) };
  };

  /** Each path value from the deepest active route with that placeholder, or `null`. */
  const readGlobalPath = (
    params: readonly CompiledPathParam[],
    chain: readonly ActivatedRouteSnapshot[],
    cache?: ValueCache,
  ): AnyRecord => {
    const result: Record<string, unknown> = {};
    for (const param of params) {
      const raw = findLastResult(chain, (snapshot) => snapshot.paramMap.get(param.name)) ?? null;
      result[param.name] = readField(
        param,
        raw,
        cache,
        (text) => (text === null ? undefined : decode(param, text)) ?? null,
      );
    }
    return result;
  };

  return { readState, readQueryState, readGlobalPath };
}

/**
 * Two states are the same when every field holds the same value. A `ValueCache` keeps a value while
 * its URL text stays the same, so this compares URL text, field by field.
 */
export const sameState = (a: RuntimeState, b: RuntimeState): boolean =>
  sameFields(a.path, b.path) && sameFields(a.query, b.query);

function sameFields(a: AnyRecord, b: AnyRecord): boolean {
  const names = Object.keys(a);
  return (
    names.length === Object.keys(b).length &&
    names.every((name) => Object.hasOwn(b, name) && Object.is(a[name], b[name]))
  );
}

export function createParameterSerializer(report: ReportParameterFailure) {
  const encode = (param: CompiledParam, value: unknown): string | null => {
    try {
      const output = param.codec.serialize(value);
      if (typeof output !== 'string') {
        report(
          param,
          { code: 'PARAM_SERIALIZE_FAILED', operation: 'serialize' },
          "the codec didn't return a string",
        );
        return null;
      }
      return output;
    } catch (cause) {
      report(
        param,
        { code: 'PARAM_SERIALIZE_FAILED', operation: 'serialize', cause },
        'the codec threw',
      );
      return null;
    }
  };

  /** A path value has no fallback, so a value that won't serialize is the caller's bug. */
  const serializePath = (param: CompiledParam, value: unknown): string => {
    let output: unknown;
    try {
      output = param.codec.serialize(value);
    } catch (cause) {
      throw new Error(
        `${param.owner.label}: can't write path parameter '${param.name}': the codec threw`,
        { cause },
      );
    }
    const fail = (detail: string) =>
      new Error(`${param.owner.label}: can't write path parameter '${param.name}': ${detail}`);
    if (typeof output !== 'string') {
      throw fail("the codec didn't return a string");
    }
    if (output === '') {
      throw fail("the codec returned '', and a path segment can't be empty");
    }
    // Encoding doesn't help: a browser reads %2E%2E as '..' too, so a reload would leave the page.
    const dotSegment = output === '.' || output === '..';
    if (dotSegment) {
      throw fail(`the codec returned '${output}', and browsers drop '.' and '..' path segments`);
    }
    return output;
  };

  // Each field's default, as URL text. Built on first use, so a bad default reports once.
  const defaultTexts = new WeakMap<CompiledQueryParam, string | null>();
  /** A value that writes the same text as the default leaves the URL. */
  const serializeQuery = (param: CompiledQueryParam, value: unknown): string | null => {
    const output = value === null ? null : encode(param, value);
    const { defaultValue } = param.definition;
    const nothingToCompare = output === null || defaultValue === undefined;
    if (nothingToCompare) {
      return output;
    }
    if (!defaultTexts.has(param)) {
      defaultTexts.set(param, encode(param, defaultValue));
    }
    const atDefault = output === defaultTexts.get(param);
    return atDefault ? null : output;
  };

  return { serializePath, serializeQuery };
}
