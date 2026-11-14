import type { Signal } from '@angular/core';
import type { Routes, UrlTree } from '@angular/router';
import {
  defineAppRouter,
  enumCodec,
  listCodec,
  numberCodec,
  type PathParamsOf,
  queryParam,
  type QueryParamsOf,
  type RouteQueryPatch,
  type RouteStateOf,
  stringCodec,
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
      pathParam: { id: numberCodec() },
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
      pathParam: { teamId: numberCodec() },
      queryParams: { locale: queryParam({ codec: stringCodec(), defaultValue: 'en' }) },
      children: [
        {
          path: 'members/:memberId/show/:showId',
          routeName: RouteNames.MEMBER,
          pathParam: { memberId: numberCodec(), showId: stringCodec() },
          queryParams: {
            page: queryParam({ codec: numberCodec(), required: true }),
            tags: queryParam({ codec: listCodec(stringCodec(), ','), defaultValue: [] }),
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
declare const appRouter: TokenValue<typeof definition.AppRouter>;

appRouter.routes.MEMBER.createUrlTree({
  path: { teamId: 1, memberId: 2, showId: 'abc' },
  query: { page: 1 },
}) satisfies UrlTree;
appRouter.routes.MEMBER.params().path.teamId satisfies number;
appRouter.routes.MEMBER.params().path.memberId satisfies number;
appRouter.routes.MEMBER.params().path.showId satisfies string;
appRouter.routes.MEMBER.params().query.locale satisfies string;
appRouter.routes.MEMBER.params().query.page satisfies number | null;
appRouter.routes.MEMBER.params().query.ids satisfies readonly number[];
appRouter.routes.MEMBER.params().query.labels satisfies readonly string[] | null;
appRouter.routes.MEMBER.params().query.tags satisfies readonly string[];
declare const snapshot: import('@angular/router').ActivatedRouteSnapshot;
appRouter.paramsSnapshot(appRouter.routes.MEMBER, snapshot).path.teamId satisfies number;
appRouter.paramsSnapshot(appRouter.routes.MEMBER, snapshot).query.ids satisfies readonly number[];
// @ts-expect-error paramsSnapshot() takes a route from AppRouter.routes
appRouter.paramsSnapshot({}, snapshot);
appRouter.escapeHatch.isActive('/teams') satisfies import('@angular/core').Signal<boolean>;
appRouter.routes.TEAMS.createUrlTree({ path: { teamId: 1 } });
appRouter.routes.MEMBER.patchQuery({ page: 2 });

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
// @ts-expect-error an array typed as Angular's Routes gives no typed routes
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

// @ts-expect-error unnamed routes and wildcards get no entry
appRouter.routes.WILDCARD;
// @ts-expect-error every placeholder is required, the parents' too
appRouter.routes.MEMBER.createUrlTree({ path: { memberId: 2, showId: 'abc' }, query: { page: 1 } });
// @ts-expect-error required query values must be supplied
appRouter.routes.MEMBER.createUrlTree({ path: { teamId: 1, memberId: 2, showId: 'abc' } });
appRouter.routes.MEMBER.createUrlTree({
  // @ts-expect-error codecs determine path value types
  path: { teamId: '1', memberId: 2, showId: 'abc' },
  query: { page: 1 },
});

enum ShowRouteNames {
  SHOW = 'SHOW',
}
// A placeholder without a codec is a string.
const partialCodecs = defineAppRouter(ShowRouteNames, {
  routes: [
    {
      path: 'shows/:showId/season/:season',
      routeName: ShowRouteNames.SHOW,
      pathParam: { season: numberCodec() },
    },
  ],
});
declare const partialRouter: TokenValue<typeof partialCodecs.AppRouter>;
partialRouter.routes.SHOW.params().path satisfies { showId: string; season: number };
defineAppRouter(ShowRouteNames, {
  routes: [
    {
      path: 'shows/:showId',
      routeName: ShowRouteNames.SHOW,
      // @ts-expect-error codec keys must match placeholders
      pathParam: { other: stringCodec() },
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
defineAppRouter(ShowRouteNames, {
  routes: [
    {
      path: 'shows/:showId',
      routeName: ShowRouteNames.SHOW,
      // @ts-expect-error pathParam is keyed by placeholder name, even for one placeholder
      pathParam: { codec: numberCodec() },
    },
  ],
});
defineAppRouter(ShowRouteNames, {
  routes: [
    {
      path: 'shows/:showId',
      routeName: ShowRouteNames.SHOW,
      // @ts-expect-error each pathParam entry is a codec
      pathParam: { showId: { codec: numberCodec() } },
    },
  ],
});
// @ts-expect-error a default is a plain value, not a function
queryParam({ codec: stringCodec(), defaultValue: () => 'en' });
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

// A route without placeholders still returns a UrlTree, never null
enum StaticNames {
  HOME = 'HOME',
}
const staticDef = defineAppRouter(StaticNames, {
  routes: [{ path: 'home', routeName: StaticNames.HOME }],
});
declare const staticRouter: TokenValue<typeof staticDef.AppRouter>;
staticRouter.routes.HOME.createUrlTree() satisfies UrlTree;
// Navigation options come after the link values
staticRouter.routes.HOME.navigate({}, { replaceUrl: true }) satisfies Promise<boolean>;
staticRouter.routes.HOME.navigate(undefined, { replaceUrl: true }) satisfies Promise<boolean>;
// @ts-expect-error navigation options aren't link values
staticRouter.routes.HOME.navigate({ replaceUrl: true });

// Types that read a route's values
type MemberNode = typeof appRouter.routes.MEMBER;
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
appRouter.routes.MEMBER.patchQuery(memberPatch);
// Patches take the same navigation options as navigate()
appRouter.routes.MEMBER.patchQuery(
  { page: 2 },
  { replaceUrl: true, skipLocationChange: true, state: { from: 'sidebar' }, info: 1 },
) satisfies Promise<boolean>;
// @ts-expect-error browserUrl could show an address the typed route didn't build
appRouter.routes.MEMBER.patchQuery({ page: 2 }, { browserUrl: '/elsewhere' });

// ifActive() holds the route itself while it, or one of its children, shows
appRouter.routes.MEMBER.ifActive satisfies Signal<typeof appRouter.routes.MEMBER | null>;
appRouter.routes.MEMBER.ifActive()?.params().path.memberId satisfies number | undefined;
const member = appRouter.routes.MEMBER.ifActive();
if (member) {
  member.params().query.page satisfies number | null;
  member.patchQuery({ page: 2 }) satisfies Promise<boolean>;
}
// @ts-expect-error a read goes to the route that was checked, and TEAMS has no memberId
void appRouter.routes.TEAMS.ifActive()?.params().path.memberId;
// @ts-expect-error ifActive() can be null, so read through it with ?. or an if
void appRouter.routes.MEMBER.ifActive().params();
// @ts-expect-error ifActive() is read-only
appRouter.routes.MEMBER.ifActive.set(null);

// Global reads
const everywhere = appRouter.globalParams({
  path: { workspaceId: stringCodec(), season: numberCodec() },
  query: {
    range: queryParam({ codec: stringCodec(), defaultValue: '7d' }),
    page: queryParam({ codec: numberCodec() }),
  },
});
everywhere().path.workspaceId satisfies string | null;
everywhere().path.season satisfies number | null;
everywhere().query.range satisfies string;
everywhere().query.page satisfies number | null;
// @ts-expect-error only declared path values exist
everywhere().path.other;
appRouter.globalParams({ query: { page: queryParam({ codec: numberCodec() }) } })().query.page;
// @ts-expect-error a global path entry is a codec
appRouter.globalParams({ path: { workspaceId: { codec: stringCodec() } } });
const once = appRouter.globalParamsSnapshot({ path: { workspaceId: stringCodec() } }, snapshot);
once.path.workspaceId satisfies string | null;

declare const diagnostic: import('ngx-urlik').AppRouterDiagnostic;
diagnostic.route satisfies string;
