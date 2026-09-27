import { Component, computed, inject, InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AppRouterDiagnostic, defineAppRouter } from './app-router';
import {
  delimitedQueryParam,
  numberCodec,
  queryParam,
  repeatedQueryParam,
  stringCodec,
} from './params';

@Component({ template: '' })
class Page {}

const fallback = new InjectionToken<string>('fallback');
const definitions = {
  timeRange: queryParam({ codec: stringCodec(), defaultValue: () => inject(fallback) }),
  count: queryParam({ codec: numberCodec() }),
  tags: repeatedQueryParam({ codec: stringCodec() }),
  ids: delimitedQueryParam({ codec: numberCodec(), separator: ',' }),
};

function setup() {
  const diagnostics: AppRouterDiagnostic[] = [];
  const definition = defineAppRouter(RouteNames, {
    diagnostics: { warn: (diagnostic) => diagnostics.push(diagnostic) },
    routes: [
      { path: 'page', routeName: RouteNames.PAGE, queryParams: definitions, component: Page },
      { path: 'other', component: Page },
      { path: 'blocked', component: Page, canActivate: [() => false] },
    ],
  });
  TestBed.configureTestingModule({
    providers: [definition.provideAppRouter(), { provide: fallback, useValue: 'week' }],
  });
  return { app: TestBed.inject(definition.AppRouter), router: TestBed.inject(Router), diagnostics };
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

describe('global query observation', () => {
  it('reads query fields on every route and uses injection-aware defaults', async () => {
    const { app, router } = setup();
    const global = app.globalQueryParams(definitions);
    expect(global()).toEqual({ timeRange: 'week', count: null, tags: [], ids: [] });

    await router.navigateByUrl('/page?timeRange=day&count=1&count=2&tags=a&tags=b&ids=3,4');
    expect(global()).toEqual(app.routes.PAGE.params().query);
    expect(global()).toEqual({ timeRange: 'day', count: 2, tags: ['a', 'b'], ids: [3, 4] });

    await router.navigateByUrl('/other?timeRange=month');
    expect(global().timeRange).toBe('month');
    expect(global().count).toBeNull();
  });

  it('keeps overlapping observers independent and reports malformed input', async () => {
    const { app, router, diagnostics } = setup();
    const numeric = app.globalQueryParams(definitions);
    const text = app.globalQueryParams({ count: queryParam({ codec: stringCodec() }) });

    await router.navigateByUrl('/page?count=oops&ids=1&ids=2');
    expect(numeric().count).toBeNull();
    expect(numeric().ids).toEqual([]);
    expect(text().count).toBe('oops');
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ route: 'globalQueryParams', parameter: 'count' }),
        expect.objectContaining({ route: 'globalQueryParams', parameter: 'ids' }),
      ]),
    );
  });

  it('holds committed state when a navigation is blocked', async () => {
    const { app, router } = setup();
    await router.navigateByUrl('/page?count=1');
    const global = app.globalQueryParams(definitions);
    const observed = computed(() => global());
    const before = observed();

    expect(await router.navigateByUrl('/blocked?count=9')).toBe(false);
    expect(observed()).toBe(before);
    expect(global()).toEqual(app.routes.PAGE.params().query);
  });
});
