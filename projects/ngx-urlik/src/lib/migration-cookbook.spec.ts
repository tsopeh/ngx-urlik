import { Component, EnvironmentProviders, InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, Routes } from '@angular/router';
import {
  defineAppRouter,
  numberCodec,
  queryParam,
  repeatedQueryParam,
  stringCodec,
} from 'ngx-urlik';

@Component({ template: '' })
class Page {}

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Layout {}

function setup<T>(definition: {
  AppRouter: InjectionToken<T>;
  provideAppRouter: () => EnvironmentProviders;
}) {
  TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
  return {
    appRouter: TestBed.inject(definition.AppRouter),
    router: TestBed.inject(Router),
  };
}

enum RouteNames {
  A = 'A',
  ABOUT = 'ABOUT',
  ADMIN = 'ADMIN',
  B = 'B',
  CATALOG = 'CATALOG',
  CHILD = 'CHILD',
  DETAIL = 'DETAIL',
  HOME = 'HOME',
  ITEM = 'ITEM',
  ITEMS = 'ITEMS',
  LANDING = 'LANDING',
  MEMBER = 'MEMBER',
  MEMBERS = 'MEMBERS',
  MOVIES = 'MOVIES',
  RESULTS = 'RESULTS',
  ROOT = 'ROOT',
  SEASONS = 'SEASONS',
  USER = 'USER',
}

describe('migration cookbook', () => {
  it('1. accepts ordinary Angular Routes without naming anything', async () => {
    const routes: Routes = [
      { path: '', pathMatch: 'full', redirectTo: 'catalog' },
      { path: 'catalog', component: Page },
      { path: 'lazy', loadChildren: async () => [{ path: '', component: Page }] },
      { path: '**', component: Page },
    ];
    const { appRouter, router } = setup(defineAppRouter(RouteNames, { routes }));

    expect(Object.keys(appRouter.routes)).toEqual([]);
    expect(router.config).toEqual(routes);
    await router.navigateByUrl('/');
    expect(router.url).toBe('/catalog');
    await router.navigateByUrl('/lazy');
    expect(router.url).toBe('/lazy');
    await router.navigateByUrl('/missing');
    expect(router.url).toBe('/missing');
  });

  it('2. names one route without changing its Angular neighbors', async () => {
    // Keep this array literal so TypeScript can infer CATALOG from routeName.
    const definition = defineAppRouter(RouteNames, {
      routes: [
        { path: '', pathMatch: 'full', redirectTo: 'catalog' },
        { path: 'catalog', routeName: RouteNames.CATALOG, title: 'Catalog', component: Page },
        { path: '**', component: Page },
      ],
    });
    const { appRouter, router } = setup(definition);
    const catalog = appRouter.routes.CATALOG;

    expect(Object.keys(appRouter.routes)).toEqual(['CATALOG']);
    expect(router.config[1]).toMatchObject({ path: 'catalog', title: 'Catalog' });
    expect('routeName' in router.config[1]).toBe(false);
    expect(router.serializeUrl(catalog.createUrlTree())).toBe('/catalog');
    expect(await catalog.navigate()).toBe(true);
    expect(catalog.params()).toEqual({ path: {}, query: {} });
  });

  it('3. reads a typed path value from an unnamed parent', async () => {
    const definition = defineAppRouter(RouteNames, {
      routerConfig: { paramsInheritanceStrategy: 'emptyOnly' },
      routes: [
        {
          path: 'teams/:teamId',
          pathParam: { codec: numberCodec() },
          component: Layout,
          children: [{ path: 'members/:memberId', routeName: RouteNames.MEMBER, component: Page }],
        },
      ],
    });
    const { appRouter, router } = setup(definition);
    const member = appRouter.routes.MEMBER;

    expect(Object.keys(appRouter.routes)).toEqual(['MEMBER']);
    expect(await member.navigate({ path: { teamId: 4, memberId: 'alice' } })).toBe(true);
    expect(router.url).toBe('/teams/4/members/alice');
    expect(member.params().path).toEqual({ teamId: 4, memberId: 'alice' });
    member.params().path.teamId satisfies number;
    member.params().path.memberId satisfies string;
  });

  it('4. adds query fields without taking over unrelated URL keys', async () => {
    const definition = defineAppRouter(RouteNames, {
      routerConfig: { defaultQueryParamsHandling: 'merge' },
      routes: [
        {
          path: 'teams/:id',
          pathParam: { codec: numberCodec() },
          queryParams: { id: queryParam({ codec: stringCodec() }) },
          children: [
            {
              path: 'members',
              routeName: RouteNames.MEMBERS,
              queryParams: {
                search: queryParam({ codec: stringCodec(), defaultValue: '' }),
                tags: repeatedQueryParam({ codec: stringCodec() }),
              },
              component: Page,
            },
          ],
        },
      ],
    });
    const { appRouter, router } = setup(definition);
    const members = appRouter.routes.MEMBERS;

    await router.navigateByUrl('/teams/7/members?unknown=keep&id=campaign&tags=a&tags=b');
    expect(members.params()).toEqual({
      path: { id: 7 },
      query: { id: 'campaign', search: '', tags: ['a', 'b'] },
    });
    expect(
      router.serializeUrl(members.createUrlTree({ path: { id: 7 }, query: { search: 'new' } })),
    ).toBe('/teams/7/members?search=new');

    expect(await members.patchQuery({ search: 'new' })).toBe(true);
    expect(router.parseUrl(router.url).queryParams).toEqual({
      unknown: 'keep',
      id: 'campaign',
      tags: ['a', 'b'],
      search: 'new',
    });
  });

  it('5. uses the matched Angular route, then the deepest named child', async () => {
    const definition = defineAppRouter(RouteNames, {
      routes: [
        {
          path: 'dashboard',
          routeName: RouteNames.ADMIN,
          canMatch: [() => false],
          component: Page,
        },
        {
          path: 'dashboard',
          routeName: RouteNames.USER,
          children: [{ path: '', routeName: RouteNames.LANDING, component: Page }],
        },
      ],
    });
    const { appRouter, router } = setup(definition);
    const { ADMIN, USER, LANDING } = appRouter.routes;
    const active = appRouter.activeRoute({ admin: ADMIN, user: USER, landing: LANDING });

    expect(Object.keys(appRouter.routes)).toEqual(['ADMIN', 'USER', 'LANDING']);
    expect(router.serializeUrl(ADMIN.createUrlTree())).toBe('/dashboard');
    expect(router.serializeUrl(LANDING.createUrlTree())).toBe('/dashboard');
    expect(await USER.navigate()).toBe(true);
    expect(active()).toMatchObject({ route: 'landing', node: LANDING });
    expect(() => ADMIN.params()).toThrow(/inactive/);
  });

  it('6. reports route names and path names that cannot be typed safely', () => {
    expect(() =>
      defineAppRouter(RouteNames, {
        routes: [
          { path: 'left', children: [{ path: 'item', routeName: RouteNames.DETAIL }] },
          { path: 'right', children: [{ path: 'item', routeName: RouteNames.DETAIL }] },
        ],
      }),
    ).toThrow(
      /routeName 'DETAIL' is used by both routes\[0\]\.children\[0\] and routes\[1\]\.children\[0\]/,
    );

    expect(() =>
      defineAppRouter(RouteNames, {
        routes: [
          {
            path: 'teams/:id',
            children: [{ path: 'members/:id', routeName: RouteNames.MEMBER }],
          },
        ],
      }),
    ).toThrow(
      "MEMBER: path parameter 'id' appears in both 'teams/:id' and 'members/:id'. Rename one so params().path can hold both values.",
    );
  });
});
