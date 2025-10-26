import { assertInInjectionContext, inject } from '@angular/core';
import { Router, Routes } from '@angular/router';

interface UrlikRoute<
  TPath extends string,
  TPathParamName extends string,
  TPathParamType extends string,
> {
  path: TPath;
  pathParam: {
    name: TPathParamName;
    type: TPathParamType;
  };
  queryParams: Record<string, string>;
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

type UrlikRouter<TRoutes extends UrlikRoutes> = {
  [TPath in TRoutes[number]['path']]: Extract<TRoutes[number], { path: TPath }>['pathParam'];
};

type UrlikUrlParams<TRoutes extends UrlikRoutes> = {
  idk: TRoutes;
};

export function initUrlik<TInitParams extends InitUrlikParams>(
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
