import { ActivatedRouteSnapshot, ParamMap, Route, Routes } from '@angular/router';
import { isEqual } from './is-equal';
import { AnyQueryParamDefinition, PathParamDefinition } from './params';
import { RouteDefinition } from './route-definition';

export type ParameterPlacement = 'path' | 'query';

export interface RuntimeParam {
  readonly name: string;
  readonly definition: PathParamDefinition<unknown> | AnyQueryParamDefinition;
  readonly owner: CompiledRoute;
  readonly placement: ParameterPlacement;
}

export interface CompiledRoute {
  readonly identity: string;
  readonly fullIdentity: string;
  readonly definition: RouteDefinition;
  readonly angular: Route;
  readonly parent?: CompiledRoute;
  ownPath?: RuntimeParam;
  readonly pathParams: RuntimeParam[];
  readonly queryParams: RuntimeParam[];
  readonly pattern: string;
  readonly fallback: boolean;
  readonly redirect: boolean;
  readonly comparator: (a: unknown, b: unknown) => boolean;
  readonly children: CompiledRoute[];
}

export const routeConfigBrand: unique symbol = Symbol('ngx-urlik route config identity');

export function findActiveRoute(
  root: ActivatedRouteSnapshot,
  target: Route,
): ActivatedRouteSnapshot | null {
  if (
    root.routeConfig === target ||
    (root.routeConfig as Record<PropertyKey, unknown> | null)?.[routeConfigBrand] ===
      (target as Record<PropertyKey, unknown>)[routeConfigBrand]
  )
    return root;
  for (const child of root.children) {
    if (child.outlet !== 'primary') continue;
    const found = findActiveRoute(child, target);
    if (found) return found;
  }
  return null;
}

export function createCompiledRoute(
  identity: string,
  definition: RouteDefinition,
  parent?: CompiledRoute,
): CompiledRoute {
  const fallback = definition.path === '**';
  return {
    identity,
    fullIdentity: parent ? `${parent.fullIdentity}.${identity}` : identity,
    definition,
    parent,
    angular: { ...(definition.angular ?? {}) },
    pathParams: [...(parent?.pathParams ?? [])],
    queryParams: [...(parent?.queryParams ?? [])],
    pattern: [
      ...(parent ? [parent.pattern] : []),
      fallback
        ? '**'
        : definition.path + (definition.pathParam ? `/:${definition.pathParam.name}` : ''),
    ]
      .filter(Boolean)
      .join('/'),
    fallback,
    redirect: typeof definition.redirectTo === 'function',
    comparator: definition.isEqual ?? parent?.comparator ?? isEqual,
    children: [],
  };
}

type ReadRouteState = (
  route: CompiledRoute,
  params: ParamMap,
  query: ParamMap,
  attemptedPath: string,
) => Readonly<{
  path: Readonly<Record<string, unknown>>;
  query: Readonly<Record<string, unknown>>;
}>;

export function compileRouteDefinitions(
  definitions: Readonly<Record<string, RouteDefinition>>,
  readState: ReadRouteState,
): { readonly roots: CompiledRoute[]; readonly routes: Routes } {
  const roots: CompiledRoute[] = [];
  const compile = (
    currentDefinitions: Readonly<Record<string, RouteDefinition>>,
    parent?: CompiledRoute,
  ): Routes => {
    const compiled: Route[] = [];
    for (const [identity, definition] of Object.entries(currentDefinitions)) {
      const info = createCompiledRoute(identity, definition, parent);
      if (!info.fallback && definition.pathParam) {
        info.ownPath = {
          name: definition.pathParam.name,
          definition: definition.pathParam,
          owner: info,
          placement: 'path',
        };
        info.pathParams.push(info.ownPath);
      }
      for (const [name, param] of Object.entries(definition.queryParams ?? {}))
        info.queryParams.push({ name, definition: param, owner: info, placement: 'query' });
      if (parent) parent.children.push(info);
      else roots.push(info);
      const route = info.angular;
      (route as Record<PropertyKey, unknown>)[routeConfigBrand] = info;
      route.path = info.fallback
        ? '**'
        : definition.path + (definition.pathParam ? `/:${definition.pathParam.name}` : '');
      if (info.redirect) {
        route.pathMatch = 'full';
        route.redirectTo = (snapshot) => {
          const state = readState(
            info,
            snapshot.paramMap,
            snapshot.queryParamMap,
            `/${snapshot.url.map((segment) => segment.path).join('/')}`,
          );
          return definition.redirectTo!(state);
        };
      } else if (!info.fallback && definition.children)
        route.children = compile(definition.children, info);
      else if (!info.fallback && !route.component && !route.loadComponent) route.children = [];
      compiled.push(route);
    }
    return compiled;
  };
  return { roots, routes: compile(definitions) };
}
