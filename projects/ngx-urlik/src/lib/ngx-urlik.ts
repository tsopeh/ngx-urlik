import { Signal } from '@angular/core';
import { NavigationExtras, Route, Routes, UrlTree } from '@angular/router';
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
  children: Array<UrlikRoute<any, any, any>>;
}

type UrlikRoutes = Array<UrlikRoute<any, any, any>>;

interface InitUrlikParams {
  routes: UrlikRoutes;
}

interface InitUrlikOutput<TInitParams extends InitUrlikParams> {
  routes: Routes;
  providers: Array<unknown>;

  router: () => UrlikRouter<TInitParams['routes']>;
  urlParams: UrlikUrlParams<TInitParams['routes']>;
}

type UrlikLocation<TUrlParams extends Record<string, any>> = {
  createUrlTree: (params: TUrlParams) => UrlTree;
  navigate: (
    params: TUrlParams,
    extras?: Omit<NavigationExtras, 'queryParams'>, // Query params are handled via `TUrlParams`.
  ) => Promise<boolean>;
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
    { path: Exclude<ExtractPathParam<TRoutes, TPath>, undefined> } & {
      query?: Partial<ExtractQueryParams<TRoutes, TPath> | undefined>;
    }
  >;
} & {
  [TRoute in TRoutes[number] as TRoute['path']]: UrlikRouter<TRoute['children']>;
};

type UrlikUrlParams<TRoutes extends UrlikRoutes> = {
  [TPath in TRoutes[number]['path']]: () => {
    params: Signal<
      { path: Exclude<ExtractPathParam<TRoutes, TPath>, undefined> } & {
        query: ExtractQueryParams<TRoutes, TPath>;
      }
    >;
    pathParams: Signal<Exclude<ExtractPathParam<TRoutes, TPath>, undefined>>;
    queryParams: Signal<ExtractQueryParams<TRoutes, TPath>>;
    updateQueryParams(
      withPrev: (prev: ExtractQueryParams<TRoutes, TPath>) => ExtractQueryParams<TRoutes, TPath>,
      extras?: Omit<NavigationExtras, 'queryParams'>,
    ): Promise<boolean>;
    updateQueryParams(
      values: ExtractQueryParams<TRoutes, TPath>,
      extras?: Omit<NavigationExtras, 'queryParams'>,
    ): Promise<boolean>;
  };
};

export function initUrlik<const TInitParams extends InitUrlikParams>(
  params: TInitParams,
): InitUrlikOutput<TInitParams> {
  throw new Error('Not implemented.');
}
