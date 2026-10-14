import { Component, EnvironmentProviders, inject, InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, RouterOutlet } from '@angular/router';
import { createQueryParamsFormGroup } from 'ngx-urlik/forms';
import { defineAppRouter } from './app-router';
import { numberCodec, queryParam, stringCodec } from './params';

@Component({ template: '' })
class EmptyComponent {}

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class LayoutComponent {}

const setup = <T>(definition: {
  AppRouter: InjectionToken<T>;
  provideAppRouter: () => EnvironmentProviders;
}) => {
  TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
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
  it('passes Angular routes through when none has a route name', () => {
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
    const definition = defineAppRouter(RouteNames, { routes });
    const { appRouter, router } = setup(definition);

    expect(appRouter.routes).toEqual({});
    expect(router.config).toEqual(routes);
  });

  it('creates a flat node for each unique route name, including nested named routes', () => {
    const definition = defineAppRouter(RouteNames, {
      routes: [
        {
          path: 'shows/:showId',
          routeName: RouteNames.SHOW,
          pathParam: { showId: { codec: numberCodec() } },
          children: [
            {
              path: 'seasons/:season',
              routeName: RouteNames.SEASON,
              pathParam: { season: { codec: numberCodec() } },
              component: EmptyComponent,
            },
          ],
        },
      ],
    });
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
      defineAppRouter(RouteNames, {
        routes: [
          { path: 'left', children: [{ path: 'item', routeName: RouteNames.DETAIL }] },
          { path: 'right', children: [{ path: 'item', routeName: RouteNames.DETAIL }] },
        ],
      }),
    ).toThrow(
      "routeName 'DETAIL' is used by both routes[0].children[0] and routes[1].children[0]. Give each named route a different routeName.",
    );
  });

  it('requires exactly one usable routeName key', () => {
    for (const routeName of [{}, { FIRST: true, SECOND: true }, { FIRST: false }, { ' ': true }]) {
      expect(() =>
        defineAppRouter(RouteNames, { routes: [{ path: 'item', routeName: routeName as never }] }),
      ).toThrow('routeName must be a non-empty string');
    }
  });

  it('requires and decodes every placeholder, including those on unnamed ancestors', async () => {
    const definition = defineAppRouter(RouteNames, {
      routes: [
        {
          path: 'shows/:showId',
          pathParam: { showId: { codec: numberCodec() } },
          children: [
            {
              path: 'seasons/:season',
              routeName: RouteNames.SEASON,
              pathParam: { season: { codec: numberCodec() } },
              component: EmptyComponent,
            },
          ],
        },
      ],
    });
    const { appRouter, router } = setup(definition);
    const season = appRouter.routes.SEASON;

    await season.navigate({ path: { showId: 42, season: 2 } });
    expect(router.url).toBe('/shows/42/seasons/2');
    expect(season.params()).toEqual({ path: { showId: 42, season: 2 }, query: {} });
    expect(() => season.createUrlTree({ path: { showId: 42 } } as never)).toThrow(
      /serialize path parameter 'season' was invalid/,
    );
  });

  it('applies a codec to each placeholder in one route path', async () => {
    const definition = defineAppRouter(RouteNames, {
      routes: [
        {
          path: 'shows/:showId/seasons/:season',
          routeName: RouteNames.SEASON,
          pathParam: {
            showId: { codec: numberCodec() },
            season: { codec: numberCodec() },
          },
          component: EmptyComponent,
        },
      ],
    });
    const { appRouter, router } = setup(definition);
    const season = appRouter.routes.SEASON;

    await season.navigate({ path: { showId: 42, season: 3 } });
    expect(router.url).toBe('/shows/42/seasons/3');
    expect(season.params().path).toEqual({ showId: 42, season: 3 });
  });

  it('encodes one supplied path value as one URL segment', () => {
    const definition = defineAppRouter(RouteNames, {
      routes: [{ path: 'items/:id', routeName: RouteNames.ITEM, component: EmptyComponent }],
    });
    const { appRouter, router } = setup(definition);

    expect(
      router.serializeUrl(appRouter.routes.ITEM.createUrlTree({ path: { id: 'a/b?c' } })),
    ).toBe('/items/a%2Fb%3Fc');
  });

  it('inherits query definitions through unnamed ancestors and allows path/query name overlap', async () => {
    const definition = defineAppRouter(RouteNames, {
      routes: [
        {
          path: 'shows/:showId',
          pathParam: { showId: { codec: numberCodec() } },
          queryParams: { showId: queryParam({ codec: stringCodec() }) },
          children: [
            {
              path: 'episodes/:episodeId',
              routeName: RouteNames.EPISODE,
              pathParam: { episodeId: { codec: numberCodec() } },
              component: EmptyComponent,
            },
          ],
        },
      ],
    });
    const { appRouter, router } = setup(definition);
    const episode = appRouter.routes.EPISODE;

    await episode.navigate({ path: { showId: 8, episodeId: 5 }, query: { showId: 'latest' } });
    expect(router.url).toBe('/shows/8/episodes/5?showId=latest');
    expect(episode.params()).toEqual({
      path: { showId: 8, episodeId: 5 },
      query: { showId: 'latest' },
    });
  });

  it('reports the deepest active candidate and uses an empty-path named child as landing content', async () => {
    const definition = defineAppRouter(RouteNames, {
      routes: [
        {
          path: 'shows/:showId',
          routeName: RouteNames.SHOW,
          pathParam: { showId: { codec: numberCodec() } },
          children: [
            { path: '', routeName: RouteNames.SHOW_LANDING, component: EmptyComponent },
            {
              path: 'episodes/:episodeId',
              routeName: RouteNames.EPISODE,
              pathParam: { episodeId: { codec: numberCodec() } },
              component: EmptyComponent,
            },
          ],
        },
      ],
    });
    const { appRouter, router } = setup(definition);
    const { SHOW, SHOW_LANDING, EPISODE } = appRouter.routes;
    const active = appRouter.activeRoute({ show: SHOW, landing: SHOW_LANDING, episode: EPISODE });

    await SHOW.navigate({ path: { showId: 17 } });
    expect(active()).toMatchObject({ route: 'landing', node: SHOW_LANDING });
    expect(active().params).toEqual({ path: { showId: 17 }, query: {} });
    const landingTree = active().createUrlTree({ fragment: 'cast' });
    expect(router.serializeUrl(landingTree!)).toBe('/shows/17#cast');
    await EPISODE.navigate({ path: { showId: 17, episodeId: 4 } });
    expect(active()).toMatchObject({ route: 'episode', node: EPISODE });
    const episodeTree = active().createUrlTree({ fragment: 'recap' });
    expect(router.serializeUrl(episodeTree!)).toBe('/shows/17/episodes/4#recap');
    await SHOW_LANDING.navigate({ path: { showId: 17 } });
    expect(active()).toMatchObject({ route: 'landing', node: SHOW_LANDING });
  });

  it('selects candidates keyed by symbols', async () => {
    const definition = defineAppRouter(RouteNames, {
      routes: [{ path: 'items', routeName: RouteNames.ITEMS, component: EmptyComponent }],
    });
    const { appRouter } = setup(definition);
    const items = Symbol('items');
    const active = appRouter.activeRoute({ [items]: appRouter.routes.ITEMS });

    await appRouter.routes.ITEMS.navigate();
    expect(active().route).toBe(items);
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
      "routeName 'ITEM' at routes[0] is not a value of the route names passed to defineAppRouter(). Add it to the route names.",
    );
  });

  it('uses Angular matching to distinguish named routes with the same URL', async () => {
    const definition = defineAppRouter(RouteNames, {
      routes: [
        {
          path: 'dashboard',
          routeName: RouteNames.ADMIN,
          canMatch: [() => false],
          component: EmptyComponent,
        },
        { path: 'dashboard', routeName: RouteNames.USER, component: EmptyComponent },
      ],
    });
    const { appRouter, router } = setup(definition);
    const active = appRouter.activeRoute({
      admin: appRouter.routes.ADMIN,
      user: appRouter.routes.USER,
    });

    expect(router.serializeUrl(appRouter.routes.ADMIN.createUrlTree())).toBe('/dashboard');
    expect(router.serializeUrl(appRouter.routes.USER.createUrlTree())).toBe('/dashboard');
    await appRouter.routes.ADMIN.navigate({}, { replaceUrl: true });
    expect(active().route).toBe('user');
    expect(() => appRouter.routes.ADMIN.params()).toThrow(/inactive/);
  });

  it('reads ancestor path values with emptyOnly inheritance and preserves unknown query keys in patches', async () => {
    const definition = defineAppRouter(RouteNames, {
      routerConfig: {
        paramsInheritanceStrategy: 'emptyOnly',
        defaultQueryParamsHandling: 'merge',
      },
      routes: [
        {
          path: 'teams/:teamId',
          component: LayoutComponent,
          pathParam: { codec: numberCodec() },
          children: [
            {
              path: 'members/:memberId',
              routeName: RouteNames.MEMBER,
              pathParam: { codec: numberCodec() },
              queryParams: { search: queryParam({ codec: stringCodec() }) },
              component: EmptyComponent,
            },
          ],
        },
      ],
    });
    const { appRouter, router } = setup(definition);
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
    const definition = defineAppRouter(RouteNames, {
      routes: [
        {
          path: 'results',
          routeName: RouteNames.RESULTS,
          queryParams: { search: queryParam({ codec: stringCodec(), defaultValue: '' }) },
          component: EmptyComponent,
        },
      ],
    });
    const { appRouter, router } = setup(definition);
    await router.navigateByUrl('/results?unknown=keep');
    const form = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(appRouter.routes.RESULTS),
    );
    form.patchValue({ search: 'new' });
    await vi.waitFor(() => expect(router.url).toBe('/results?unknown=keep&search=new'));
  });

  it('uses a default for malformed URL query data but does not match an invalid path value', async () => {
    const definition = defineAppRouter(RouteNames, {
      routes: [
        {
          path: 'items/:id',
          routeName: RouteNames.ITEM,
          pathParam: { codec: numberCodec() },
          queryParams: { page: queryParam({ codec: numberCodec(), defaultValue: 1 }) },
          component: EmptyComponent,
          canMatch: [() => true],
        },
        { path: 'items/:slug', routeName: RouteNames.DETAIL, component: EmptyComponent },
      ],
      diagnostics: { warn: () => undefined },
    });
    const { appRouter, router } = setup(definition);

    await router.navigateByUrl('/items/5?page=nope');
    expect(appRouter.routes.ITEM.params()).toEqual({ path: { id: 5 }, query: { page: 1 } });
    await router.navigateByUrl('/items/nope?page=2');
    expect(appRouter.routes.DETAIL.params().path).toEqual({ slug: 'nope' });
    expect(() => appRouter.routes.ITEM.params()).toThrow(/is inactive/);
  });

  it('rejects invalid named definitions and handles failed serialization without navigation', async () => {
    expect(() =>
      defineAppRouter(RouteNames, {
        routes: [
          {
            matcher: () => null,
            children: [
              { path: 'profile/:userId', routeName: RouteNames.PROFILE, component: EmptyComponent },
            ],
          },
        ],
      }),
    ).toThrow(/PROFILE: ancestor 1 must have a statically known primary path/);
    expect(() =>
      defineAppRouter(RouteNames, {
        routes: [
          {
            path: 'teams/:id',
            children: [
              { path: 'members/:id', routeName: RouteNames.MEMBER, component: EmptyComponent },
            ],
          },
        ],
      }),
    ).toThrow(
      "MEMBER: path parameter 'id' appears in both 'teams/:id' and 'members/:id'. Rename one so params().path can hold both values.",
    );
    expect(() =>
      defineAppRouter(RouteNames, {
        routes: [
          {
            path: 'teams',
            queryParams: { search: queryParam({ codec: stringCodec() }) },
            children: [
              {
                path: 'members',
                routeName: RouteNames.MEMBER,
                queryParams: {
                  // @ts-expect-error duplicate inherited query keys are rejected by the type layer
                  search: queryParam({ codec: stringCodec() }),
                },
                component: EmptyComponent,
              },
            ],
          },
        ],
      }),
    ).toThrow(/query parameter 'search' is defined in both/);
    expect(() =>
      defineAppRouter(RouteNames, {
        routes: [
          {
            path: 'items/:id/:id',
            routeName: RouteNames.ITEM,
            pathParam: { id: { codec: numberCodec() } },
            component: EmptyComponent,
          },
        ],
      }),
    ).toThrow(/path parameter 'id' appears in both/i);
    expect(() =>
      defineAppRouter(RouteNames, {
        routes: [
          {
            path: 'items/:id',
            routeName: RouteNames.ITEM,
            pathParam: { id: { codec: numberCodec() }, extra: { codec: stringCodec() } } as never,
            component: EmptyComponent,
          },
        ],
      }),
    ).toThrow(/pathParam|placeholder/i);

    const diagnostics: unknown[] = [];
    const definition = defineAppRouter(RouteNames, {
      routes: [
        {
          path: 'items/:id',
          routeName: RouteNames.ITEM,
          pathParam: { id: { codec: numberCodec() } },
          queryParams: {
            search: queryParam({ codec: numberCodec() }),
            page: queryParam({ codec: numberCodec() }),
          },
          component: EmptyComponent,
        },
      ],
      diagnostics: { warn: (diagnostic) => diagnostics.push(diagnostic) },
    });
    const { appRouter, router } = setup(definition);
    const item = appRouter.routes.ITEM;
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl');

    expect(() => item.createUrlTree({ path: { id: 'invalid' as never } })).toThrow(
      /ITEM: serialize path parameter 'id' was invalid/,
    );
    await expect(item.navigate({ path: { id: 'invalid' as never } })).rejects.toThrow(
      /serialize path parameter 'id'/,
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
    const definition = defineAppRouter(RouteNames, {
      routes: [
        { path: 'items', routeName: RouteNames.ITEMS, component: EmptyComponent },
        { path: 'about', routeName: RouteNames.ABOUT, component: EmptyComponent },
      ],
    });
    const { appRouter, router } = setup(definition);
    const items = appRouter.escapeHatch.isActive(appRouter.routes.ITEMS.createUrlTree());

    await router.navigateByUrl('/items');
    expect(items()).toBe(true);
    await router.navigateByUrl('/about');
    expect(items()).toBe(false);
  });
});
