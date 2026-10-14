import type { Routes, UrlTree } from '@angular/router';
import {
  defineAppRouter,
  enumCodec,
  listCodec,
  numberCodec,
  queryParam,
  repeatedQueryParam,
  stringCodec,
  type GeneratedAppRouter,
  type PathParamsOf,
  type QueryParamsOf,
  type RouteDefinition,
  type RouteNode,
  type RouteQueryPatch,
  type RouteStateOf,
} from 'ngx-urlik';

type TokenValue<T> = T extends import('@angular/core').InjectionToken<infer Value> ? Value : never;

enum PublicRouteNames {
  ITEM = 'ITEM',
}

const publicDefinition = defineAppRouter(PublicRouteNames, {
  routes: [
    {
      path: 'items/:id',
      routeName: PublicRouteNames.ITEM,
      pathParam: { codec: numberCodec() },
      queryParams: { search: queryParam({ codec: stringCodec() }) },
    },
  ],
});
declare const publicRouter: TokenValue<typeof publicDefinition.AppRouter>;
publicRouter.routes.ITEM.params().path.id satisfies number;
publicRouter.routes.ITEM.params().query.search satisfies string | null;

enum RouteNames {
  MEMBER = 'MEMBER',
  TEAMS = 'TEAMS',
}

const definition = defineAppRouter(RouteNames, {
  routes: [
    {
      path: 'teams/:teamId',
      pathParam: { codec: numberCodec() },
      queryParams: { locale: queryParam({ codec: stringCodec(), defaultValue: 'en' }) },
      children: [
        {
          path: 'members/:memberId/show/:showId',
          routeName: RouteNames.MEMBER,
          pathParam: { memberId: { codec: numberCodec() }, showId: { codec: stringCodec() } },
          queryParams: {
            page: queryParam({ codec: numberCodec(), required: true }),
            tags: repeatedQueryParam({ codec: stringCodec() }),
            ids: queryParam({ codec: listCodec(numberCodec(), ','), defaultValue: [] }),
            labels: queryParam({ codec: listCodec(stringCodec(), '|') }),
          },
        },
        { path: '', routeName: RouteNames.TEAMS },
        { path: '**', component: class {} },
      ],
    },
  ],
});
declare const router: TokenValue<typeof definition.AppRouter>;

router.routes.MEMBER.createUrlTree({
  path: { teamId: 1, memberId: 2, showId: 'abc' },
  query: { page: 1 },
}) satisfies UrlTree;
router.routes.MEMBER.params().path.teamId satisfies number;
router.routes.MEMBER.params().path.memberId satisfies number;
router.routes.MEMBER.params().path.showId satisfies string;
router.routes.MEMBER.params().query.locale satisfies string;
router.routes.MEMBER.params().query.page satisfies number | null;
router.routes.MEMBER.params().query.ids satisfies readonly number[];
router.routes.MEMBER.params().query.labels satisfies readonly string[] | null;
router.routes.MEMBER.params().query.tags satisfies readonly string[];
declare const snapshot: import('@angular/router').ActivatedRouteSnapshot;
router.routes.MEMBER.paramsFrom(snapshot).path.teamId satisfies number;
router.routes.MEMBER.paramsFrom(snapshot).query.ids satisfies readonly number[];
router.escapeHatch.isActive('/teams') satisfies import('@angular/core').Signal<boolean>;
router.routes.TEAMS.createUrlTree({ path: { teamId: 1 } });
router.routes.MEMBER.patchQuery({ page: 2 });

enum SearchRouteNames {
  SEARCH = 'SEARCH',
}

const defaultsDefinition = defineAppRouter(SearchRouteNames, {
  routes: [
    {
      path: 'search/:term',
      routeName: SearchRouteNames.SEARCH,
      queryParams: { term: queryParam({ codec: stringCodec() }) },
    },
  ],
});
declare const defaults: TokenValue<typeof defaultsDefinition.AppRouter>;
defaults.routes.SEARCH.createUrlTree({ path: { term: 'books' }, query: { term: 'recent' } });
defaults.routes.SEARCH.params().path.term satisfies string;
defaults.routes.SEARCH.params().query.term satisfies string | null;

declare const angularRoutes: Routes;
enum EmptyRouteNames {}
const unnamedDefinition = defineAppRouter(EmptyRouteNames, { routes: angularRoutes });
declare const unnamed: TokenValue<typeof unnamedDefinition.AppRouter>;
unnamed.routes satisfies object;
// @ts-expect-error widened Angular routes have no inferred route names
unnamed.routes.UNKNOWN;

declare const wideString: string;
defineAppRouter(RouteNames, {
  routes: [
    {
      path: 'invalid',
      // @ts-expect-error routeName must be a literal string, not a wide string
      routeName: wideString,
    },
  ],
});
defineAppRouter(RouteNames, {
  routes: [
    {
      path: 'invalid',
      // @ts-expect-error routeName must be a string, not an object
      routeName: { FIRST: true },
    },
  ],
});

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

