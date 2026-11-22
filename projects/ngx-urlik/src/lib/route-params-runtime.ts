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
 * The value each parameter last read, with the URL text it came from. While the text stays the
 * same, a read returns the same value, so a parameter that didn't change in the URL stays `===`.
 */
export type ValueCache = Map<CompiledParam, Readonly<{ text: string | null; value: unknown }>>;
/** A query parameter's text: the last value when its key repeats, or `null` when absent. */
const fieldText = (param: CompiledQueryParam, query: ParamMap): string | null =>
  query.getAll(param.name).at(-1) ?? null;

export function createParameterReader(report: ReportParameterFailure) {
  /** Decodes a parameter's text. When the codec fails, reports it and returns `undefined`. */
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

  /** Reads one parameter from its text, or takes the cached value if the text didn't change. */
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
      result[param.name] = readField(param, fieldText(param, query), cache, (text) => {
        const fallback = param.definition.hasDefault ? param.definition.defaultValue : null;
        return (text === null ? undefined : decode(param, text)) ?? fallback;
      });
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

  /** Each path parameter from the deepest active route with that placeholder, or `null`. */
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
 * Compares each parameter with `Object.is`. A `ValueCache` keeps a value while its URL text stays
 * the same, so this compares URL text, parameter by parameter.
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

type DiagnosticMode = 'report' | 'silent';

export type EncodedQueryText =
  Readonly<{ ok: true; text: string | null }> | Readonly<{ ok: false }>;

export type EncodedPathText = Readonly<{ ok: true; text: string }> | Readonly<{ ok: false }>;

type SerializeOutcome =
  Readonly<{ ok: true; text: string }> | Readonly<{ ok: false; detail: string; cause?: unknown }>;

function trySerialize(param: CompiledParam, value: unknown): SerializeOutcome {
  try {
    const output = param.codec.serialize(value);
    if (typeof output !== 'string') {
      return { ok: false, detail: "the codec didn't return a string" };
    }
    return { ok: true, text: output };
  } catch (cause) {
    return { ok: false, detail: 'the codec threw', cause };
  }
}

export function createParameterSerializer(report: ReportParameterFailure) {
  const reportFailure = (
    param: CompiledParam,
    outcome: Extract<SerializeOutcome, { ok: false }>,
  ) => {
    report(
      param,
      {
        code: 'PARAM_SERIALIZE_FAILED',
        operation: 'serialize',
        ...(outcome.cause !== undefined ? { cause: outcome.cause } : {}),
      },
      outcome.detail,
    );
  };

  const encode = (
    param: CompiledParam,
    value: unknown,
    diagnostics: DiagnosticMode = 'report',
  ): EncodedPathText => {
    const outcome = trySerialize(param, value);
    if (!outcome.ok) {
      if (diagnostics === 'report') {
        reportFailure(param, outcome);
      }
      return { ok: false };
    }
    return { ok: true, text: outcome.text };
  };

  /** Throws instead of reporting. A path parameter has no fallback, so a bad value is a bug. */
  const serializePath = (param: CompiledParam, value: unknown): string => {
    const fail = (detail: string, cause?: unknown) =>
      new Error(
        `${param.owner.label}: can't write path parameter '${param.name}': ${detail}`,
        cause !== undefined ? { cause } : undefined,
      );
    const outcome = trySerialize(param, value);
    if (!outcome.ok) {
      throw fail(outcome.detail, outcome.cause);
    }
    const output = outcome.text;
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

  // Each query parameter's default, serialized once on first use. Bad defaults report at most once
  // on the first non-silent write or check.
  const defaultOutcomes = new WeakMap<CompiledQueryParam, SerializeOutcome>();
  const reportedBadDefaults = new WeakSet<CompiledQueryParam>();
  const defaultText = (
    param: CompiledQueryParam,
    defaultValue: unknown,
    diagnostics: DiagnosticMode,
  ): string | null => {
    let outcome = defaultOutcomes.get(param);
    if (!outcome) {
      outcome = trySerialize(param, defaultValue);
      defaultOutcomes.set(param, outcome);
    }
    if (!outcome.ok) {
      const shouldReport = diagnostics === 'report' && !reportedBadDefaults.has(param);
      if (shouldReport) {
        reportedBadDefaults.add(param);
        reportFailure(param, outcome);
      }
      return null;
    }
    return outcome.text;
  };

  /**
   * Encodes a query parameter to its canonical URL text: `{ ok: true, text: null }` when it leaves
   * the URL (for `null` or its default), `{ ok: true, text: string }` when written, or
   * `{ ok: false }` when its codec fails.
   */
  const queryText = (
    param: CompiledQueryParam,
    value: unknown,
    diagnostics: DiagnosticMode = 'report',
  ): EncodedQueryText => {
    if (value === null) {
      return { ok: true, text: null };
    }
    const encoded = encode(param, value, diagnostics);
    if (!encoded.ok) {
      return encoded;
    }
    if (!param.definition.hasDefault) {
      return encoded;
    }
    const atDefault =
      encoded.text === defaultText(param, param.definition.defaultValue, diagnostics);
    return atDefault ? { ok: true, text: null } : encoded;
  };

  const serializeQuery = (param: CompiledQueryParam, value: unknown): string | null => {
    const encoded = queryText(param, value);
    return encoded.ok ? encoded.text : null;
  };

  /** Compares two query values by their canonical URL text, without reporting diagnostics. */
  const sameQueryValue = (param: CompiledQueryParam, a: unknown, b: unknown): boolean => {
    if (Object.is(a, b)) {
      return true;
    }
    // A defaulted parameter reads as its default when absent, not null, so null differs from it.
    const nullAgainstDefault = param.definition.hasDefault && (a === null || b === null);
    if (nullAgainstDefault) {
      return false;
    }
    const aText = queryText(param, a, 'silent');
    if (!aText.ok) {
      return false;
    }
    const bText = queryText(param, b, 'silent');
    return bText.ok && aText.text === bText.text;
  };

  return {
    serializePath,
    serializeQuery,
    queryText,
    sameQueryValue,
    /** Encodes a path parameter to its URL text, or `{ ok: false }` when its codec fails. */
    pathText: (param: CompiledParam, value: unknown): EncodedPathText => encode(param, value),
  };
}
