import type { Routes, UrlTree } from '@angular/router';
import type {
  ContextualRouteArray,
  GeneratedAppRouterV2,
  InferDefinition,
} from '../projects/ngx-urlik/src/lib/app-router-types';
import {
  numberCodec,
  queryParam,
  repeatedQueryParam,
  stringCodec,
} from '../projects/ngx-urlik/src/lib/params';

declare function checkedRoutes<const R extends readonly unknown[]>(
  routes: InferDefinition<R> & ContextualRouteArray<NoInfer<R>>,
): GeneratedAppRouterV2<R>;

const router = checkedRoutes([
  {
    path: 'teams/:teamId',
    pathParam: { codec: numberCodec() },
    queryParams: { locale: queryParam({ codec: stringCodec(), defaultValue: 'en' }) },
    children: [
      {
        path: 'members/:memberId/show/:showId',
        identifier: 'MEMBER',
        pathParam: { memberId: { codec: numberCodec() }, showId: { codec: stringCodec() } },
        queryParams: {
          page: queryParam({ codec: numberCodec(), required: true }),
          tags: repeatedQueryParam({ codec: stringCodec() }),
        },
      },
      { path: '', identifier: 'TEAMS' },
      { path: '**', component: class {} },
    ],
  },
]);

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

const defaults = checkedRoutes([
  {
    path: 'search/:term',
    identifier: 'SEARCH',
    queryParams: { term: queryParam({ codec: stringCodec() }) },
  },
]);
defaults.routes.SEARCH.createUrlTree({ path: { term: 'books' }, query: { term: 'recent' } });
defaults.routes.SEARCH.params().path.term satisfies string;
defaults.routes.SEARCH.params().query.term satisfies string | null;

declare const angularRoutes: Routes;
const anonymous = checkedRoutes(angularRoutes);
anonymous.routes satisfies object;
// @ts-expect-error widened Angular routes have no inferred identifiers
anonymous.routes.UNKNOWN;

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

checkedRoutes([
  {
    path: 'shows/:showId/season/:season',
    identifier: 'SHOW',
    // @ts-expect-error multiple placeholders need a complete keyed map
    pathParam: { showId: { codec: stringCodec() } },
  },
]);
checkedRoutes([
  {
    path: 'shows/:showId',
    identifier: 'SHOW',
    // @ts-expect-error codec keys must match placeholders
    pathParam: { other: { codec: stringCodec() } },
  },
]);
checkedRoutes([
  {
    path: '**',
    // @ts-expect-error wildcards cannot be identified
    identifier: 'FALLBACK',
  },
]);
checkedRoutes([
  {
    path: 'static',
    identifier: 'STATIC',
    // @ts-expect-error a path without placeholders has no pathParam config
    pathParam: { codec: numberCodec() },
  },
]);
checkedRoutes([
  {
    path: '',
    queryParams: { page: queryParam({ codec: numberCodec() }) },
    children: [
      {
        path: 'items',
        identifier: 'ITEMS',
        // @ts-expect-error descendants cannot redefine an inherited query key
        queryParams: { page: queryParam({ codec: stringCodec() }) },
      },
    ],
  },
]);
