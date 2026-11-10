import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CanActivateFn, NavigationStart, Router } from '@angular/router';
import { defineAppRouter } from './app-router';
import { queryParam, stringCodec } from './params';

@Component({ template: '' })
class Page {}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function setup(guard: CanActivateFn = () => true, isEqual?: (a: unknown, b: unknown) => boolean) {
  const definition = defineAppRouter(RouteNames, {
    routes: [
      {
        path: '',
        routeName: RouteNames.ROOT,
        isEqual,
        queryParams: { locale: queryParam({ codec: stringCodec() }) },
        children: [
          {
            path: 'results',
            routeName: RouteNames.RESULTS,
            queryParams: { search: queryParam({ codec: stringCodec() }) },
            component: Page,
            canActivate: [guard],
            runGuardsAndResolvers: 'always' as const,
          },
          { path: 'other', routeName: RouteNames.OTHER, component: Page },
        ],
      },
    ],
  });
  TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
  return { app: TestBed.inject(definition.AppRouter), router: TestBed.inject(Router) };
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
  OTHER = 'OTHER',
  RESULTS = 'RESULTS',
  ROOT = 'ROOT',
  SEASONS = 'SEASONS',
}

describe('query writes', () => {
  it('patches declared fields in one navigation and keeps unrelated URL state', async () => {
    const { app, router } = setup();
    await router.navigateByUrl('/results?locale=en&search=old&campaign=summer#section');
    const starts: string[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) starts.push(event.url);
    });

    expect(await app.routes.RESULTS.patchQuery({ locale: 'fr', search: 'new' })).toBe(true);
    expect(starts).toEqual(['/results?locale=fr&search=new&campaign=summer#section']);
    await app.routes.RESULTS.patchQuery({ search: undefined });
    expect(router.url).toContain('search=new');
    await app.routes.RESULTS.patchQuery({ search: null });
    expect(router.url).toBe('/results?locale=fr&campaign=summer#section');
  });

  it("passes navigation options through to Angular's router", async () => {
    const { app, router } = setup();
    await router.navigateByUrl('/results');
    const extras: unknown[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) extras.push(router.currentNavigation()?.extras);
    });

    await app.routes.RESULTS.patchQuery(
      { search: 'elm' },
      { replaceUrl: true, state: { from: 'sidebar' }, info: 'filters' },
    );
    expect(extras).toEqual([
      expect.objectContaining({ replaceUrl: true, state: { from: 'sidebar' }, info: 'filters' }),
    ]);
  });

  // Like router.navigate(), a patch reads the committed query when called, and the newest
  // navigation wins.
  it('cancels the first of two writes started in the same turn', async () => {
    const { app, router } = setup();
    await router.navigateByUrl('/results?search=a');
    const results = app.routes.RESULTS;
    const first = results.patchQuery({ search: `${results.params().query.search}b` });
    const second = results.patchQuery({ search: `${results.params().query.search}c` });

    expect(await Promise.all([first, second])).toEqual([false, true]);
    expect(router.url).toBe('/results?search=ac');
  });

  it('cancels a child route write when a parent route writes in the same turn', async () => {
    const { app, router } = setup();
    await router.navigateByUrl('/results?locale=en&search=old');
    const first = app.routes.RESULTS.patchQuery({ search: 'new' });
    const second = app.routes.ROOT.patchQuery({ locale: 'fr' });

    expect(await Promise.all([first, second])).toEqual([false, true]);
    expect(router.url).toBe('/results?locale=fr&search=old');
  });

  it('cancels running writes when a router navigation starts', async () => {
    const entered = deferred<void>();
    const release = deferred<boolean>();
    let hold = false;
    const { app, router } = setup(() => {
      if (!hold) return true;
      entered.resolve();
      return release.promise;
    });
    await router.navigateByUrl('/results?search=old');
    hold = true;
    const active = app.routes.RESULTS.patchQuery({ search: 'new' });
    await entered.promise;
    const second = app.routes.ROOT.patchQuery({ locale: 'fr' });
    const leaving = router.navigateByUrl('/other');
    release.resolve(true);

    expect(await Promise.all([active, second, leaving])).toEqual([false, false, true]);
    expect(router.url).toBe('/other');
  });

  it('cancels a redirected write when a later write starts', async () => {
    let router!: Router;
    const setupResult = setup((route) =>
      route.queryParamMap.get('search') === 'redirect' ? router.parseUrl('/other') : true,
    );
    router = setupResult.router;
    const { app } = setupResult;
    await router.navigateByUrl('/results?search=old');
    const redirected = app.routes.RESULTS.patchQuery({ search: 'redirect' });
    const second = app.routes.ROOT.patchQuery({ locale: 'fr' });

    expect(await Promise.all([redirected, second])).toEqual([false, true]);
    expect(router.url).toBe('/results?search=old&locale=fr');
  });

  it('merges into the URL even when equality keeps an older signal value', async () => {
    const { app, router } = setup(undefined, () => true);
    await router.navigateByUrl('/results?locale=en&search=old');
    const results = app.routes.RESULTS;
    expect(results.params().query.search).toBe('old');
    await results.patchQuery({ search: 'new' });
    expect(results.params().query.search).toBe('old');
    await results.patchQuery({ locale: 'fr' });
    expect(router.url).toBe('/results?locale=fr&search=new');
  });
});
