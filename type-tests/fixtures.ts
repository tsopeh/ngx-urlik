// Routers the type tests share. Each test file reads one of them the way an app would.
import type { InjectionToken } from '@angular/core';
import { defineAppRouter, listCodec, numberCodec, queryParam, stringCodec } from 'ngx-urlik';

export type TokenValue<T> = T extends InjectionToken<infer Value> ? Value : never;
export class Page {}

enum RouteNames {
  MEMBER = 'MEMBER',
  TEAMS = 'TEAMS',
  HOME = 'HOME',
}

/**
 * `teams/:teamId` owns `locale`. Its child `MEMBER` adds two placeholders and four query fields:
 * a required one, two lists with defaults, and a list without one.
 */
export const definition = defineAppRouter(RouteNames, {
  routes: [
    { path: 'home', routeName: RouteNames.HOME, component: Page },
    {
      path: 'teams/:teamId',
      pathParams: { teamId: numberCodec() },
      queryParams: { locale: queryParam({ codec: stringCodec(), defaultValue: 'en' }) },
      children: [
        {
          path: 'members/:memberId/show/:showId',
          routeName: RouteNames.MEMBER,
          pathParams: { memberId: numberCodec(), showId: stringCodec() },
          queryParams: {
            page: queryParam({ codec: numberCodec(), required: true }),
            tags: queryParam({ codec: listCodec(stringCodec(), ','), defaultValue: [] }),
            ids: queryParam({ codec: listCodec(numberCodec(), ','), defaultValue: [] }),
            labels: queryParam({ codec: listCodec(stringCodec(), '|') }),
          },
        },
        { path: '', routeName: RouteNames.TEAMS },
        { path: '**', component: Page },
      ],
    },
  ],
});

export declare const appRouter: TokenValue<typeof definition.AppRouter>;
export declare const snapshot: import('@angular/router').ActivatedRouteSnapshot;
