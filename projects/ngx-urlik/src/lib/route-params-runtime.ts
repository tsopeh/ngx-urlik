import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { ParamMap } from '@angular/router';
import { CompiledRoute, RuntimeParam } from './compiled-route';
import { isEqual } from './is-equal';
import { AnyQueryParamDefinition, DefaultValue, UrlParamCodec } from './params';
import { ReportParameterFailure } from './route-diagnostics';
import type { AnyRecord } from './type-utils';

export type RuntimeState = Readonly<{ path: AnyRecord; query: AnyRecord }>;

const resolveDefault = <T>(value: DefaultValue<T> | undefined): T | undefined =>
  typeof value === 'function' ? (value as () => T)() : value;

export function createParameterReader(report: ReportParameterFailure) {
  const decode = (param: RuntimeParam, raw: string, index?: number): unknown | null => {
    try {
      const value = (param.definition.codec as UrlParamCodec<unknown>).deserialize(raw);
      if (value === null || value === undefined)
        report(
          param,
          { code: 'PARAM_DESERIALIZE_FAILED', operation: 'deserialize', index },
          'was invalid',
        );
      return value;
    } catch (cause) {
      report(
        param,
        { code: 'PARAM_DESERIALIZE_FAILED', operation: 'deserialize', index, cause },
        'threw in its codec',
      );
      return null;
    }
  };

  const queryFallback = (definition: AnyQueryParamDefinition) => {
    const fallback = resolveDefault(definition.defaultValue as DefaultValue<unknown> | undefined);
    return fallback ?? (definition.mode === 'scalar' ? null : []);
  };

  const readQuery = (param: RuntimeParam, query: ParamMap): unknown => {
    const definition = param.definition as AnyQueryParamDefinition;
    const raws = query.getAll(param.name);
    if (raws.length === 0) return queryFallback(definition);
    if (definition.mode === 'scalar') {
      const value = decode(param, raws.at(-1)!);
      return value ?? queryFallback(definition);
    }
    if (definition.mode === 'delimited' && raws.length !== 1) {
      report(
        param,
        { code: 'INVALID_ARRAY_REPRESENTATION', operation: 'deserialize' },
        'used repeated keys for a delimited value',
      );
      return queryFallback(definition);
    }
    const encoded = definition.mode === 'repeated' ? raws : raws[0].split(definition.separator!);
    const values: unknown[] = [];
    let invalid = false;
    encoded.forEach((item, index) => {
      let raw = item;
      if (definition.mode === 'delimited') {
        try {
          raw = decodeURIComponent(item);
        } catch (cause) {
          report(
            param,
            {
              code: 'PARAM_DESERIALIZE_FAILED',
              operation: 'deserialize',
              index,
              cause,
            },
            'had malformed item encoding',
          );
          invalid = true;
          return;
        }
      }
      const value = decode(param, raw, index);
      if (value === null || value === undefined) invalid = true;
      else values.push(value);
    });
    return invalid ? queryFallback(definition) : values;
  };

  const readQueryState = (params: readonly RuntimeParam[], query: ParamMap): AnyRecord => {
    const result: Record<string, unknown> = {};
    for (const param of params) {
      result[param.name] = readQuery(param, query);
    }
    return result;
  };

  const readState = (
    info: Pick<CompiledRoute, 'identity' | 'pattern' | 'pathParams' | 'queryParams'>,
    params: ParamMap,
    query: ParamMap,
    attemptedPath: string,
  ): RuntimeState => {
    const path: Record<string, unknown> = {};
    for (const param of info.pathParams) {
      const raw = params.get(param.name);
      const value = raw === null ? null : decode(param, raw);
      if (raw === null || value === null || value === undefined)
        throw new Error(
          `${info.identity}: expected active route '${info.pattern}', attempted current path '${attemptedPath}' could not resolve '${param.name}'`,
        );
      path[param.name] = value;
    }
    return { path, query: readQueryState(info.queryParams, query) };
  };

  return { readState, readQueryState };
}

export function createParameterSerializer(
  injector: EnvironmentInjector,
  report: ReportParameterFailure,
) {
  const encode = (param: RuntimeParam, value: unknown, index?: number): string | null => {
    try {
      const output = (param.definition.codec as UrlParamCodec<unknown>).serialize(value);
      if (typeof output !== 'string') {
        report(
          param,
          { code: 'PARAM_SERIALIZE_FAILED', operation: 'serialize', index },
          'was invalid',
        );
        return null;
      }
      return output;
    } catch (cause) {
      report(
        param,
        { code: 'PARAM_SERIALIZE_FAILED', operation: 'serialize', index, cause },
        'threw in its codec',
      );
      return null;
    }
  };

  /** Path values have no fallback, so a failed segment is a caller error. */
  const serializePath = (param: RuntimeParam, value: unknown): string => {
    let output: unknown;
    try {
      output = (param.definition.codec as UrlParamCodec<unknown>).serialize(value);
    } catch (cause) {
      throw new Error(
        `${param.owner.fullIdentity}: serialize path parameter '${param.name}' threw in its codec`,
        { cause },
      );
    }
    if (typeof output !== 'string' || output === '')
      throw new Error(
        `${param.owner.fullIdentity}: serialize path parameter '${param.name}' ${
          output === '' ? 'produced an empty path segment' : 'was invalid'
        }`,
      );
    return output;
  };

  const serializeQuery = (
    param: RuntimeParam,
    value: unknown,
  ): string | readonly string[] | null => {
    const definition = param.definition as AnyQueryParamDefinition;
    const fallback = runInInjectionContext(injector, () =>
      resolveDefault(definition.defaultValue as DefaultValue<unknown> | undefined),
    );
    if (fallback !== undefined && isEqual(value, fallback)) return null;
    if (definition.mode === 'scalar') return value === null ? null : encode(param, value);
    if (!Array.isArray(value)) {
      report(
        param,
        { code: 'PARAM_SERIALIZE_FAILED', operation: 'serialize' },
        'expected an array',
      );
      return null;
    }
    if (value.length === 0) return null;
    const items: string[] = [];
    let invalid = false;
    value.forEach((item, index) => {
      const output = encode(param, item, index);
      if (output === null) invalid = true;
      else items.push(output);
    });
    if (invalid) return null;
    return definition.mode === 'repeated'
      ? items
      : items.map((item) => encodeURIComponent(item)).join(definition.separator!);
  };

  return { serializePath, serializeQuery };
}
