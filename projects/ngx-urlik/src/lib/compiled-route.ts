import {
  ActivatedRouteSnapshot,
  CanMatchFn,
  convertToParamMap,
  ParamMap,
  Route,
  Routes,
} from '@angular/router';
import { isEqual } from './is-equal';
import type { AnyQueryParamDefinition, UrlParamCodec } from './params';
import { stringCodec } from './params';
import { parseRoutePath, resolvePathParamDefinitions, RouteDefinition } from './route-definition';
import { routeConfigBrand } from './route-symbols';

export interface RuntimeParam {
  readonly name: string;
  readonly definition: { readonly codec: UrlParamCodec<unknown> } | AnyQueryParamDefinition;
  readonly owner: Pick<CompiledRoute, 'fullIdentity'>;
  readonly placement: 'path' | 'query';
}

export interface CompiledRoute {
  readonly routeName?: string;
  readonly identity: string;
  readonly fullIdentity: string;
  readonly definition: RouteDefinition;
  readonly angular: Route;
  readonly parent?: CompiledRoute;
  readonly pathParams: RuntimeParam[];
  readonly queryParams: RuntimeParam[];
  readonly segments: readonly (
    { kind: 'static'; value: string } | { kind: 'param'; name: string }
  )[];
  readonly fullSegments: readonly (
    { kind: 'static'; value: string } | { kind: 'param'; name: string; param: RuntimeParam }
  )[];
  readonly pattern: string;
  readonly comparator: (a: unknown, b: unknown) => boolean;
}

const defaultPathCodec = stringCodec();

export function compileRoutes(definitions: readonly RouteDefinition[]): {
  readonly routes: Routes;
  readonly catalog: ReadonlyMap<string, CompiledRoute>;
} {
  const catalog = new Map<string, CompiledRoute>();
  const hasLibraryFields = (routes: readonly RouteDefinition[]): boolean =>
    routes.some(
      (route) =>
        'routeName' in route ||
        'pathParam' in route ||
        'queryParams' in route ||
        'isEqual' in route ||
        (route.children ? hasLibraryFields(route.children) : false),
    );
  if (!hasLibraryFields(definitions)) return { routes: definitions as Routes, catalog };

  const compile = (
    definitions: readonly RouteDefinition[],
    parent?: CompiledRoute,
    location = 'routes',
  ): Routes =>
    definitions.map((definition, index) => {
      const at = `${location}[${index}]`;
      const {
        routeName,
        pathParam,
        queryParams,
        isEqual: comparator,
        children,
        ...angularFields
      } = definition;
      const angular: Route = { ...angularFields };
      const parsed = parseRoutePath(definition.path ?? '');
      const configured = resolvePathParamDefinitions(definition);
      const pattern = [parent?.pattern, definition.path].filter(Boolean).join('/');
      const info: CompiledRoute = {
        routeName,
        identity: routeName ?? at,
        fullIdentity: routeName ?? at,
        definition,
        angular,
        parent,
        pathParams: [...(parent?.pathParams ?? [])],
        queryParams: [...(parent?.queryParams ?? [])],
        segments: parsed.segments,
        fullSegments: [], // Populated below
        pattern,
        comparator: comparator ?? parent?.comparator ?? isEqual,
      };
      for (const name of parsed.placeholders) {
        info.pathParams.push({
          name,
          definition: { codec: configured[name]?.codec ?? defaultPathCodec },
          owner: info,
          placement: 'path',
        });
      }
      for (const [name, definition] of Object.entries(queryParams ?? {})) {
        info.queryParams.push({ name, definition, owner: info, placement: 'query' });
      }
      const localSegments = parsed.segments.map((segment) => {
        if (segment.kind === 'static') return segment;
        return {
          kind: 'param' as const,
          name: segment.name,
          param: info.pathParams.find((p) => p.name === segment.name && p.owner === info)!,
        };
      });
      (info as any).fullSegments = [...(parent?.fullSegments ?? []), ...localSegments];

      const codecs = parsed.segments.map((segment) =>
        segment.kind === 'param' ? configured[segment.name]?.codec : undefined,
      );
      if (codecs.some(Boolean))
        angular.canMatch = [matchPathCodecs(codecs), ...(angular.canMatch ?? [])];

      (angular as Record<PropertyKey, unknown>)[routeConfigBrand] = info;
      if (routeName) catalog.set(routeName, info);
      if (children) angular.children = compile(children, info, `${at}.children`);
      return angular;
    });

  return { routes: compile(definitions), catalog };
}

/** Rejects a match whose path values fail their codecs, so Angular tries the next route. */
function matchPathCodecs(codecs: readonly (UrlParamCodec<unknown> | undefined)[]): CanMatchFn {
  return (_route, segments) =>
    codecs.every((codec, index) => {
      if (!codec) return true;
      const segment = segments[index];
      if (!segment) return false;
      try {
        const value = codec.deserialize(segment.path);
        return value !== null && value !== undefined;
      } catch {
        return false;
      }
    });
}

export function findActiveRoute(
  root: ActivatedRouteSnapshot,
  target: CompiledRoute,
): ActivatedRouteSnapshot | null {
  if (
    root.routeConfig === target.angular ||
    (root.routeConfig as Record<PropertyKey, unknown> | null)?.[routeConfigBrand] === target
  )
    return root;
  for (const child of root.children) {
    if (child.outlet !== 'primary') continue;
    const found = findActiveRoute(child, target);
    if (found) return found;
  }
  return null;
}

export function getPrimaryActiveChain(root: ActivatedRouteSnapshot): ActivatedRouteSnapshot[] {
  const chain = [root];
  let current = root;
  while (current.children.length) {
    const primary = current.children.find((c) => c.outlet === 'primary');
    if (!primary) break;
    current = primary;
    chain.push(current);
  }
  return chain;
}

export function findLastResult<T, R>(
  items: readonly T[],
  mapper: (item: T) => R | null | undefined,
): R | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const result = mapper(items[i]);
    if (result !== null && result !== undefined) return result;
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
