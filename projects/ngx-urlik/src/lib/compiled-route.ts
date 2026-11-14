import {
  ActivatedRouteSnapshot,
  convertToParamMap,
  ParamMap,
  Route,
  Routes,
  UrlSegment,
} from '@angular/router';
import type { AnyQueryParamDefinition, UrlParamCodec } from './params';
import { isConverted, stringCodec } from './params';
import { parseRoutePath, RouteDefinition } from './route-definition';
import { compiledRouteKey } from './route-symbols';

interface CompiledParamBase {
  readonly name: string;
  readonly codec: UrlParamCodec<unknown>;
  readonly owner: Pick<CompiledRoute, 'label'>;
}
export interface CompiledPathParam extends CompiledParamBase {
  readonly placement: 'path';
}
export interface CompiledQueryParam extends CompiledParamBase {
  readonly placement: 'query';
  readonly definition: AnyQueryParamDefinition;
}
export type CompiledParam = CompiledPathParam | CompiledQueryParam;

export const compileQueryParam = (
  name: string,
  definition: AnyQueryParamDefinition,
  owner: Pick<CompiledRoute, 'label'>,
): CompiledQueryParam => ({ name, codec: definition.codec, definition, owner, placement: 'query' });

export interface CompiledRoute {
  readonly routeName?: string;
  // What errors call this route: its routeName, or its position, such as `routes[0].children[1]`.
  readonly label: string;
  readonly pathParams: readonly CompiledPathParam[];
  readonly queryParams: readonly CompiledQueryParam[];
  readonly fullSegments: readonly (
    { kind: 'static'; value: string } | { kind: 'param'; name: string; param: CompiledPathParam }
  )[];
  readonly pattern: string;
}

const defaultPathCodec = stringCodec();

export function compileRoutes(definitions: readonly RouteDefinition[]): {
  readonly routes: Routes;
  readonly namedRoutes: ReadonlyMap<string, CompiledRoute>;
} {
  const namedRoutes = new Map<string, CompiledRoute>();
  const compile = (
    definitions: readonly RouteDefinition[],
    parent?: CompiledRoute,
    location = 'routes',
  ): Routes =>
    definitions.map((definition, index) => {
      const { routeName, pathParam, queryParams, children, ...angularFields } = definition;
      const angularRoute: Route = { ...angularFields };
      const parsed = parseRoutePath(definition.path ?? '');
      const at = `${location}[${index}]`;
      const owner = { label: routeName ?? at };
      const ownPath = parsed.placeholders.map((name): CompiledPathParam => ({
        name,
        codec: pathParam?.[name] ?? defaultPathCodec,
        owner,
        placement: 'path',
      }));
      const localSegments = parsed.segments.map((segment) =>
        segment.kind === 'static'
          ? segment
          : { ...segment, param: ownPath.find((param) => param.name === segment.name)! },
      );
      const info: CompiledRoute = {
        routeName,
        label: owner.label,
        pathParams: [...(parent?.pathParams ?? []), ...ownPath],
        queryParams: [
          ...(parent?.queryParams ?? []),
          ...Object.entries(queryParams ?? {}).map(([name, definition]) =>
            compileQueryParam(name, definition, owner),
          ),
        ],
        fullSegments: [...(parent?.fullSegments ?? []), ...localSegments],
        pattern: [parent?.pattern, definition.path].filter(Boolean).join('/'),
      };

      const codecs = parsed.segments.map((segment) =>
        segment.kind === 'param' ? pathParam?.[segment.name] : undefined,
      );
      if (codecs.some(Boolean)) {
        angularRoute.canMatch = [matchPathCodecs(codecs), ...(angularRoute.canMatch ?? [])];
      }
      (angularRoute as Record<PropertyKey, unknown>)[compiledRouteKey] = info;
      if (routeName) {
        namedRoutes.set(routeName, info);
      }
      if (children) {
        angularRoute.children = compile(children, info, `${at}.children`);
      }
      return angularRoute;
    });

  return { routes: compile(definitions), namedRoutes };
}

/** Rejects a match whose path values don't decode, so Angular tries the next route. */
function matchPathCodecs(
  codecs: readonly (UrlParamCodec<unknown> | undefined)[],
): (_route: unknown, segments: readonly UrlSegment[]) => boolean {
  return (_route, segments) =>
    codecs.every((codec, index) => {
      if (!codec) {
        return true;
      }
      const segment = segments[index];
      if (!segment) {
        return false;
      }
      try {
        return isConverted(codec.deserialize(segment.path));
      } catch {
        return false;
      }
    });
}

export function findActiveRoute(
  root: ActivatedRouteSnapshot,
  target: CompiledRoute,
): ActivatedRouteSnapshot | null {
  if (compiledRouteOf(root) === target) {
    return root;
  }
  for (const child of root.children) {
    if (child.outlet !== 'primary') {
      continue;
    }
    const found = findActiveRoute(child, target);
    if (found) {
      return found;
    }
  }
  return null;
}

export function getPrimaryActiveChain(root: ActivatedRouteSnapshot): ActivatedRouteSnapshot[] {
  const chain = [root];
  let current = root;
  while (current.children.length) {
    const primary = current.children.find((c) => c.outlet === 'primary');
    if (!primary) {
      break;
    }
    current = primary;
    chain.push(current);
  }
  return chain;
}

/** The compiled route an Angular snapshot came from, if ngx-urlik compiled it. */
const compiledRouteOf = (snapshot: ActivatedRouteSnapshot): CompiledRoute | undefined =>
  (snapshot.routeConfig as Record<PropertyKey, unknown> | null)?.[compiledRouteKey] as
    CompiledRoute | undefined;

export function findLastResult<T, R>(
  items: readonly T[],
  mapper: (item: T) => R | null | undefined,
): R | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const result = mapper(items[i]);
    const found = result !== null && result !== undefined;
    if (found) {
      return result;
    }
  }
  return undefined;
}

export function activePathParams(target: CompiledRoute, active: ActivatedRouteSnapshot): ParamMap {
  const path: Record<string, string> = {};
  for (const param of target.pathParams) {
    const val = findLastResult(active.pathFromRoot, (snap) => snap.paramMap.get(param.name));
    if (val !== undefined) {
      path[param.name] = val;
    }
  }
  return convertToParamMap(path);
}
