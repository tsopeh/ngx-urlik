import { Component, EnvironmentProviders, inject, InjectionToken, NgModule } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  Router,
  RouterFeatures,
  RouterModule,
  RouterOutlet,
  Routes,
  withRouterConfig,
} from '@angular/router';
import { defineAppRouter, listCodec, numberCodec, queryParam, stringCodec } from 'ngx-urlik';

@Component({ template: '' })
class Page {}

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Layout {}

function setup<T>(
  definition: {
    AppRouter: InjectionToken<T>;
    provideAppRouter: (...features: RouterFeatures[]) => EnvironmentProviders;
  },
  ...features: RouterFeatures[]
) {
  TestBed.configureTestingModule({ providers: [definition.provideAppRouter(...features)] });
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

// How to move an Angular app to ngx-urlik, one step per test, in the order you'd do them. The app
// works after every step.
describe('moving an app over', () => {
  // Start here. Nothing has a name yet, so every route behaves exactly as it did.
  it('1. takes your Angular routes as they are', async () => {
    const routes: Routes = [
      { path: '', pathMatch: 'full', redirectTo: 'catalog' },
      { path: 'catalog', component: Page },
      { path: 'lazy', loadChildren: async () => [{ path: '', component: Page }] },
      { path: '**', component: Page },
    ];
    const { appRouter, router } = setup(defineAppRouter({}, { routes }));

    expect(Object.keys(appRouter.routes)).toEqual([]);
    expect(router.config).toMatchObject(routes);
    await router.navigateByUrl('/');
    expect(router.url).toBe('/catalog');
    await router.navigateByUrl('/lazy');
    expect(router.url).toBe('/lazy');
    await router.navigateByUrl('/missing');
    expect(router.url).toBe('/missing');
  });

  // A name adds the route to AppRouter.routes. Write the array inside the call, because that's
  // where TypeScript reads CATALOG from.
  it('2. names one route, and leaves the routes around it alone', async () => {
    const definition = defineAppRouter(
      { CATALOG: RouteNames.CATALOG },
      {
        routes: [
          { path: '', pathMatch: 'full', redirectTo: 'catalog' },
          { path: 'catalog', routeName: RouteNames.CATALOG, title: 'Catalog', component: Page },
          { path: '**', component: Page },
        ],
      },
    );
    const { appRouter, router } = setup(definition);
    const catalog = appRouter.routes.CATALOG;

    expect(Object.keys(appRouter.routes)).toEqual(['CATALOG']);
    expect(router.config[1]).toMatchObject({ path: 'catalog', title: 'Catalog' });
    expect('routeName' in router.config[1]).toBe(false);
    expect(router.serializeUrl(catalog.createUrlTree())).toBe('/catalog');
    expect(await catalog.navigate()).toBe(true);
    expect(catalog.params()).toEqual({ path: {}, query: {} });
  });

  // The parent has no name, and MEMBER still reads its teamId as a number.
  it('3. gives a path value a codec, on a parent without a name', async () => {
    const definition = defineAppRouter(
      { MEMBER: RouteNames.MEMBER },
      {
        routes: [
          {
            path: 'teams/:teamId',
            pathParams: { teamId: numberCodec() },
            component: Layout,
            children: [
              { path: 'members/:memberId', routeName: RouteNames.MEMBER, component: Page },
            ],
          },
        ],
      },
    );
    const { appRouter, router } = setup(
      definition,
      withRouterConfig({ paramsInheritanceStrategy: 'emptyOnly' }),
    );
    const member = appRouter.routes.MEMBER;

    expect(Object.keys(appRouter.routes)).toEqual(['MEMBER']);
    expect(await member.navigate({ path: { teamId: 4, memberId: 'alice' } })).toBe(true);
    expect(router.url).toBe('/teams/4/members/alice');
    expect(member.params().path).toEqual({ teamId: 4, memberId: 'alice' });
    member.params().path.teamId satisfies number;
    member.params().path.memberId satisfies string;
  });

  // A link holds only what you pass. A patch changes its own fields and keeps `unknown=keep`.
  it('4. declares query fields, and leaves every other URL key alone', async () => {
    const definition = defineAppRouter(
      { MEMBERS: RouteNames.MEMBERS },
      {
        routes: [
          {
            path: 'teams/:id',
            pathParams: { id: numberCodec() },
            queryParams: { id: queryParam({ codec: stringCodec() }) },
            children: [
              {
                path: 'members',
                routeName: RouteNames.MEMBERS,
                queryParams: {
                  search: queryParam({ codec: stringCodec(), defaultValue: '' }),
                  tags: queryParam({ codec: listCodec(stringCodec(), ','), defaultValue: [] }),
                },
                component: Page,
              },
            ],
          },
        ],
      },
    );
    const { appRouter, router } = setup(
      definition,
      withRouterConfig({ defaultQueryParamsHandling: 'merge' }),
    );
    const members = appRouter.routes.MEMBERS;

    await router.navigateByUrl('/teams/7/members?unknown=keep&id=campaign&tags=a,b');
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
      tags: 'a,b',
      search: 'new',
    });
  });

  // ADMIN and USER have the same path. Angular picks USER, so USER and its child are active.
  it('5. lets Angular pick between two routes with the same path', async () => {
    const definition = defineAppRouter(
      { ADMIN: RouteNames.ADMIN, USER: RouteNames.USER, LANDING: RouteNames.LANDING },
      {
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
      },
    );
    const { appRouter, router } = setup(definition);
    const { ADMIN, USER, LANDING } = appRouter.routes;

    expect(Object.keys(appRouter.routes)).toEqual(['ADMIN', 'USER', 'LANDING']);
    expect(router.serializeUrl(ADMIN.createUrlTree())).toBe('/dashboard');
    expect(router.serializeUrl(LANDING.createUrlTree())).toBe('/dashboard');
    expect(await USER.navigate()).toBe(true);
    expect([ADMIN.ifActive(), USER.ifActive(), LANDING.ifActive()]).toEqual([null, USER, LANDING]);
    expect(() => ADMIN.params()).toThrow(/isn't active/);
  });

  // Both mistakes throw when the app starts, with a message that names the routes.
  it('6. refuses a route name used twice, and a placeholder used twice on the way down', () => {
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
      /routeName 'DETAIL' is used by both routes\[0\]\.children\[0\] and routes\[1\]\.children\[0\]/,
    );

    expect(() =>
      defineAppRouter(
        { MEMBER: RouteNames.MEMBER },
        {
          routes: [
            {
              path: 'teams/:id',
              children: [{ path: 'members/:id', routeName: RouteNames.MEMBER }],
            },
          ],
        },
      ),
    ).toThrow(
      "MEMBER: path parameter 'id' appears in both 'teams/:id' and 'members/:id'. Rename one, because params().path holds one value per name.",
    );
  });

  // `settings` still loads with loadChildren, and the typed link to `results` works beside it.
  it("7. works in an NgModule app, next to a lazy feature you haven't moved yet", async () => {
    // This step shows an NgModule app, so the component isn't standalone on purpose.
    // eslint-disable-next-line @angular-eslint/prefer-standalone
    @Component({ standalone: false, template: '<a [routerLink]="link">Results</a>' })
    class Nav {
      readonly link = inject(definition.AppRouter).routes.RESULTS.createUrlTree({
        query: { minRating: 4 },
      });
    }

    const definition = defineAppRouter(
      { RESULTS: RouteNames.RESULTS },
      {
        routes: [
          {
            path: 'results',
            routeName: RouteNames.RESULTS,
            queryParams: { minRating: queryParam({ codec: numberCodec(), defaultValue: 0 }) },
            component: Page,
          },
          { path: 'settings', loadChildren: async () => [{ path: '', component: Page }] },
        ],
      },
    );

    @NgModule({
      declarations: [Nav],
      imports: [RouterModule],
      providers: [definition.provideAppRouter()],
    })
    class AppModule {}

    TestBed.configureTestingModule({ imports: [AppModule] });
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(Nav);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe(
      '/results?minRating=4',
    );
    await router.navigateByUrl('/settings');
    expect(router.url).toBe('/settings');
  });

  // The spread routes work, but TypeScript can't check them, so move them over when you can.
  it("8. puts named routes in front of a Routes array you haven't moved yet", async () => {
    const existingRoutes: Routes = [
      { path: 'catalog', component: Page },
      { path: '**', component: Page },
    ];
    const definition = defineAppRouter(
      { RESULTS: RouteNames.RESULTS },
      {
        routes: [
          { path: 'results', routeName: RouteNames.RESULTS, component: Page },
          ...existingRoutes,
        ],
      },
    );
    const { appRouter, router } = setup(definition);

    expect(await appRouter.routes.RESULTS.navigate()).toBe(true);
    expect(router.url).toBe('/results');
    await router.navigateByUrl('/catalog');
    // The catalog route matches, not the wildcard after it.
    expect(router.routerState.snapshot.root.firstChild?.routeConfig?.path).toBe('catalog');
  });
});
