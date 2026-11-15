import { Component, computed, EnvironmentProviders, inject, InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, RouterFeatures, RouterOutlet, withRouterConfig } from '@angular/router';
import { createQueryParamsFormGroup } from 'ngx-urlik/forms';
import { defineAppRouter } from './app-router';
import { numberCodec, queryParam, stringCodec } from './params';

@Component({ template: '' })
class EmptyComponent {}

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class LayoutComponent {}

const setup = <T>(
  definition: {
    AppRouter: InjectionToken<T>;
    provideAppRouter: (...features: RouterFeatures[]) => EnvironmentProviders;
  },
  ...features: RouterFeatures[]
) => {
  TestBed.configureTestingModule({ providers: [definition.provideAppRouter(...features)] });
  return {
    appRouter: TestBed.runInInjectionContext(() => inject(definition.AppRouter)),
    router: TestBed.inject(Router),
  };
};

enum RouteNames {
  A = 'A',
  ABOUT = 'ABOUT',
  ADMIN = 'ADMIN',
  B = 'B',
  CATALOG = 'CATALOG',
  CHILD = 'CHILD',
  DETAIL = 'DETAIL',
  EPISODE = 'EPISODE',
  HOME = 'HOME',
  ITEM = 'ITEM',
  ITEMS = 'ITEMS',
  MEMBER = 'MEMBER',
  MOVIES = 'MOVIES',
  PROFILE = 'PROFILE',
  RESULTS = 'RESULTS',
  ROOT = 'ROOT',
  SEASON = 'SEASON',
  SEASONS = 'SEASONS',
  SHOW = 'SHOW',
  SHOW_LANDING = 'SHOW_LANDING',
  USER = 'USER',
}

