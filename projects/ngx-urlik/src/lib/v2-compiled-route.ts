import {
  ActivatedRouteSnapshot,
  convertToParamMap,
  ParamMap,
  Route,
  Routes,
} from '@angular/router';
import type { RuntimeParam } from './compiled-route';
import { isEqual } from './is-equal';
import { stringCodec } from './params';
import { parseRoutePath, resolvePathParamDefinitions, RouteDefinition } from './route-definition';
import { routeConfigBrand } from './route-symbols';

export interface CompiledV2Route {
  readonly identifier?: string;
  readonly identity: string;
  readonly fullIdentity: string;
  readonly definition: RouteDefinition;
  readonly angular: Route;
  readonly parent?: CompiledV2Route;
  readonly pathParams: RuntimeParam[];
  readonly queryParams: RuntimeParam[];
  readonly segments: readonly (
    { kind: 'static'; value: string } | { kind: 'param'; name: string }
  )[];
  readonly pattern: string;
  readonly comparator: (a: unknown, b: unknown) => boolean;
}

const defaultPathCodec = stringCodec();

export function compileV2Routes(definitions: readonly RouteDefinition[]): {
  readonly routes: Routes;
  readonly catalog: ReadonlyMap<string, CompiledV2Route>;
} {
  const catalog = new Map<string, CompiledV2Route>();
  const hasLibraryFields = (routes: readonly RouteDefinition[]): boolean =>
    routes.some(
      (route) =>
        'identifier' in route ||
        'pathParam' in route ||
        'queryParams' in route ||
        'isEqual' in route ||
        (route.children ? hasLibraryFields(route.children) : false),
    );
  if (!hasLibraryFields(definitions)) return { routes: definitions as Routes, catalog };

  const compile = (
    definitions: readonly RouteDefinition[],
    parent?: CompiledV2Route,
    location = 'routes',
  ): Routes =>
    definitions.map((definition, index) => {
      const at = `${location}[${index}]`;
      const {
        identifier,
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
      const info: CompiledV2Route = {
        identifier,
        identity: identifier ?? at,
        fullIdentity: identifier ?? at,
        definition,
        angular,
        parent,
        pathParams: [...(parent?.pathParams ?? [])],
        queryParams: [...(parent?.queryParams ?? [])],
        segments: parsed.segments,
        pattern,
        comparator: comparator ?? parent?.comparator ?? isEqual,
      };
      for (const name of parsed.placeholders) {
        info.pathParams.push({
          name,
          definition: { kind: 'path', name, codec: configured[name]?.codec ?? defaultPathCodec },
          owner: info,
          placement: 'path',
        });
      }
      for (const [name, definition] of Object.entries(queryParams ?? {})) {
        info.queryParams.push({ name, definition, owner: info, placement: 'query' });
      }
      (angular as Record<PropertyKey, unknown>)[routeConfigBrand] = info;
      if (identifier) catalog.set(identifier, info);
      if (children) angular.children = compile(children, info, `${at}.children`);
      return angular;
    });

  return { routes: compile(definitions), catalog };
}

export function findActiveV2Route(
  root: ActivatedRouteSnapshot,
  target: CompiledV2Route,
): ActivatedRouteSnapshot | null {
  if (
    root.routeConfig === target.angular ||
    (root.routeConfig as Record<PropertyKey, unknown> | null)?.[routeConfigBrand] === target
  )
    return root;
  for (const child of root.children) {
    if (child.outlet !== 'primary') continue;
    const found = findActiveV2Route(child, target);
    if (found) return found;
  }
  return null;
}

export function activeV2PathParams(
  target: CompiledV2Route,
  active: ActivatedRouteSnapshot,
): ParamMap {
  const path: Record<string, string> = {};
  for (const param of target.pathParams) {
    const owner = param.owner as CompiledV2Route;
    const snapshot = active.pathFromRoot.find(
      (part) =>
        part.routeConfig === owner.angular ||
        (part.routeConfig as Record<PropertyKey, unknown> | null)?.[routeConfigBrand] === owner,
    );
    const value = snapshot?.paramMap.get(param.name);
    if (value !== null && value !== undefined) path[param.name] = value;
  }
  return convertToParamMap(path);
}

export function assertV2RouteConfig(routerRoutes: Routes, target: CompiledV2Route): void {
  const contains = (routes: Routes): boolean =>
    routes.some((route) => {
      if ((route as Record<PropertyKey, unknown>)[routeConfigBrand] === target) return true;
      return route.children ? contains(route.children) : false;
    });
  if (!contains(routerRoutes))
    throw new Error(
      `${target.identity}: its route configuration was replaced. Recreate the app router instead of calling Router.resetConfig().`,
    );
}
