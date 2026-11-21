import { Component, computed, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CanActivateFn, NavigationStart, Router } from '@angular/router';
import { defineAppRouter } from './app-router';
import { numberCodec, queryParam, stringCodec } from './params';

@Component({ template: '' })
class Page {}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function setup(guard: CanActivateFn = () => true) {
  const definition = defineAppRouter(
    { ROOT: RouteNames.ROOT, RESULTS: RouteNames.RESULTS, OTHER: RouteNames.OTHER },
    {
      routes: [
        {
          path: '',
          routeName: RouteNames.ROOT,
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
    },
  );
  TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
  return { appRouter: TestBed.inject(definition.AppRouter), router: TestBed.inject(Router) };
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
    const { appRouter, router } = setup();
    await router.navigateByUrl('/results?locale=en&search=old&campaign=summer#section');
    const starts: string[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        starts.push(event.url);
      }
    });

    expect(await appRouter.routes.RESULTS.patchQuery({ locale: 'fr', search: 'new' })).toBe(true);
    expect(starts).toEqual(['/results?locale=fr&search=new&campaign=summer#section']);
    await appRouter.routes.RESULTS.patchQuery({ search: undefined });
    expect(router.url).toContain('search=new');
    await appRouter.routes.RESULTS.patchQuery({ search: null });
    expect(router.url).toBe('/results?locale=fr&campaign=summer#section');
  });

  it('resolves true without navigating when the URL would stay the same', async () => {
    const { appRouter, router } = setup();
    await router.navigateByUrl('/results?search=elm');
    const starts: string[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        starts.push(event.url);
      }
    });

    expect(await appRouter.routes.RESULTS.patchQuery({ search: 'elm' })).toBe(true);
    expect(await appRouter.routes.RESULTS.patchQuery({ locale: null })).toBe(true);
    expect(starts).toEqual([]);
  });

  it("doesn't change params() for a patch the URL already holds", async () => {
    const { appRouter, router } = setup();
    await router.navigateByUrl('/results?search=elm');
    const results = appRouter.routes.RESULTS;
    let runs = 0;
    const query = computed(() => {
      runs++;
      return results.params().query;
    });
    const before = results.params();
    query();

    await results.patchQuery({ search: 'elm' });
    expect(results.params()).toBe(before);
    query();
    expect(runs).toBe(1);
  });

  // A navigation that no patch started is the user's, like a link or Back, so a patch never
  // cancels it.
  it("resolves false without navigating while a navigation it didn't start runs", async () => {
    const release = deferred<boolean>();
    const { appRouter, router } = setup((route) =>
      route.queryParamMap.get('search') === 'oak' ? release.promise : true,
    );
    await router.navigateByUrl('/results?search=elm');

    const away = router.navigateByUrl('/results?search=oak');
    const patch = appRouter.routes.RESULTS.patchQuery({ search: 'fir' });
    const back = appRouter.routes.RESULTS.patchQuery({ search: 'elm' });
    release.resolve(true);

    expect(await Promise.all([away, patch, back])).toEqual([true, false, false]);
    expect(router.url).toBe('/results?search=oak');
  });

  it('leaves a typed navigation running', async () => {
    const release = deferred<boolean>();
    const { appRouter, router } = setup((route) =>
      route.queryParamMap.get('search') === 'oak' ? release.promise : true,
    );
    await router.navigateByUrl('/results');
    const results = appRouter.routes.RESULTS;

    const away = results.navigate({ query: { search: 'oak' } });
    const patch = results.patchQuery({ search: 'fir' });
    release.resolve(true);

    expect(await Promise.all([away, patch])).toEqual([true, false]);
    expect(router.url).toBe('/results?search=oak');
  });

  it("passes navigation options through to Angular's router", async () => {
    const { appRouter, router } = setup();
    await router.navigateByUrl('/results');
    const extras: unknown[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        extras.push(router.currentNavigation()?.extras);
      }
    });

    await appRouter.routes.RESULTS.patchQuery(
      { search: 'elm' },
      { replaceUrl: true, state: { from: 'sidebar' }, info: 'filters' },
    );
    expect(extras).toEqual([
      expect.objectContaining({ replaceUrl: true, state: { from: 'sidebar' }, info: 'filters' }),
    ]);
  });

  it('adds the history entry a carried write asked for, and takes the other options from the later write', async () => {
    const { appRouter, router } = setup();
    await router.navigateByUrl('/results');
    const extras: unknown[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        extras.push(router.currentNavigation()?.extras);
      }
    });

    // Both writes replace, so the second replaces too.
    const first = appRouter.routes.RESULTS.patchQuery({ search: 'elm' }, { replaceUrl: true });
    const second = appRouter.routes.ROOT.patchQuery({ locale: 'fr' }, { replaceUrl: true });
    await Promise.all([first, second]);
    // The first write adds an entry, so the second, which carries it, adds one too.
    const third = appRouter.routes.RESULTS.patchQuery({ search: 'oak' });
    const fourth = appRouter.routes.ROOT.patchQuery(
      { locale: 'de' },
      { replaceUrl: true, state: { from: 'sidebar' } },
    );
    await Promise.all([third, fourth]);

    expect(extras).toEqual([
      expect.objectContaining({ replaceUrl: true }),
      expect.objectContaining({ replaceUrl: true }),
      expect.not.objectContaining({ replaceUrl: true }),
      expect.objectContaining({ replaceUrl: false, state: { from: 'sidebar' } }),
    ]);
    expect(router.url).toBe('/results?search=oak&locale=de');
  });

  // A patch made while another runs builds on where that one is going, so patches add up, and the
  // later one wins on a field they share.
  it('lets the later of two writes in the same turn win on a field they share', async () => {
    const { appRouter, router } = setup();
    await router.navigateByUrl('/results?search=a');
    const results = appRouter.routes.RESULTS;
    const first = results.patchQuery({ search: `${results.params().query.search}b` });
    const second = results.patchQuery({ search: `${results.params().query.search}c` });

    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(router.url).toBe('/results?search=ac');
  });

  it('fails an overtaken write when a guard declines the write that carried it', async () => {
    const { appRouter, router } = setup((route) => route.queryParamMap.get('locale') !== 'fr');
    await router.navigateByUrl('/results?search=old');
    const first = appRouter.routes.RESULTS.patchQuery({ search: 'new' });
    const second = appRouter.routes.ROOT.patchQuery({ locale: 'fr' });

    // The guard declines the second write, so the search it carried doesn't reach the URL either.
    expect(await Promise.all([first, second])).toEqual([false, false]);
    expect(router.url).toBe('/results?search=old');
  });

  it('writes a field back to its URL value while another write runs', async () => {
    const { appRouter, router } = setup();
    await router.navigateByUrl('/results?search=old');
    const results = appRouter.routes.RESULTS;
    const first = results.patchQuery({ search: 'new' });
    const second = results.patchQuery({ search: 'old' });

    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(router.url).toBe('/results?search=old');
  });

  it('joins a running write that goes to the same URL', async () => {
    const { appRouter, router } = setup();
    await router.navigateByUrl('/results');
    const starts: string[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        starts.push(event.url);
      }
    });
    const results = appRouter.routes.RESULTS;
    const first = results.patchQuery({ search: 'new' });
    const second = results.patchQuery({ search: 'new' });

    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(starts).toEqual(['/results?search=new']);
  });

  it('adds up a child route write and a parent route write in the same turn', async () => {
    const { appRouter, router } = setup();
    await router.navigateByUrl('/results?locale=en&search=old');
    const first = appRouter.routes.RESULTS.patchQuery({ search: 'new' });
    const second = appRouter.routes.ROOT.patchQuery({ locale: 'fr' });

    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(router.url).toBe('/results?locale=fr&search=new');
  });

  it('cancels running writes when a router navigation starts', async () => {
    const entered = deferred<void>();
    const release = deferred<boolean>();
    let hold = false;
    const { appRouter, router } = setup(() => {
      if (!hold) {
        return true;
      }
      entered.resolve();
      return release.promise;
    });
    await router.navigateByUrl('/results?search=old');
    hold = true;
    const active = appRouter.routes.RESULTS.patchQuery({ search: 'new' });
    await entered.promise;
    const second = appRouter.routes.ROOT.patchQuery({ locale: 'fr' });
    const leaving = router.navigateByUrl('/other');
    release.resolve(true);

    expect(await Promise.all([active, second, leaving])).toEqual([false, false, true]);
    expect(router.url).toBe('/other');
  });

  it('carries a redirected write into a later write, which the guard redirects too', async () => {
    const { appRouter, router } = setup((route) =>
      route.queryParamMap.get('search') === 'redirect' ? inject(Router).parseUrl('/other') : true,
    );
    await router.navigateByUrl('/results?search=old');
    const redirected = appRouter.routes.RESULTS.patchQuery({ search: 'redirect' });
    const second = appRouter.routes.ROOT.patchQuery({ locale: 'fr' });

    // Angular resolves a redirected navigation as the redirect resolves.
    expect(await Promise.all([redirected, second])).toEqual([true, true]);
    expect(router.url).toBe('/other');
  });

  it("doesn't decode or warn on untouched query parameters", async () => {
    const diagnostics: unknown[] = [];
    const definition = defineAppRouter(
      { RESULTS: RouteNames.RESULTS },
      {
        diagnostics: { warn: (diagnostic) => diagnostics.push(diagnostic) },
        routes: [
          {
            path: 'results',
            routeName: RouteNames.RESULTS,
            queryParams: {
              search: queryParam({ codec: stringCodec() }),
              page: queryParam({ codec: numberCodec(), defaultValue: 1 }),
            },
            component: Page,
          },
        ],
      },
    );
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const router = TestBed.inject(Router);
    const results = TestBed.inject(definition.AppRouter).routes.RESULTS;
    await router.navigateByUrl('/results?page=bad&search=old');

    expect(await results.patchQuery({ search: 'new' })).toBe(true);
    expect(router.url).toBe('/results?page=bad&search=new');
    expect(diagnostics).toEqual([]);
  });

  it('clears pending state when a navigation rejects', async () => {
    const { appRouter, router } = setup((route) => {
      if (route.queryParamMap.get('search') === 'boom') {
        throw new Error('guard failed');
      }
      return true;
    });
    await router.navigateByUrl('/results?search=old');
    const results = appRouter.routes.RESULTS;

    await expect(results.patchQuery({ search: 'boom' })).rejects.toThrow('guard failed');
    expect(await results.patchQuery({ search: 'ok' })).toBe(true);
    expect(router.url).toBe('/results?search=ok');
  });
});