describe('defineAppRouter with Angular route arrays', () => {
  it('keeps Angular routes as they are when none has a route name', () => {
    const routes: Route[] = [
      {
        path: '',
        component: EmptyComponent,
        children: [{ path: 'child', component: EmptyComponent }],
      },
      { path: 'archive/:id', component: EmptyComponent },
      { path: 'lazy', loadChildren: async () => [] },
      { path: '**', redirectTo: '' },
    ];
    const definition = defineAppRouter({}, { routes });
    const { appRouter, router } = setup(definition);

    expect(appRouter.routes).toEqual({});
    expect(router.config).toMatchObject(routes);
  });

  it('creates a flat node for each unique route name, including nested named routes', () => {
    const definition = defineAppRouter(
      { SHOW: RouteNames.SHOW, SEASON: RouteNames.SEASON },
      {
        routes: [
          {
            path: 'shows/:showId',
            routeName: RouteNames.SHOW,
            pathParams: { showId: numberCodec() },
            children: [
              {
                path: 'seasons/:season',
                routeName: RouteNames.SEASON,
                pathParams: { season: numberCodec() },
                component: EmptyComponent,
              },
            ],
          },
        ],
      },
    );
    const { appRouter, router } = setup(definition);
    const { SHOW, SEASON } = appRouter.routes;

    expect(Object.keys(appRouter.routes)).toEqual(['SHOW', 'SEASON']);
    expect('SEASON' in SHOW).toBe(false);
    expect(router.serializeUrl(SHOW.createUrlTree({ path: { showId: 12 } }))).toBe('/shows/12');
    expect(router.serializeUrl(SEASON.createUrlTree({ path: { showId: 12, season: 3 } }))).toBe(
      '/shows/12/seasons/3',
    );
  });

  it('rejects a route name reused in another branch when the router is defined', () => {
    expect(() =>
      defineAppRouter(
        { DETAIL: RouteNames.DETAIL },
        {
          routes: [
            { path: 'left', children: [{ path: 'item', routeName: RouteNames.DETAIL }] },
            { path: 'right', children: [{ path: 'item', routeName: RouteNames.DETAIL }] },
          ],
        },
      ),
    ).toThrow(
      "routeName 'DETAIL' is used by both routes[0].children[0] and routes[1].children[0]. Give each route its own routeName.",
    );
  });

  it('rejects a route name with no route', () => {
    expect(() =>
      defineAppRouter(
        { HOME: RouteNames.HOME, DETAIL: RouteNames.DETAIL },
        { routes: [{ path: '', routeName: RouteNames.HOME, component: EmptyComponent }] },
      ),
    ).toThrow(
      "RouteNames.DETAIL has no route. Give a route routeName: 'DETAIL', or remove the member.",
    );
  });

  it('checks ngx-urlik fields on routes with no named route below', () => {
    expect(() =>
      defineAppRouter(
        {},
        {
          routes: [
            {
              path: 'users/:userId',
              pathParams: { userID: numberCodec() } as never,
              component: EmptyComponent,
            },
            {
              path: 'teams',
              queryParams: { page: queryParam({ codec: numberCodec() }) },
              component: EmptyComponent,
            },
          ],
        },
      ),
    ).toThrow(
      [
        "routes[0]: pathParams.userID isn't a placeholder in the path",
        'routes[1]: no named route at or below it reads queryParams. Add a routeName, or remove queryParams.',
      ].join('\n- '),
    );
  });

  it('still lets an unnamed route match on its path codec', async () => {
    const definition = defineAppRouter(
      {},
      {
        routes: [
          {
            path: 'users/:userId',
            pathParams: { userId: numberCodec() },
            component: EmptyComponent,
          },
          { path: '**', component: LayoutComponent },
        ],
      },
    );
    const { router } = setup(definition);
    await router.navigateByUrl('/users/abc');
    expect(router.routerState.snapshot.root.firstChild?.component).toBe(LayoutComponent);
  });

  it("rejects a query field that queryParam() didn't make", () => {
    expect(() =>
      defineAppRouter(
        { HOME: RouteNames.HOME },
        {
          routes: [
            {
              path: '',
              routeName: RouteNames.HOME,
              queryParams: { page: { codec: numberCodec() } as never },
              component: EmptyComponent,
            },
          ],
        },
      ),
    ).toThrow("HOME: query parameter 'page' must come from queryParam()");
  });

  it('requires exactly one usable routeName key', () => {
    for (const routeName of [{}, { FIRST: true, SECOND: true }, { FIRST: false }, { ' ': true }]) {
      expect(() =>
        defineAppRouter(RouteNames, { routes: [{ path: 'item', routeName: routeName as never }] }),
      ).toThrow('routeName must be a non-empty string');
    }
  });

  it('requires and decodes every placeholder, including those on unnamed ancestors', async () => {
    const definition = defineAppRouter(
      { SEASON: RouteNames.SEASON },
      {
        routes: [
          {
            path: 'shows/:showId',
            pathParams: { showId: numberCodec() },
            children: [
              {
                path: 'seasons/:season',
                routeName: RouteNames.SEASON,
                pathParams: { season: numberCodec() },
                component: EmptyComponent,
              },
            ],
          },
        ],
      },
    );
    const { appRouter, router } = setup(definition);
    const season = appRouter.routes.SEASON;

    await season.navigate({ path: { showId: 42, season: 2 } });
    expect(router.url).toBe('/shows/42/seasons/2');
    expect(season.params()).toEqual({ path: { showId: 42, season: 2 }, query: {} });
    expect(() => season.createUrlTree({ path: { showId: 42 } } as never)).toThrow(
      /can't write path parameter 'season': the codec didn't return a string/,
    );
  });

  it("refuses a path value a browser would drop, like '..'", () => {
    const definition = defineAppRouter(
      { ITEM: RouteNames.ITEM },
      {
        routes: [{ path: 'items/:id', routeName: RouteNames.ITEM, component: EmptyComponent }],
      },
    );
    const item = setup(definition).appRouter.routes.ITEM;

    // A browser reads /items/.. as /, and /items/. as /items/, even percent-encoded.
    expect(() => item.createUrlTree({ path: { id: '..' } })).toThrow(
      /can't write path parameter 'id': the codec returned '\.\.'/,
    );
    expect(() => item.createUrlTree({ path: { id: '.' } })).toThrow(/returned '\.'/);
    expect(item.createUrlTree({ path: { id: '...' } }).toString()).toBe('/items/...');
  });

  it('applies a codec to each placeholder in one route path', async () => {
    const definition = defineAppRouter(
      { SEASON: RouteNames.SEASON },
      {
        routes: [
          {
            path: 'shows/:showId/seasons/:season',
            routeName: RouteNames.SEASON,
            pathParams: {
              showId: numberCodec(),
              season: numberCodec(),
            },
            component: EmptyComponent,
          },
        ],
      },
    );
    const { appRouter, router } = setup(definition);
    const season = appRouter.routes.SEASON;

    await season.navigate({ path: { showId: 42, season: 3 } });
    expect(router.url).toBe('/shows/42/seasons/3');
    expect(season.params().path).toEqual({ showId: 42, season: 3 });
  });

  it('encodes one supplied path value as one URL segment', () => {
    const definition = defineAppRouter(
      { ITEM: RouteNames.ITEM },
      {
        routes: [{ path: 'items/:id', routeName: RouteNames.ITEM, component: EmptyComponent }],
      },
    );
    const { appRouter, router } = setup(definition);

    expect(
      router.serializeUrl(appRouter.routes.ITEM.createUrlTree({ path: { id: 'a/b?c' } })),
    ).toBe('/items/a%2Fb%3Fc');
  });

  it("builds the same tree as Angular's createUrlTree", () => {
    const definition = defineAppRouter(
      { HOME: RouteNames.HOME, ITEM: RouteNames.ITEM },
      {
        routes: [
          {
            path: '',
            queryParams: { q: queryParam({ codec: stringCodec() }) },
            children: [
              {
                path: '',
                pathMatch: 'full',
                routeName: RouteNames.HOME,
                component: EmptyComponent,
              },
              { path: 'items/:id', routeName: RouteNames.ITEM, component: EmptyComponent },
            ],
          },
        ],
      },
    );
    const { appRouter, router } = setup(
      definition,
      withRouterConfig({ defaultQueryParamsHandling: 'merge' }),
    );
    const angular = (commands: string[], queryParams = {}, fragment?: string) =>
      router.createUrlTree(commands, { queryParams, queryParamsHandling: 'replace', fragment });

    expect(appRouter.routes.HOME.createUrlTree()).toEqual(angular(['/']));
    expect(appRouter.routes.HOME.createUrlTree({ query: { q: 'oak' }, fragment: '' })).toEqual(
      angular(['/'], { q: 'oak' }, ''),
    );
    expect(
      appRouter.routes.ITEM.createUrlTree({
        path: { id: 'a/b;c' },
        query: { q: 'x y' },
        fragment: 'top',
      }),
    ).toEqual(angular(['/', 'items', 'a/b;c'], { q: 'x y' }, 'top'));
  });

  it('inherits query definitions through unnamed ancestors and allows path/query name overlap', async () => {
    const definition = defineAppRouter(
      { EPISODE: RouteNames.EPISODE },
      {
        routes: [
          {
            path: 'shows/:showId',
            pathParams: { showId: numberCodec() },
            queryParams: { showId: queryParam({ codec: stringCodec() }) },
            children: [
              {
                path: 'episodes/:episodeId',
                routeName: RouteNames.EPISODE,
                pathParams: { episodeId: numberCodec() },
                component: EmptyComponent,
              },
            ],
          },
        ],
      },
    );
    const { appRouter, router } = setup(definition);
    const episode = appRouter.routes.EPISODE;

    await episode.navigate({ path: { showId: 8, episodeId: 5 }, query: { showId: 'latest' } });
    expect(router.url).toBe('/shows/8/episodes/5?showId=latest');
    expect(episode.params()).toEqual({
      path: { showId: 8, episodeId: 5 },
      query: { showId: 'latest' },
    });
  });

  it('marks a route and its parents active, with an empty-path named child as landing content', async () => {
    const definition = defineAppRouter(
      { SHOW: RouteNames.SHOW, SHOW_LANDING: RouteNames.SHOW_LANDING, EPISODE: RouteNames.EPISODE },
      {
        routes: [
          {
            path: 'shows/:showId',
            routeName: RouteNames.SHOW,
            pathParams: { showId: numberCodec() },
            children: [
              { path: '', routeName: RouteNames.SHOW_LANDING, component: EmptyComponent },
              {
                path: 'episodes/:episodeId',
                routeName: RouteNames.EPISODE,
                pathParams: { episodeId: numberCodec() },
                component: EmptyComponent,
              },
            ],
          },
        ],
      },
    );
    const { appRouter, router } = setup(definition);
    const { SHOW, SHOW_LANDING, EPISODE } = appRouter.routes;
    const read = () => [SHOW.ifActive(), SHOW_LANDING.ifActive(), EPISODE.ifActive()];

    await SHOW.navigate({ path: { showId: 17 } });
    expect(read()).toEqual([SHOW, SHOW_LANDING, null]);
    expect(SHOW_LANDING.params()).toEqual({ path: { showId: 17 }, query: {} });

    await EPISODE.navigate({ path: { showId: 17, episodeId: 4 } });
    expect(read()).toEqual([SHOW, null, EPISODE]);
    // The parent reads its own values while a child shows.
    expect(SHOW.params().path).toEqual({ showId: 17 });
    expect(EPISODE.params().path).toEqual({ showId: 17, episodeId: 4 });
    expect(router.url).toBe('/shows/17/episodes/4');
  });

  it('notifies ifActive() readers only when the answer changes', async () => {
    const definition = defineAppRouter(
      { ITEMS: RouteNames.ITEMS },
      {
        routes: [
          { path: '', component: EmptyComponent },
          {
            path: 'items',
            routeName: RouteNames.ITEMS,
            queryParams: { page: queryParam({ codec: numberCodec(), defaultValue: 1 }) },
            component: EmptyComponent,
          },
        ],
      },
    );
    const { appRouter } = setup(definition);
    let runs = 0;
    const active = computed(() => {
      runs++;
      return appRouter.routes.ITEMS.ifActive();
    });

    await appRouter.routes.ITEMS.navigate();
    expect(active()).toBe(appRouter.routes.ITEMS);
    await appRouter.routes.ITEMS.patchQuery({ page: 2 });
    expect(active()).toBe(appRouter.routes.ITEMS);
    expect(runs).toBe(1);
  });

  it('ifActive() is null for every route on a page without a named route', async () => {
    const definition = defineAppRouter(
      { ITEMS: RouteNames.ITEMS },
      {
        routes: [
          { path: '', component: EmptyComponent },
          { path: 'items', routeName: RouteNames.ITEMS, component: EmptyComponent },
        ],
      },
    );
    const { appRouter, router } = setup(definition);

    await router.navigateByUrl('/');
    expect(appRouter.routes.ITEMS.ifActive()).toBeNull();
    await appRouter.routes.ITEMS.navigate();
    expect(appRouter.routes.ITEMS.ifActive()).toBe(appRouter.routes.ITEMS);
  });

  it('keys nodes by route names member, even when its value differs', async () => {
    enum LowercaseNames {
      Movie = 'movie',
    }
    const definition = defineAppRouter(LowercaseNames, {
      routes: [{ path: 'movie', routeName: LowercaseNames.Movie, component: EmptyComponent }],
    });
    const { appRouter, router } = setup(definition);

    expect(Object.keys(appRouter.routes)).toEqual(['Movie']);
    expect(router.serializeUrl(appRouter.routes.Movie.createUrlTree())).toBe('/movie');
  });

  it('rejects a routeName missing from the route names', () => {
    enum OtherNames {
      OTHER = 'OTHER',
    }
    expect(() =>
      defineAppRouter(OtherNames, {
        routes: [{ path: 'item', routeName: RouteNames.ITEM }],
      }),
    ).toThrow(
      "routeName 'ITEM' at routes[0] isn't in the route names passed to defineAppRouter(). Add it to the enum.",
    );
  });

  it('uses Angular matching to distinguish named routes with the same URL', async () => {
    const definition = defineAppRouter(
      { ADMIN: RouteNames.ADMIN, USER: RouteNames.USER },
      {
        routes: [
          {
            path: 'dashboard',
            routeName: RouteNames.ADMIN,
            canMatch: [() => false],
            component: EmptyComponent,
          },
          { path: 'dashboard', routeName: RouteNames.USER, component: EmptyComponent },
        ],
      },
    );
    const { appRouter, router } = setup(definition);

    expect(router.serializeUrl(appRouter.routes.ADMIN.createUrlTree())).toBe('/dashboard');
    expect(router.serializeUrl(appRouter.routes.USER.createUrlTree())).toBe('/dashboard');
    await appRouter.routes.ADMIN.navigate({}, { replaceUrl: true });
    expect(appRouter.routes.USER.ifActive()).toBe(appRouter.routes.USER);
    expect(appRouter.routes.ADMIN.ifActive()).toBeNull();
    expect(() => appRouter.routes.ADMIN.params()).toThrow(/isn't active/);
  });

  it('reads ancestor path values with emptyOnly inheritance and preserves unknown query keys in patches', async () => {
    const definition = defineAppRouter(
      { MEMBER: RouteNames.MEMBER },
      {
        routes: [
          {
            path: 'teams/:teamId',
            component: LayoutComponent,
            pathParams: { teamId: numberCodec() },
            children: [
              {
                path: 'members/:memberId',
                routeName: RouteNames.MEMBER,
                pathParams: { memberId: numberCodec() },
                queryParams: { search: queryParam({ codec: stringCodec() }) },
                component: EmptyComponent,
              },
            ],
          },
        ],
      },
    );
    const { appRouter, router } = setup(
      definition,
      withRouterConfig({
        paramsInheritanceStrategy: 'emptyOnly',
        defaultQueryParamsHandling: 'merge',
      }),
    );
    const member = appRouter.routes.MEMBER;

    await router.navigateByUrl('/teams/3/members/4?unknown=keep');
    expect(member.params()).toEqual({ path: { teamId: 3, memberId: 4 }, query: { search: null } });
    expect(router.serializeUrl(member.createUrlTree({ path: { teamId: 3, memberId: 4 } }))).toBe(
      '/teams/3/members/4',
    );
    await member.patchQuery({ search: 'new' });
    expect(router.url).toBe('/teams/3/members/4?unknown=keep&search=new');
  });

  it('binds a query form to a named route node', async () => {
    const definition = defineAppRouter(
      { RESULTS: RouteNames.RESULTS },
      {
        routes: [
          {
            path: 'results',
            routeName: RouteNames.RESULTS,
            queryParams: { search: queryParam({ codec: stringCodec(), defaultValue: '' }) },
            component: EmptyComponent,
          },
        ],
      },
    );
    const { appRouter, router } = setup(definition);
    await router.navigateByUrl('/results?unknown=keep');
    const form = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(appRouter.routes.RESULTS),
    );
    form.patchValue({ search: 'new' });
    await vi.waitFor(() => expect(router.url).toBe('/results?unknown=keep&search=new'));
  });

  it('uses a default for malformed URL query data but does not match an invalid path value', async () => {
    const definition = defineAppRouter(
      { ITEM: RouteNames.ITEM, DETAIL: RouteNames.DETAIL },
      {
        routes: [
          {
            path: 'items/:id',
            routeName: RouteNames.ITEM,
            pathParams: { id: numberCodec() },
            queryParams: { page: queryParam({ codec: numberCodec(), defaultValue: 1 }) },
            component: EmptyComponent,
            canMatch: [() => true],
          },
          { path: 'items/:slug', routeName: RouteNames.DETAIL, component: EmptyComponent },
        ],
        diagnostics: { warn: () => undefined },
      },
    );
    const { appRouter, router } = setup(definition);

    await router.navigateByUrl('/items/5?page=nope');
    expect(appRouter.routes.ITEM.params()).toEqual({ path: { id: 5 }, query: { page: 1 } });
    await router.navigateByUrl('/items/nope?page=2');
    expect(appRouter.routes.DETAIL.params().path).toEqual({ slug: 'nope' });
    expect(() => appRouter.routes.ITEM.params()).toThrow(/isn't active/);
  });

  it('rejects invalid named definitions and handles failed serialization without navigation', async () => {
    expect(() =>
      defineAppRouter(
        { PROFILE: RouteNames.PROFILE },
        {
          routes: [
            {
              matcher: () => null,
              children: [
                {
                  path: 'profile/:userId',
                  routeName: RouteNames.PROFILE,
                  component: EmptyComponent,
                },
              ],
            },
          ],
        },
      ),
    ).toThrow(/routes\[0\]: needs a plain path in the primary outlet/);
    expect(() =>
      defineAppRouter(
        { MEMBER: RouteNames.MEMBER },
        {
          routes: [
            {
              path: 'teams/:id',
              children: [
                { path: 'members/:id', routeName: RouteNames.MEMBER, component: EmptyComponent },
              ],
            },
          ],
        },
      ),
    ).toThrow(
      "MEMBER: path parameter 'id' appears in both 'teams/:id' and 'members/:id'. Rename one, because params().path holds one value per name.",
    );
    expect(() =>
      defineAppRouter(
        { MEMBER: RouteNames.MEMBER },
        {
          routes: [
            {
              path: 'teams',
              queryParams: { search: queryParam({ codec: stringCodec() }) },
              children: [
                {
                  path: 'members',
                  routeName: RouteNames.MEMBER,
                  queryParams: {
                    // @ts-expect-error a child can't redefine its parent's query key
                    search: queryParam({ codec: stringCodec() }),
                  },
                  component: EmptyComponent,
                },
              ],
            },
          ],
        },
      ),
    ).toThrow(/query parameter 'search' is defined in both/);
    expect(() =>
      defineAppRouter(
        { ITEM: RouteNames.ITEM },
        {
          routes: [
            {
              path: 'items/:id/:id',
              routeName: RouteNames.ITEM,
              pathParams: { id: numberCodec() },
              component: EmptyComponent,
            },
          ],
        },
      ),
    ).toThrow(/path parameter 'id' appears in both/i);
    expect(() =>
      defineAppRouter(
        { ITEM: RouteNames.ITEM },
        {
          routes: [
            {
              path: 'items/:id',
              routeName: RouteNames.ITEM,
              pathParams: { id: numberCodec(), extra: stringCodec() } as never,
              component: EmptyComponent,
            },
          ],
        },
      ),
    ).toThrow(/pathParams|placeholder/i);

    const diagnostics: unknown[] = [];
    const definition = defineAppRouter(
      { ITEM: RouteNames.ITEM },
      {
        routes: [
          {
            path: 'items/:id',
            routeName: RouteNames.ITEM,
            pathParams: { id: numberCodec() },
            queryParams: {
              search: queryParam({ codec: numberCodec() }),
              page: queryParam({ codec: numberCodec() }),
            },
            component: EmptyComponent,
          },
        ],
        diagnostics: { warn: (diagnostic) => diagnostics.push(diagnostic) },
      },
    );
    const { appRouter, router } = setup(definition);
    const item = appRouter.routes.ITEM;
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl');

    expect(() => item.createUrlTree({ path: { id: 'invalid' as never } })).toThrow(
      /ITEM: can't write path parameter 'id': the codec didn't return a string/,
    );
    await expect(item.navigate({ path: { id: 'invalid' as never } })).rejects.toThrow(
      /can't write path parameter 'id'/,
    );
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(
      router.serializeUrl(
        item.createUrlTree({ path: { id: 1 }, query: { search: 'invalid' as never, page: 2 } }),
      ),
    ).toBe('/items/1?page=2');
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('exposes Angular isActive() as a signal through the escape hatch', async () => {
    const definition = defineAppRouter(
      { ITEMS: RouteNames.ITEMS, ABOUT: RouteNames.ABOUT },
      {
        routes: [
          { path: 'items', routeName: RouteNames.ITEMS, component: EmptyComponent },
          { path: 'about', routeName: RouteNames.ABOUT, component: EmptyComponent },
        ],
      },
    );
    const { appRouter, router } = setup(definition);
    const items = appRouter.escapeHatch.isActive(appRouter.routes.ITEMS.createUrlTree());

    await router.navigateByUrl('/items');
    expect(items()).toBe(true);
    await router.navigateByUrl('/about');
    expect(items()).toBe(false);
  });
});
