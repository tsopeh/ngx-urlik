import type { Routes, UrlTree } from '@angular/router';
import {
  defineAppRouter,
  numberCodec,
  queryParam,
  repeatedQueryParam,
  stringCodec,
} from 'ngx-urlik';

type TokenValue<T> = T extends import('@angular/core').InjectionToken<infer Value> ? Value : never;

const publicDefinition = defineAppRouter({
  routes: [
    {
      path: 'items/:id',
      routeName: 'ITEM',
      pathParam: { codec: numberCodec() },
      queryParams: { search: queryParam({ codec: stringCodec() }) },
    },
  ],
});
declare const publicRouter: TokenValue<typeof publicDefinition.AppRouter>;
publicRouter.routes.ITEM.params().path.id satisfies number;
publicRouter.routes.ITEM.params().query.search satisfies string | null;

const definition = defineAppRouter({
  routes: [
    {
      path: 'teams/:teamId',
      pathParam: { codec: numberCodec() },
      queryParams: { locale: queryParam({ codec: stringCodec(), defaultValue: 'en' }) },
      children: [
        {
          path: 'members/:memberId/show/:showId',
          routeName: 'MEMBER',
          pathParam: { memberId: { codec: numberCodec() }, showId: { codec: stringCodec() } },
          queryParams: {
            page: queryParam({ codec: numberCodec(), required: true }),
            tags: repeatedQueryParam({ codec: stringCodec() }),
          },
        },
        { path: '', routeName: 'TEAMS' },
        { path: '**', component: class {} },
      ],
    },
  ],
});
declare const router: TokenValue<typeof definition.AppRouter>;

router.routes.MEMBER.createUrlTree({
  path: { teamId: 1, memberId: 2, showId: 'abc' },
  query: { page: 1 },
}) satisfies UrlTree | null;
router.routes.MEMBER.params().path.teamId satisfies number;
router.routes.MEMBER.params().path.memberId satisfies number;
router.routes.MEMBER.params().path.showId satisfies string;
router.routes.MEMBER.params().query.locale satisfies string;
router.routes.MEMBER.params().query.page satisfies number | null;
router.routes.MEMBER.params().query.tags satisfies readonly string[];
router.routes.TEAMS.createUrlTree({ path: { teamId: 1 } });
router.routes.MEMBER.patchQuery({ page: 2 });

const defaultsDefinition = defineAppRouter({
  routes: [
    {
      path: 'search/:term',
      routeName: 'SEARCH',
      queryParams: { term: queryParam({ codec: stringCodec() }) },
    },
  ],
});
declare const defaults: TokenValue<typeof defaultsDefinition.AppRouter>;
defaults.routes.SEARCH.createUrlTree({ path: { term: 'books' }, query: { term: 'recent' } });
defaults.routes.SEARCH.params().path.term satisfies string;
defaults.routes.SEARCH.params().query.term satisfies string | null;

declare const angularRoutes: Routes;
const unnamedDefinition = defineAppRouter({ routes: angularRoutes });
declare const unnamed: TokenValue<typeof unnamedDefinition.AppRouter>;
unnamed.routes satisfies object;
// @ts-expect-error widened Angular routes have no inferred route names
unnamed.routes.UNKNOWN;

// @ts-expect-error unnamed routes and wildcards have no generated node
router.routes.WILDCARD;
// @ts-expect-error all ancestor and own placeholders are required
router.routes.MEMBER.createUrlTree({ path: { memberId: 2, showId: 'abc' }, query: { page: 1 } });
// @ts-expect-error required query values must be supplied
router.routes.MEMBER.createUrlTree({ path: { teamId: 1, memberId: 2, showId: 'abc' } });
router.routes.MEMBER.createUrlTree({
  // @ts-expect-error codecs determine path value types
  path: { teamId: '1', memberId: 2, showId: 'abc' },
  query: { page: 1 },
});

defineAppRouter({
  routes: [
    {
      path: 'shows/:showId/season/:season',
      routeName: 'SHOW',
      // @ts-expect-error multiple placeholders need a complete keyed map
      pathParam: { showId: { codec: stringCodec() } },
    },
  ],
});
defineAppRouter({
  routes: [
    {
      path: 'shows/:showId',
      routeName: 'SHOW',
      // @ts-expect-error codec keys must match placeholders
      pathParam: { other: { codec: stringCodec() } },
    },
  ],
});
defineAppRouter({
  routes: [
    {
      path: '**',
      // @ts-expect-error wildcard routes cannot be named
      routeName: 'FALLBACK',
    },
  ],
});
defineAppRouter({
  routes: [
    {
      path: 'static',
      routeName: 'STATIC',
      // @ts-expect-error a path without placeholders has no pathParam config
      pathParam: { codec: numberCodec() },
    },
  ],
});
defineAppRouter({
  routes: [
    {
      path: '',
      queryParams: { page: queryParam({ codec: numberCodec() }) },
      children: [
        {
          path: 'items',
          routeName: 'ITEMS',
          // @ts-expect-error descendants cannot redefine an inherited query key
          queryParams: { page: queryParam({ codec: stringCodec() }) },
        },
      ],
    },
  ],
});
