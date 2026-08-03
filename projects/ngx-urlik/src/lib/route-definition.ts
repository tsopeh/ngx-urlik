import { Route, UrlTree } from '@angular/router';
import { AnyQueryParamDefinition, PathParamDefinition } from './params';

export type QueryDefinitions = Readonly<Record<string, AnyQueryParamDefinition>>;

const angularRouteFields = [
  'component',
  'loadComponent',
  'canMatch',
  'canActivate',
  'canActivateChild',
  'canDeactivate',
  'resolve',
  'data',
  'title',
  'providers',
  'runGuardsAndResolvers',
] as const satisfies readonly (keyof Route)[];
const redirectAngularFields = [
  'canMatch',
  'providers',
  'data',
] as const satisfies readonly (keyof Route)[];

export type AngularRouteOptions = Pick<Route, (typeof angularRouteFields)[number]>;
export type AngularRedirectOptions = Pick<Route, (typeof redirectAngularFields)[number]>;

export interface RouteDefinition {
  readonly path: string;
  readonly pathParam?: PathParamDefinition<unknown>;
  readonly queryParams?: QueryDefinitions;
  readonly children?: Readonly<Record<string, RouteDefinition>>;
  readonly angular?: AngularRouteOptions;
  readonly isEqual?: (a: unknown, b: unknown) => boolean;
  readonly redirectTo?: (values: any) => UrlTree;
}

const forbiddenPath = /[\/:?#;()]/;
const encodedOutputCharacter = /^[A-Za-z0-9\-_.!~*'()%]$/;

export function validateRouteDefinitions(
  routes: Readonly<Record<string, RouteDefinition>>,
): string[] {
  const errors: string[] = [];
  if (routes === null || typeof routes !== 'object' || Array.isArray(routes)) {
    return ['routes: route collection must be a non-null object'];
  }
  if (Object.keys(routes).length !== 1)
    errors.push('routes must contain exactly one named root route');
  const visit = (
    siblings: Readonly<Record<string, RouteDefinition>>,
    ancestry: Set<string>,
    location: string,
    root: boolean,
  ) => {
    const patterns = new Map<string, string>();
    let fallbackSeen = false;
    for (const [identity, definition] of Object.entries(siblings)) {
      const at = location ? `${location}.${identity}` : identity;
      if (!identity) errors.push(`${at}: route identity must be non-empty`);
      if (['navigate', 'createUrlTree', 'urlParams'].includes(identity))
        errors.push(`${at}: '${identity}' is a reserved router method name`);
      if (root && ['escapeHatch', 'activeRoute'].includes(identity))
        errors.push(`${at}: '${identity}' is reserved at the router root`);
      if (definition === null || typeof definition !== 'object' || Array.isArray(definition)) {
        errors.push(`${at}: route definition must be a non-null object`);
        continue;
      }
      const fallback = definition.path === '**';
      const hasRedirect = 'redirectTo' in definition;
      const redirect = hasRedirect && typeof definition.redirectTo === 'function';
      if (hasRedirect && !redirect) errors.push(`${at}: redirectTo must be a function`);
      if (root && fallback) errors.push(`${at}: the root route cannot be a fallback`);
      const allowed = new Set(
        fallback
          ? ['path', 'queryParams', 'angular', 'isEqual']
          : redirect
            ? ['path', 'pathParam', 'queryParams', 'redirectTo', 'angular']
            : ['path', 'pathParam', 'queryParams', 'children', 'angular', 'isEqual'],
      );
      for (const key of Object.keys(definition))
        if (!allowed.has(key)) errors.push(`${at}: unknown route property '${key}'`);
      if (fallback) {
        if (fallbackSeen)
          errors.push(`${at}: only one fallback route is allowed per sibling branch`);
        fallbackSeen = true;
      } else if (fallbackSeen) errors.push(`${at}: fallback routes must be declared last`);
      if (!fallback) {
        const path = definition.path;
        if (
          typeof path !== 'string' ||
          (!root && path === '') ||
          path === '**' ||
          forbiddenPath.test(path)
        )
          errors.push(`${at}: path must be ${root ? 'empty or ' : ''}one valid static segment`);
        const pattern = `${path}${definition.pathParam ? '/:param' : ''}`;
        const previous = patterns.get(pattern);
        if (previous)
          errors.push(`${at}: duplicates sibling URL pattern '${pattern}' from ${previous}`);
        else patterns.set(pattern, at);
      }
      const angular = definition.angular;
      if (
        angular !== undefined &&
        (angular === null || typeof angular !== 'object' || Array.isArray(angular))
      )
        errors.push(`${at}.angular: Angular options must be a non-null object`);
      else if (angular) {
        const allowedAngular = new Set<string>(
          redirect ? redirectAngularFields : angularRouteFields,
        );
        for (const key of Object.keys(angular))
          if (!allowedAngular.has(key))
            errors.push(`${at}.angular: unknown Angular route property '${key}'`);
        if (angular.component && angular.loadComponent)
          errors.push(`${at}.angular: component and loadComponent are mutually exclusive`);
      }
      const names = new Set(ancestry);
      if (!fallback && definition.pathParam) {
        if (!definition.pathParam.name) errors.push(`${at}: path parameter name must be non-empty`);
        if (names.has(definition.pathParam.name))
          errors.push(
            `${at}: parameter '${definition.pathParam.name}' shadows an ancestor parameter`,
          );
        names.add(definition.pathParam.name);
      }
      for (const [name, param] of Object.entries(definition.queryParams ?? {})) {
        if (names.has(name))
          errors.push(
            `${at}: parameter '${name}' shadows another path or query parameter in this ancestry`,
          );
        names.add(name);
        if (param.mode === 'delimited') {
          const separator = param.separator ?? '';
          if (Array.from(separator).length !== 1 || encodedOutputCharacter.test(separator))
            errors.push(
              `${at}: query parameter '${name}' separator must be one character escaped by encodeURIComponent`,
            );
        }
      }
      if (!fallback && !redirect && definition.children) {
        if (
          typeof definition.children !== 'object' ||
          definition.children === null ||
          Array.isArray(definition.children)
        )
          errors.push(`${at}.children: route collection must be a non-null object`);
        else visit(definition.children, names, at, false);
      }
    }
  };
  visit(routes, new Set(), '', true);
  return errors;
}