enum ShowRouteNames {
  SHOW = 'SHOW',
}
defineAppRouter(ShowRouteNames, {
  routes: [
    {
      path: 'shows/:showId/season/:season',
      routeName: ShowRouteNames.SHOW,
      // @ts-expect-error multiple placeholders need a complete keyed map
      pathParam: { showId: { codec: stringCodec() } },
    },
  ],
});
defineAppRouter(ShowRouteNames, {
  routes: [
    {
      path: 'shows/:showId',
      routeName: ShowRouteNames.SHOW,
      // @ts-expect-error codec keys must match placeholders
      pathParam: { other: { codec: stringCodec() } },
    },
  ],
});
enum FallbackRouteNames {
  FALLBACK = 'FALLBACK',
}
defineAppRouter(FallbackRouteNames, {
  routes: [
    {
      path: '**',
      // @ts-expect-error wildcard routes cannot be named
      routeName: FallbackRouteNames.FALLBACK,
    },
  ],
});
enum StaticRouteNames {
  STATIC = 'STATIC',
}
defineAppRouter(StaticRouteNames, {
  routes: [
    {
      path: 'static',
      routeName: StaticRouteNames.STATIC,
      // @ts-expect-error a path without placeholders has no pathParam config
      pathParam: { codec: numberCodec() },
    },
  ],
});
enum ItemsRouteNames {
  ITEMS = 'ITEMS',
}
defineAppRouter(ItemsRouteNames, {
  routes: [
    {
      path: '',
      queryParams: { page: queryParam({ codec: numberCodec() }) },
      children: [
        {
          path: 'items',
          routeName: ItemsRouteNames.ITEMS,
          // @ts-expect-error descendants cannot redefine an inherited query key
          queryParams: { page: queryParam({ codec: stringCodec() }) },
        },
      ],
    },
  ],
});

// Array-based enumCodec
const tupleCodec = enumCodec(['first', 'second'] as const);
tupleCodec.deserialize('first') satisfies 'first' | 'second' | null;

// Non-null UrlTree on pathless routes
enum StaticNames {
  HOME = 'HOME',
}
const staticDef = defineAppRouter(StaticNames, {
  routes: [{ path: 'home', routeName: StaticNames.HOME }],
});
declare const staticRouter: TokenValue<typeof staticDef.AppRouter>;
staticRouter.routes.HOME.createUrlTree() satisfies UrlTree;
// Navigation options always follow the construction values
staticRouter.routes.HOME.navigate({}, { replaceUrl: true }) satisfies Promise<boolean>;
staticRouter.routes.HOME.navigate(undefined, { replaceUrl: true }) satisfies Promise<boolean>;
// @ts-expect-error navigation options are not construction values
staticRouter.routes.HOME.navigate({ replaceUrl: true });

// Type extractors
type MemberNode = typeof router.routes.MEMBER;
type MemberQuery = QueryParamsOf<MemberNode>;
type MemberPath = PathParamsOf<MemberNode>;
type MemberState = RouteStateOf<MemberNode>;
type MemberPatch = RouteQueryPatch<MemberNode>;

declare const memberQuery: MemberQuery;
memberQuery.locale satisfies string;
memberQuery.tags satisfies readonly string[];

declare const memberPath: MemberPath;
memberPath.teamId satisfies number;
memberPath.memberId satisfies number;

declare const memberPatch: MemberPatch;
router.routes.MEMBER.patchQuery(memberPatch);

// activeRoute ambient createUrlTree
const activeContext = router.activeRoute({
  member: router.routes.MEMBER,
  teams: router.routes.TEAMS,
});
declare const currentActive: ReturnType<typeof activeContext>;
currentActive.createUrlTree({ fragment: 'bio' }) satisfies UrlTree;

enum ResetRouteNames {
  LIST = 'LIST',
  CHILD = 'CHILD',
}

const resets = defineAppRouter(ResetRouteNames, {
  routes: [
    {
      path: 'list',
      routeName: ResetRouteNames.LIST,
      queryParams: {
        search: queryParam({ codec: stringCodec(), defaultValue: '' }),
        tags: repeatedQueryParam({ codec: stringCodec(), resetWhen: ['search'] }),
        page: queryParam({ codec: numberCodec(), defaultValue: 1, resetWhen: ['search', 'tags'] }),
      },
      children: [
        {
          path: 'child',
          routeName: ResetRouteNames.CHILD,
          queryParams: {
            tab: queryParam({ codec: stringCodec() }),
            childPage: queryParam({
              codec: numberCodec(),
              defaultValue: 1,
              resetWhen: ['search', 'tab'],
            }),
          },
        },
      ],
    },
  ],
});
declare const resetRouter: TokenValue<typeof resets.AppRouter>;
resetRouter.routes.CHILD.params().query.childPage satisfies number;
resetRouter.routes.LIST.params().query.tags satisfies readonly string[];

defineAppRouter(ResetRouteNames, {
  routes: [
    {
      path: 'list',
      routeName: ResetRouteNames.LIST,
      queryParams: {
        search: queryParam({ codec: stringCodec(), defaultValue: '' }),
        // @ts-expect-error resetWhen names query fields of the route chain
        page: queryParam({
          codec: numberCodec(),
          defaultValue: 1,
          resetWhen: ['serch'],
        }),
      },
    },
  ],
});

defineAppRouter(ResetRouteNames, {
  routes: [
    {
      path: 'list',
      routeName: ResetRouteNames.LIST,
      queryParams: {
        // @ts-expect-error a field cannot reset when it changes itself
        page: queryParam({
          codec: numberCodec(),
          defaultValue: 1,
          resetWhen: ['page'],
        }),
      },
    },
  ],
});

defineAppRouter(ResetRouteNames, {
  routes: [
    {
      path: 'list',
      routeName: ResetRouteNames.LIST,
      queryParams: {
        // @ts-expect-error an ancestor cannot name a descendant's field
        page: queryParam({
          codec: numberCodec(),
          defaultValue: 1,
          resetWhen: ['tab'],
        }),
      },
      children: [
        {
          path: 'child',
          routeName: ResetRouteNames.CHILD,
          queryParams: { tab: queryParam({ codec: stringCodec() }) },
        },
      ],
    },
  ],
});
