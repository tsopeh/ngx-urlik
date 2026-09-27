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
    const definition = defineAppRouter({ routes });
    const { appRouter, router } = setup(definition);

    expect(appRouter.routes).toEqual({});
    expect(router.config).toEqual(routes);
  });

  it('creates a flat node for each unique route name, including nested named routes', () => {
    const definition = defineAppRouter({
      routes: [
        {
          path: 'shows/:showId',
          routeName: 'SHOW',
          pathParam: { showId: { codec: numberCodec() } },
          children: [
            {
              path: 'seasons/:season',
              routeName: 'SEASON',
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
    expect(router.serializeUrl(SHOW.createUrlTree({ path: { showId: 12 } })!)).toBe('/shows/12');
    expect(router.serializeUrl(SEASON.createUrlTree({ path: { showId: 12, season: 3 } })!)).toBe(
      '/shows/12/seasons/3',
    );
  });

  it('rejects a route name reused in another branch when the router is defined', () => {
    expect(() =>
      defineAppRouter({
        routes: [
          { path: 'left', children: [{ path: 'item', routeName: 'DETAIL' }] },
          { path: 'right', children: [{ path: 'item', routeName: 'DETAIL' }] },
        ],
      }),
    ).toThrow(
      "routeName 'DETAIL' is used by both routes[0].children[0] and routes[1].children[0]. Give each named route a different routeName.",
    );
  });

  it('requires and decodes every placeholder, including those on unnamed ancestors', async () => {
    const definition = defineAppRouter({
      routes: [
        {
          path: 'shows/:showId',
          pathParam: { showId: { codec: numberCodec() } },
          children: [
            {
              path: 'seasons/:season',
              routeName: 'SEASON',
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
    expect(season.createUrlTree({ path: { showId: 42 } } as never)).toBeNull();
  });

  it('applies a codec to each placeholder in one route path', async () => {
    const definition = defineAppRouter({
      routes: [
        {
          path: 'shows/:showId/seasons/:season',
          routeName: 'SEASON',
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
    const definition = defineAppRouter({
      routes: [{ path: 'items/:id', routeName: 'ITEM', component: EmptyComponent }],
    });
    const { appRouter, router } = setup(definition);

    expect(
      router.serializeUrl(appRouter.routes.ITEM.createUrlTree({ path: { id: 'a/b?c' } })!),
    ).toBe('/items/a%2Fb%3Fc');
  });

  it('inherits query definitions through unnamed ancestors and allows path/query name overlap', async () => {
    const definition = defineAppRouter({
      routes: [
        {
          path: 'shows/:showId',
          pathParam: { showId: { codec: numberCodec() } },
          queryParams: { showId: queryParam({ codec: stringCodec() }) },
          children: [
            {
              path: 'episodes/:episodeId',
              routeName: 'EPISODE',
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
    const definition = defineAppRouter({
      routes: [
        {
          path: 'shows/:showId',
          routeName: 'SHOW',
          pathParam: { showId: { codec: numberCodec() } },
          children: [
            { path: '', routeName: 'SHOW_LANDING', component: EmptyComponent },
            {
              path: 'episodes/:episodeId',
              routeName: 'EPISODE',
              pathParam: { episodeId: { codec: numberCodec() } },
              component: EmptyComponent,
            },
          ],
        },
      ],
    });
    const { appRouter } = setup(definition);
    const { SHOW, SHOW_LANDING, EPISODE } = appRouter.routes;
    const active = appRouter.activeRoute({ show: SHOW, landing: SHOW_LANDING, episode: EPISODE });

    await SHOW.navigate({ path: { showId: 17 } });
    expect(active()).toMatchObject({ route: 'landing', node: SHOW_LANDING });
    expect(active().params).toEqual({ path: { showId: 17 }, query: {} });
    await EPISODE.navigate({ path: { showId: 17, episodeId: 4 } });
    expect(active()).toMatchObject({ route: 'episode', node: EPISODE });
    await SHOW_LANDING.navigate({ path: { showId: 17 } });
    expect(active()).toMatchObject({ route: 'landing', node: SHOW_LANDING });
  });

  it('uses Angular matching to distinguish named routes with the same URL', async () => {
    const definition = defineAppRouter({
      routes: [
        {
          path: 'dashboard',
          routeName: 'ADMIN',
          canMatch: [() => false],
          component: EmptyComponent,
        },
        { path: 'dashboard', routeName: 'USER', component: EmptyComponent },
      ],
    });
    const { appRouter, router } = setup(definition);
    const active = appRouter.activeRoute({
      admin: appRouter.routes.ADMIN,
      user: appRouter.routes.USER,
    });

    expect(router.serializeUrl(appRouter.routes.ADMIN.createUrlTree()!)).toBe('/dashboard');
    expect(router.serializeUrl(appRouter.routes.USER.createUrlTree()!)).toBe('/dashboard');
    await appRouter.routes.ADMIN.navigate();
    expect(active().route).toBe('user');
    expect(() => appRouter.routes.ADMIN.params()).toThrow(/inactive/);
  });

  it('reads ancestor path values with emptyOnly inheritance and preserves unknown query keys in patches', async () => {
    const definition = defineAppRouter({
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
              routeName: 'MEMBER',
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
    expect(router.serializeUrl(member.createUrlTree({ path: { teamId: 3, memberId: 4 } })!)).toBe(
      '/teams/3/members/4',
    );
    await member.patchQuery({ search: 'new' });
    expect(router.url).toBe('/teams/3/members/4?unknown=keep&search=new');
  });

  it('binds a query form to a named route node', async () => {
    const definition = defineAppRouter({
      routes: [
        {
          path: 'results',
          routeName: 'RESULTS',
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

  it('fails clearly if named route configurations are replaced', async () => {
    const definition = defineAppRouter({
      routes: [{ path: 'movies', routeName: 'MOVIES', component: EmptyComponent }],
    });
    const { appRouter, router } = setup(definition);
    const movies = appRouter.routes.MOVIES;
    expect(movies.createUrlTree()).not.toBeNull();
    await movies.navigate();
    expect(movies.params()).toEqual({ path: {}, query: {} });
    const active = appRouter.activeRoute({ movies });
    expect(active().route).toBe('movies');

    router.resetConfig([{ path: 'movies', component: EmptyComponent }]);
    expect(() => movies.createUrlTree()).toThrow(/route configuration was replaced/);
    expect(() => movies.navigate()).toThrow(/route configuration was replaced/);
    expect(() => movies.params()).toThrow(/route configuration was replaced/);
    expect(() => active()).toThrow(/route configuration was replaced/);
  });

  it('uses a default for malformed URL query data but rejects an invalid active path read', async () => {
    const definition = defineAppRouter({
      routes: [
        {
          path: 'items/:id',
          routeName: 'ITEM',
          pathParam: { codec: numberCodec() },
          queryParams: { page: queryParam({ codec: numberCodec(), defaultValue: 1 }) },
          component: EmptyComponent,
        },
      ],
      diagnostics: { warn: () => undefined },
    });
    const { appRouter, router } = setup(definition);

    await router.navigateByUrl('/items/5?page=nope');
    expect(appRouter.routes.ITEM.params()).toEqual({ path: { id: 5 }, query: { page: 1 } });
    await router.navigateByUrl('/items/nope?page=2');
    expect(() => appRouter.routes.ITEM.params()).toThrow(/could not resolve 'id'/);
  });

  it('rejects invalid named definitions and handles failed serialization without navigation', async () => {
    expect(() =>
      defineAppRouter({
        routes: [
          {
            matcher: () => null,
            children: [
              { path: 'profile/:userId', routeName: 'PROFILE', component: EmptyComponent },
            ],
          },
        ],
      }),
    ).toThrow(/PROFILE: ancestor 1 must have a statically known primary path/);
    expect(() =>
      defineAppRouter({
        routes: [
          {
            path: 'teams/:id',
            children: [{ path: 'members/:id', routeName: 'MEMBER', component: EmptyComponent }],
          },
        ],
      }),
    ).toThrow(
      "MEMBER: path parameter 'id' appears in both 'teams/:id' and 'members/:id'. Rename one so params().path can hold both values.",
    );
    expect(() =>
      defineAppRouter({
        routes: [
          {
            path: 'teams',
            queryParams: { search: queryParam({ codec: stringCodec() }) },
            children: [
              {
                path: 'members',
                routeName: 'MEMBER',
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
      defineAppRouter({
        routes: [
          {
            path: 'items/:id/:id',
            routeName: 'ITEM',
            pathParam: { id: { codec: numberCodec() } },
            component: EmptyComponent,
          },
        ],
      }),
    ).toThrow(/path parameter 'id' appears in both/i);
    expect(() =>
      defineAppRouter({
        routes: [
          {
            path: 'items/:id',
            routeName: 'ITEM',
            pathParam: { id: { codec: numberCodec() }, extra: { codec: stringCodec() } } as never,
            component: EmptyComponent,
          },
        ],
      }),
    ).toThrow(/pathParam|placeholder/i);

    const diagnostics: unknown[] = [];
    const definition = defineAppRouter({
      routes: [
        {
          path: 'items/:id',
          routeName: 'ITEM',
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

    expect(item.createUrlTree({ path: { id: 'invalid' as never } })).toBeNull();
    expect(await item.navigate({ path: { id: 'invalid' as never } })).toBe(false);
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(
      router.serializeUrl(
        item.createUrlTree({ path: { id: 1 }, query: { search: 'invalid' as never, page: 2 } })!,
      ),
    ).toBe('/items/1?page=2');
    expect(diagnostics.length).toBeGreaterThan(0);
  });
});
