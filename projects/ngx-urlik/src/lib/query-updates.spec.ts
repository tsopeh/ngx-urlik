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

  it('runs same-turn writes against the latest committed query', async () => {
    const { app, router } = setup();
    await router.navigateByUrl('/results?search=a');
    const first = app.routes.RESULTS.patchQuery((query) => ({ search: `${query.search}b` }));
    const second = app.routes.RESULTS.patchQuery((query) => ({ search: `${query.search}c` }));

    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(router.url).toBe('/results?search=abc');
  });

  it('shares ordering across parent and child nodes', async () => {
    const { app, router } = setup();
    await router.navigateByUrl('/results?locale=en&search=old');
    const first = app.routes.RESULTS.patchQuery({ search: 'new' });
    const second = app.routes.ROOT.patchQuery({ locale: 'fr' });

    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(router.url).toBe('/results?locale=fr&search=new');
  });

  it('cancels waiting writes when an external navigation begins', async () => {
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
    const updater = vi.fn(() => ({ locale: 'fr' }));
    const waiting = app.routes.ROOT.patchQuery(updater);
    const leaving = router.navigateByUrl('/other');
    release.resolve(true);

    expect(await Promise.all([active, leaving, waiting])).toEqual([false, true, false]);
    expect(updater).not.toHaveBeenCalled();
    expect(router.url).toBe('/other');
  });

  it('continues with later writes after a guard rejects one', async () => {
    const { app, router } = setup((route) => route.queryParamMap.get('search') !== 'blocked');
    await router.navigateByUrl('/results?search=old');
    const rejected = app.routes.RESULTS.patchQuery({ search: 'blocked' });
    const next = app.routes.ROOT.patchQuery({ locale: 'fr' });

    expect(await Promise.all([rejected, next])).toEqual([false, true]);
    expect(router.url).toBe('/results?search=old&locale=fr');
  });

  it('continues with later writes after Angular skips the same URL', async () => {
    const { app, router } = setup();
    await router.navigateByUrl('/results?search=old');
    const skipped = app.routes.RESULTS.patchQuery({ search: 'old' });
    const next = app.routes.ROOT.patchQuery({ locale: 'fr' });

    expect(await Promise.all([skipped, next])).toEqual([false, true]);
    expect(router.url).toBe('/results?search=old&locale=fr');
  });

  it('cancels waiting writes when a guard redirects the active write', async () => {
    let router!: Router;
    const setupResult = setup((route) =>
      route.queryParamMap.get('search') === 'redirect' ? router.parseUrl('/other') : true,
    );
    router = setupResult.router;
    const { app } = setupResult;
    await router.navigateByUrl('/results?search=old');
    const redirected = app.routes.RESULTS.patchQuery({ search: 'redirect' });
    const updater = vi.fn(() => ({ locale: 'fr' }));
    const waiting = app.routes.ROOT.patchQuery(updater);

    expect(await Promise.all([redirected, waiting])).toEqual([true, false]);
    expect(updater).not.toHaveBeenCalled();
    expect(router.url).toBe('/other');
  });

  it('settles active and waiting writes as false when the router is destroyed', async () => {
    const entered = deferred<void>();
    let hold = false;
    const { app, router } = setup(() => {
      if (!hold) return true;
      entered.resolve();
      return new Promise<boolean>(() => {});
    });
    await router.navigateByUrl('/results?search=old');
    hold = true;
    const active = app.routes.RESULTS.patchQuery({ search: 'new' });
    await entered.promise;
    const updater = vi.fn(() => ({ locale: 'fr' }));
    const waiting = app.routes.ROOT.patchQuery(updater);
    TestBed.resetTestingModule();

    expect(await Promise.all([active, waiting])).toEqual([false, false]);
    expect(updater).not.toHaveBeenCalled();
    expect(await app.routes.ROOT.patchQuery({ locale: 'de' })).toBe(false);
  });

  it('uses fresh URL state even if equality retains an older signal value', async () => {
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
