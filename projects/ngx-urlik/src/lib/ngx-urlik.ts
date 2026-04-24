import { Signal } from '@angular/core';
import { NavigationExtras, Route, Routes, UrlTree } from '@angular/router';
import { UrlParamSerde } from './url-params';

type UrlikRoute = Omit<Route, 'loadChildren' | 'children'> & {
  pathAlias?: string;
  pathParam?: { paramName: string; serde: UrlParamSerde<any> };
  queryParams?: Record<string, UrlParamSerde<any>>;
  children?: Array<UrlikRoute>;
};

interface InitUrlikParams {
  routes: Array<UrlikRoute>;
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

type ResolveRouteName<TRoute extends UrlikRoute> = TRoute['pathAlias'] extends string
  ? TRoute['pathAlias']
  : TRoute['path'] extends string
    ? TRoute['path']
    : 'UNKNOWN_PATH_ALIAS';

type ExtractRouteConfig<
  TRoutes extends Array<UrlikRoute>,
  TPath extends TRoutes[number]['path'],
> = Extract<TRoutes[number], { path: TPath }>;

type ExtractPathParam<
  TRoutes extends Array<UrlikRoute>,
  TPath extends TRoutes[number]['pathAlias'],
> = {
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

type ExtractQueryParams<
  TRoutes extends Array<UrlikRoute>,
  TPath extends TRoutes[number]['pathAlias'],
> = {
  [TQueryParamName in keyof ExtractRouteConfig<TRoutes, TPath>['queryParams']]: ExtractRouteConfig<
    TRoutes,
    TPath
  >['queryParams'][TQueryParamName] extends UrlParamSerde<infer TQueryParamType>
    ? TQueryParamType
    : never;
};

type UrlikRouter<TRoutes extends Array<UrlikRoute>> = {
  [TPath in TRoutes[number]['pathAlias']]: UrlikLocation<
    { path: Exclude<ExtractPathParam<TRoutes, TPath>, undefined> } & {
      query?: Partial<ExtractQueryParams<TRoutes, TPath> | undefined>;
    }
  >;
} & {
  [TRoute in TRoutes[number] as TRoute['pathAlias']]: UrlikRouter<TRoute['children']>;
};

type UrlikUrlParams<TRoutes extends Array<UrlikRoute>> = {
  [TPath in TRoutes[number]['pathAlias']]: () => {
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
