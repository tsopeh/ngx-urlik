import { Component, computed, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { AppRouterDiagnostic, defineAppRouter } from './app-router';
import { listCodec, numberCodec, queryParam, stringCodec } from './params';

@Component({ template: '' })
class Page {}

const definitions = {
  timeRange: queryParam({ codec: stringCodec(), defaultValue: 'week' }),
  count: queryParam({ codec: numberCodec() }),
  ids: queryParam({ codec: listCodec(numberCodec(), ','), defaultValue: [] }),
};

function setup() {
  const diagnostics: AppRouterDiagnostic[] = [];
  const guardReads: unknown[] = [];
  const definition = defineAppRouter(
    { PAGE: RouteNames.PAGE, ITEM: RouteNames.ITEM },
    {
      diagnostics: { warn: (diagnostic) => diagnostics.push(diagnostic) },
      routes: [
        { path: 'page', routeName: RouteNames.PAGE, queryParams: definitions, component: Page },
        { path: 'other', component: Page },
        {
          // An unnamed layout route: global reads see its placeholder too.
          path: 'w/:workspaceId',
          children: [
            { path: 'items/:itemId', routeName: RouteNames.ITEM, component: Page },
            { path: 'settings', component: Page },
          ],
        },
        { path: 'blocked', component: Page, canActivate: [() => false] },
        {
          path: 'guarded/:workspaceId',
          component: Page,
          canActivate: [
            (route: ActivatedRouteSnapshot) => {
              guardReads.push(
                inject(definition.AppRouter).globalParamsSnapshot(
                  { path: { workspaceId: stringCodec() }, query: { count: definitions.count } },
                  route,
                ),
              );
              return true;
            },
          ],
        },
      ],
    },
  );
  TestBed.configureTestingModule({
    providers: [definition.provideAppRouter()],
  });
  return {
    appRouter: TestBed.inject(definition.AppRouter),
    router: TestBed.inject(Router),
    diagnostics,
    guardReads,
  };
}

enum RouteNames {
  A = 'A',
  ABOUT = 'ABOUT',
  B = 'B',
  CATALOG = 'CATALOG',
  CHILD = 'CHILD',
  HOME = 'HOME',
  ITEM = 'ITEM',
  ITEMS = 'ITEMS',
  MOVIES = 'MOVIES',
  PAGE = 'PAGE',
  RESULTS = 'RESULTS',
  ROOT = 'ROOT',
  SEASONS = 'SEASONS',
}

describe('global params', () => {
  it('reads query fields on every route and uses defaults', async () => {
    const { appRouter, router } = setup();
    const global = appRouter.globalParams({ query: definitions });
    expect(global()).toEqual({
      path: {},
      query: { timeRange: 'week', count: null, ids: [] },
    });

    await router.navigateByUrl('/page?timeRange=day&count=1&count=2&ids=3,4');
    expect(global().query).toEqual(appRouter.routes.PAGE.params().query);
    expect(global().query).toEqual({ timeRange: 'day', count: 2, ids: [3, 4] });

    await router.navigateByUrl('/other?timeRange=month');
    expect(global().query.timeRange).toBe('month');
    expect(global().query.count).toBeNull();
  });

  it('keeps overlapping observers independent and reports malformed input', async () => {
    const { appRouter, router, diagnostics } = setup();
    const numeric = appRouter.globalParams({ query: definitions });
    const text = appRouter.globalParams({ query: { count: queryParam({ codec: stringCodec() }) } });

    await router.navigateByUrl('/page?count=oops&ids=1,x');
    expect(numeric().query.count).toBeNull();
    expect(numeric().query.ids).toEqual([]);
    expect(text().query.count).toBe('oops');
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ route: 'globalParams', parameter: 'count' }),
        expect.objectContaining({ route: 'globalParams', parameter: 'ids' }),
      ]),
    );
  });

  it('holds committed state when a navigation is blocked', async () => {
    const { appRouter, router } = setup();
    await router.navigateByUrl('/page?count=1');
    const global = appRouter.globalParams({ query: definitions });
    const observed = computed(() => global());
    const before = observed();

    expect(await router.navigateByUrl('/blocked?count=9')).toBe(false);
    expect(observed()).toBe(before);
    expect(global().query).toEqual(appRouter.routes.PAGE.params().query);
  });

  it('reads a placeholder from whichever active route has it, and null elsewhere', async () => {
    const { appRouter, router } = setup();
    const global = appRouter.globalParams({
      path: { workspaceId: stringCodec(), itemId: numberCodec() },
    });
    expect(global().path).toEqual({ workspaceId: null, itemId: null });

    await router.navigateByUrl('/w/acme/items/7');
    expect(global().path).toEqual({ workspaceId: 'acme', itemId: 7 });

    await router.navigateByUrl('/w/beta/settings');
    expect(global().path).toEqual({ workspaceId: 'beta', itemId: null });

    await router.navigateByUrl('/other');
    expect(global().path).toEqual({ workspaceId: null, itemId: null });
  });

  it('reads a path value its own codec rejects as null, and reports it', async () => {
    const { appRouter, router, diagnostics } = setup();
    const global = appRouter.globalParams({ path: { workspaceId: numberCodec() } });

    await router.navigateByUrl('/w/acme/settings');
    expect(global().path.workspaceId).toBeNull();
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'PARAM_DESERIALIZE_FAILED',
        route: 'globalParams',
        parameter: 'workspaceId',
      }),
    ]);
  });

  it('reads the destination once in a guard with globalParamsSnapshot()', async () => {
    const { appRouter, router, guardReads } = setup();
    const global = appRouter.globalParams({ path: { workspaceId: stringCodec() } });
    await router.navigateByUrl('/w/acme/settings');

    await router.navigateByUrl('/guarded/beta?count=3');
    expect(guardReads).toEqual([{ path: { workspaceId: 'beta' }, query: { count: 3 } }]);
    expect(global().path.workspaceId).toBe('beta');
  });
});
