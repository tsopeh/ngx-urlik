import { assertInInjectionContext, inject } from '@angular/core';
import { Route, Router, Routes, UrlTree } from '@angular/router';
import { UrlParamSerde } from './url-params';

interface UrlikRoute<
  TPathSlug extends string,
  TPathParamName extends string,
  TPathParamType extends UrlParamSerde<unknown>,
> extends Route {
  /**
   * Do not use Angular's `'path:variable'` syntax format for defining path variables.
   */
  path: TPathSlug;
  pathParam: { paramName: TPathParamName; serde: TPathParamType };
  queryParams: Record<string, UrlParamSerde<any>>;
}

type UrlikRoutes = Array<UrlikRoute<any, any, any>>;

interface InitUrlikParams {
  routes: UrlikRoutes;
}

interface InitUrlikOutput<TInitParams extends InitUrlikParams> {
  routes: Routes;
  urlik: () => {
    router: UrlikRouter<TInitParams['routes']>;
    urlParams: UrlikUrlParams<TInitParams['routes']>;
  };
}

type UrlikLocation<TUrlParams extends Record<string, any>> = {
  createUrlTree: (params: TUrlParams) => UrlTree;
  navigate: (params: TUrlParams) => Promise<boolean>;
};

type ExtractRouteConfig<
  TRoutes extends UrlikRoutes,
  TPath extends TRoutes[number]['path'],
> = Extract<TRoutes[number], { path: TPath }>;

type ExtractPathParam<TRoutes extends UrlikRoutes, TPath extends TRoutes[number]['path']> = {
  [TPathParamName in ExtractRouteConfig<
    TRoutes,
    TPath
  >['pathParam']['paramName']]: ExtractRouteConfig<
    TRoutes,
    TPath
  >['pathParam']['serde'] extends UrlParamSerde<infer TPathParamType>
    ? TPathParamType
    : never;
};

type ExtractQueryParams<TRoutes extends UrlikRoutes, TPath extends TRoutes[number]['path']> = {
  [TQueryParamName in keyof ExtractRouteConfig<TRoutes, TPath>['queryParams']]: ExtractRouteConfig<
    TRoutes,
    TPath
  >['queryParams'][TQueryParamName] extends UrlParamSerde<infer TQueryParamType>
    ? TQueryParamType
    : never;
};

type UrlikRouter<TRoutes extends UrlikRoutes> = {
  [TPath in TRoutes[number]['path']]: UrlikLocation<
    ExtractPathParam<TRoutes, TPath> & ExtractQueryParams<TRoutes, TPath>
  >;
};

type UrlikUrlParams<TRoutes extends UrlikRoutes> = {
  idk: TRoutes;
};

export function initUrlik<const TInitParams extends InitUrlikParams>(
  params: TInitParams,
): InitUrlikOutput<TInitParams> {
  const urlik: InitUrlikOutput<TInitParams>['urlik'] = () => {
    assertInInjectionContext(urlik);

    const angularRouter = inject(Router);

    const router: UrlikRouter<TInitParams['routes']> = null as any;

    const urlParams: UrlikUrlParams<TInitParams['routes']> = null as any;

    return {
      router,
      urlParams,
    };
  };

  return {
    routes: [],
    urlik,
  };
}
